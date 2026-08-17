-- 0008_add_task_tags.sql
-- Adiciona suporte a tags nas tarefas

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_tasks_tags ON public.tasks USING GIN(tags);
