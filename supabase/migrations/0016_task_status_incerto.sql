-- 0016_task_status_incerto.sql
-- Adiciona o status 'uncertain' (label "Incerto") como primeira etapa, antes de 'backlog'.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('uncertain','backlog','todo','in_progress','review','done'));
