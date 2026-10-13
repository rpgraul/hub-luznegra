-- 0021_task_status_financiamento.sql
-- Adiciona os status 'financing' ("Em Financiamento") e 'funded' ("Financiado"),
-- posicionados entre 'review' e 'done'.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('uncertain','backlog','todo','in_progress','review','financing','funded','done'));
