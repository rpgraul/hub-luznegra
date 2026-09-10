-- 0017_add_task_categories.sql
-- Adiciona a coluna de categorias nas tarefas (valores livres, múltiplos por tarefa).

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_tasks_categories ON public.tasks USING GIN(categories);
