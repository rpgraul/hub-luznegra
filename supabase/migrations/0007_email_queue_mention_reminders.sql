-- 0007_email_queue_mention_reminders.sql
-- Fila de e-mails (Resend), menção @ em comentários e e-mail na atribuição.
-- A fila é drenada pelo Edge Function notify-due-tasks (cron a cada 5 min);
-- nenhum segredo live no banco: a chave Resend vive só em env var.

-- 1. task_id em notifications: permite deduplicar o lembrete de prazo
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_task_id ON public.notifications(task_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- 2. Fila de e-mails — somente service role / funções SECURITY DEFINER.
CREATE TABLE IF NOT EXISTS public.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
-- Sem policies: autenticados não podem tocar a fila (RLS bloqueia por padrão).
REVOKE ALL ON public.email_queue FROM anon, authenticated;

-- 3. Helper de escape para HTML simples de e-mail.
CREATE OR REPLACE FUNCTION public.html_escape(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(
    replace(
      replace(coalesce(p_text, ''), '&', '&amp;'),
      '<', '&lt;'
    ),
    '>', '&gt;'
  )
$$;

-- 4. Enfileira e-mail. Executado apenas por triggers/funções SECURITY DEFINER
--    (sem GRANT para autenticados: evita spam direto).
CREATE OR REPLACE FUNCTION public.enqueue_email(
  p_to TEXT,
  p_subject TEXT,
  p_html TEXT,
  p_task_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.email_queue (to_email, subject, html, task_id)
  VALUES (p_to, p_subject, p_html, p_task_id);
END;
$$;

-- 5. Atribuição: além da notificação in-app (0003), envia e-mail ao responsável.
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
  v_project_name TEXT;
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND NEW.assigned_to <> auth.uid()
     AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN

    INSERT INTO public.notifications (user_id, type, content, link, task_id)
    VALUES (
      NEW.assigned_to,
      'task_assigned',
      'Você foi atribuído à tarefa "' || NEW.title || '"',
      '/task/' || NEW.id,
      NEW.id
    );

    SELECT au.email
    INTO v_email
    FROM auth.users au
    WHERE au.id = NEW.assigned_to;

    SELECT name INTO v_project_name
    FROM public.projects
    WHERE id = NEW.project_id;

    IF v_email IS NOT NULL THEN
      PERFORM public.enqueue_email(
        v_email,
        'Nova tarefa atribuída a você',
        '<h2>Você foi atribuído a uma nova tarefa</h2>'
          || '<p><strong>' || public.html_escape(NEW.title) || '</strong></p>'
          || '<p>Projeto: ' || public.html_escape(v_project_name) || '</p>'
          || '<p><a href="https://hub.site-da-empresa.com.br/task/'
          || NEW.id || '">Abrir tarefa no Hub</a></p>',
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Menção @username em comentários: notificação in-app + e-mail ao mencionado.
--    Ignora auto-menção. Usernames são [a-z0-9_.]{3,} (case-insensitive).
CREATE OR REPLACE FUNCTION public.notify_comment_mention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mention RECORD;
  v_excerpt TEXT;
BEGIN
  FOR v_mention IN
    SELECT p.id, p.username, au.email, t.title
    FROM public.profiles p
    JOIN auth.users au ON au.id = p.id
    JOIN public.tasks t ON t.id = NEW.task_id
    WHERE p.id <> NEW.author_id
      AND NEW.content ~* (
        '(^|[^a-z0-9_.])@' || replace(p.username, '.', '\.') || '([^a-z0-9_.]|$)'
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, content, link, task_id)
    VALUES (
      v_mention.id,
      'mention',
      'Você foi mencionado na tarefa "' || v_mention.title || '"',
      '/task/' || NEW.task_id,
      NEW.task_id
    );

    IF v_mention.email IS NOT NULL THEN
      v_excerpt := public.html_escape(left(NEW.content, 280));
      PERFORM public.enqueue_email(
        v_mention.email,
        'Você foi mencionado em um comentário',
        '<h2>Você foi mencionado</h2>'
          || '<p>Na tarefa <strong>' || public.html_escape(v_mention.title)
          || '</strong>:</p>'
          || '<blockquote style="border-left:3px solid #ddd;padding-left:8px;">'
          || v_excerpt || '</blockquote>'
          || '<p><a href="https://hub.site-da-empresa.com.br/task/'
          || NEW.task_id || '">Abrir tarefa no Hub</a></p>',
        NEW.task_id
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_comment_mention_trigger ON public.task_comments;
CREATE TRIGGER notify_comment_mention_trigger
  AFTER INSERT ON public.task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_comment_mention();