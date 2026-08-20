-- Migration 0010: Notificações em Tempo Real (Supabase Realtime) e suporte a múltiplos assignees
-- 1. Habilita Realtime na tabela de notificações
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- 2. Atualiza a trigger de atribuição para suportar múltiplos assignees (array) ou assigned_to individual
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_assignee UUID;
  v_email TEXT;
  v_project_name TEXT;
  v_assignees_list UUID[];
BEGIN
  -- Monta lista unificada de assignees novos
  v_assignees_list := COALESCE(NEW.assignees, ARRAY[]::UUID[]);
  IF NEW.assigned_to IS NOT NULL AND NOT (NEW.assigned_to = ANY(v_assignees_list)) THEN
    v_assignees_list := array_append(v_assignees_list, NEW.assigned_to);
  END IF;

  -- Se não houver ninguém atribuído, encerra
  IF array_length(v_assignees_list, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_project_name
  FROM public.projects
  WHERE id = NEW.project_id;

  -- Itera por cada responsável
  FOREACH v_assignee IN ARRAY v_assignees_list
  LOOP
    -- Não notifica se o próprio autor da ação for o atribuído
    IF v_assignee <> auth.uid() THEN
      -- Se for UPDATE, só notifica se o usuário não estava atribuído antes
      IF TG_OP = 'INSERT' 
         OR (OLD.assignees IS NULL OR NOT (v_assignee = ANY(OLD.assignees)))
         OR (OLD.assigned_to IS DISTINCT FROM v_assignee) THEN

        -- Cria notificação in-app
        INSERT INTO public.notifications (user_id, type, content, link, task_id)
        VALUES (
          v_assignee,
          'task_assigned',
          'Você foi atribuído à tarefa "' || NEW.title || '"',
          '/task/' || NEW.id,
          NEW.id
        );

        -- Enfileira e-mail
        SELECT au.email INTO v_email
        FROM auth.users au
        WHERE au.id = v_assignee;

        IF v_email IS NOT NULL THEN
          PERFORM public.enqueue_email(
            v_email,
            'Nova tarefa atribuída a você',
            '<h2>Você foi atribuído a uma nova tarefa</h2>'
              || '<p><strong>' || public.html_escape(NEW.title) || '</strong></p>'
              || '<p>Projeto: ' || public.html_escape(v_project_name) || '</p>'
              || '<p><a href="https://hub.luznegra.com.br/task/'
              || NEW.id || '">Abrir tarefa no Hub</a></p>',
            NEW.id
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_task_assigned_trigger ON public.tasks;
CREATE TRIGGER notify_task_assigned_trigger
  AFTER INSERT OR UPDATE OF assigned_to, assignees ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();
