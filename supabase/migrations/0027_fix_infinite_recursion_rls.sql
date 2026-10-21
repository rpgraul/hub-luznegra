-- 0027_fix_infinite_recursion_rls.sql
-- Corrige recursão infinita de RLS restaurando o uso de funções SECURITY DEFINER

-- 1. Leitura aberta de perfis para autenticados (sem RLS recursiva)
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- 2. Função SECURITY DEFINER can_access_project (sem loop de RLS)
CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin_or_member()
    OR EXISTS (
      SELECT 1 FROM public.projects pr
      WHERE pr.id = p_project_id
        AND pr.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = p_project_id
        AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.project_id = p_project_id
        AND (t.assigned_to = auth.uid() OR auth.uid() = ANY(t.assignees))
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_project(UUID) TO authenticated;

-- 3. Políticas de projects
DROP POLICY IF EXISTS projects_select ON public.projects;
DROP POLICY IF EXISTS projects_select_all ON public.projects;
DROP POLICY IF EXISTS projects_select_access ON public.projects;
CREATE POLICY projects_select_access ON public.projects
  FOR SELECT TO authenticated
  USING (public.can_access_project(id));

-- 4. Políticas de project_members
DROP POLICY IF EXISTS project_members_select ON public.project_members;
CREATE POLICY project_members_select ON public.project_members
  FOR SELECT TO authenticated
  USING (public.can_access_project(project_id) OR user_id = auth.uid());

-- 5. Políticas de tasks
DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_select_all ON public.tasks;
DROP POLICY IF EXISTS tasks_select_access ON public.tasks;
CREATE POLICY tasks_select_access ON public.tasks
  FOR SELECT TO authenticated
  USING (
    project_id IS NULL
    OR public.is_admin_or_member()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignees)
    OR created_by = auth.uid()
    OR public.can_access_project(project_id)
  );

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_all ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_access ON public.tasks;
CREATE POLICY tasks_insert_access ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    project_id IS NULL
    OR public.can_access_project(project_id)
  );

DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_update_all ON public.tasks;
DROP POLICY IF EXISTS tasks_update_access ON public.tasks;
CREATE POLICY tasks_update_access ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    project_id IS NULL
    OR public.can_access_project(project_id)
  )
  WITH CHECK (
    project_id IS NULL
    OR public.can_access_project(project_id)
  );

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_all ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_access ON public.tasks;
CREATE POLICY tasks_delete_access ON public.tasks
  FOR DELETE TO authenticated
  USING (
    project_id IS NULL
    OR public.can_access_project(project_id)
  );
