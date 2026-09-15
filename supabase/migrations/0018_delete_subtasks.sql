-- Deleta subtarefas em cascata quando a tarefa pai é deletada

-- 1. Índice para o cascade ser rápido
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id
  ON public.tasks (parent_task_id);

-- 2. Remove a constraint atual (se existir)
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_parent_task_id_fkey;

-- 3. Recria com ON DELETE CASCADE
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_parent_task_id_fkey
  FOREIGN KEY (parent_task_id)
  REFERENCES public.tasks (id)
  ON DELETE CASCADE;