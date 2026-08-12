-- 0003_task_assigned_notification.sql
-- Notificação in-app quando uma tarefa é atribuída a alguém.
-- SECURITY DEFINER: notificações não têm policy de INSERT para autenticados
-- (quem insere são as Edge Functions / triggers com privilégio elevado).

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND NEW.assigned_to <> auth.uid()
     AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    INSERT INTO public.notifications (user_id, type, content, link)
    VALUES (
      NEW.assigned_to,
      'task_assigned',
      'Você foi atribuído à tarefa "' || NEW.title || '"',
      '/task/' || NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_task_assigned_trigger ON public.tasks;
CREATE TRIGGER notify_task_assigned_trigger
  AFTER INSERT OR UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();