-- ============================================================
-- 0004: Dashboard "todas as tarefas" + RLS aberto (equipe pequena)
-- ============================================================

-- Preferência persistente: ver todas as tarefas da equipe (default: só as suas).
ALTER TABLE public.user_preferences
  ADD COLUMN show_all_tasks BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- RLS: equipe pequena, "sem muita regra" — qualquer usuário
-- autenticado vê e edita tarefas de todos os projetos.
-- DELETE/archive de projeto continua restrito a owner/admin.
-- NOTA: sem INSERT em profiles (contas seguem via Admin API).
-- ============================================================

-- Projects: todos veem; criação por qualquer um (owner = próprio).
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select_all ON public.projects
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS projects_insert ON public.projects;
CREATE POLICY projects_insert_all ON public.projects
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Tasks: acesso total para authenticated (ver, criar, editar, excluir).
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select_all ON public.tasks
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert_all ON public.tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update_all ON public.tasks
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete_all ON public.tasks
  FOR DELETE USING (auth.role() = 'authenticated');

-- Comentários: todos veem e criam; editar/excluir segue do autor.
DROP POLICY IF EXISTS task_comments_select ON public.task_comments;
CREATE POLICY task_comments_select_all ON public.task_comments
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS task_comments_insert ON public.task_comments;
CREATE POLICY task_comments_insert_all ON public.task_comments
  FOR INSERT WITH CHECK (author_id = auth.uid());