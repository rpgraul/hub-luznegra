-- 0025_tasks_soft_delete_and_lixeira.sql
-- Adiciona suporte a soft delete (lixeira) para recuperação de tarefas
-- e atualiza a política de DELETE para permitir que colaboradores excluam tarefas nos seus projetos.

-- 1. Coluna deleted_at em tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON public.tasks(deleted_at);

-- 2. Atualizar política de DELETE em tasks
-- Permite que colaboradores e membros excluam (ou limpem da lixeira) tarefas
-- dentro de qualquer projeto ao qual eles têm acesso.
DROP POLICY IF EXISTS tasks_delete ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_all ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_access ON public.tasks;

CREATE POLICY tasks_delete_access ON public.tasks
  FOR DELETE TO authenticated
  USING (project_id IS NULL OR public.can_access_project(project_id));
