-- 0014_notifications_delete_policy.sql
-- Adiciona política RLS para permitir que os usuários excluam suas próprias notificações

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;

CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE USING (user_id = auth.uid());
