-- 0023_collaborator_role_and_project_members.sql
-- Adiciona a role 'collaborator' e tabela project_members
-- Ajusta políticas de RLS para Admin, Membro e Colaborador

-- 1. Atualizar constraint de role em profiles
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND conname ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'member', 'collaborator'));
END $$;

-- 2. Tabela de membros/designações explícitas de projetos
CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;

-- 3. Funções auxiliares SECURITY DEFINER (sem recursão de RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'member')
  );
$$;

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

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_project(UUID) TO authenticated;

-- 4. RLS para project_members
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_members_select ON public.project_members;
CREATE POLICY project_members_select ON public.project_members
  FOR SELECT TO authenticated
  USING (public.can_access_project(project_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS project_members_insert ON public.project_members;
CREATE POLICY project_members_insert ON public.project_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_member());

DROP POLICY IF EXISTS project_members_update ON public.project_members;
CREATE POLICY project_members_update ON public.project_members
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_member())
  WITH CHECK (public.is_admin_or_member());

DROP POLICY IF EXISTS project_members_delete ON public.project_members;
CREATE POLICY project_members_delete ON public.project_members
  FOR DELETE TO authenticated
  USING (public.is_admin_or_member());

-- 5. RLS para projects
DROP POLICY IF EXISTS projects_select ON public.projects;
DROP POLICY IF EXISTS projects_select_all ON public.projects;
DROP POLICY IF EXISTS projects_select_access ON public.projects;
CREATE POLICY projects_select_access ON public.projects
  FOR SELECT TO authenticated
  USING (public.can_access_project(id));

DROP POLICY IF EXISTS projects_insert ON public.projects;
DROP POLICY IF EXISTS projects_insert_all ON public.projects;
DROP POLICY IF EXISTS projects_insert_team ON public.projects;
CREATE POLICY projects_insert_team ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_member() AND owner_id = auth.uid());

DROP POLICY IF EXISTS projects_update ON public.projects;
DROP POLICY IF EXISTS projects_update_team ON public.projects;
CREATE POLICY projects_update_team ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR (owner_id = auth.uid() AND public.is_admin_or_member()))
  WITH CHECK (public.is_admin() OR (owner_id = auth.uid() AND public.is_admin_or_member()));

DROP POLICY IF EXISTS projects_delete ON public.projects;
DROP POLICY IF EXISTS projects_delete_team ON public.projects;
CREATE POLICY projects_delete_team ON public.projects
  FOR DELETE TO authenticated
  USING (public.is_admin() OR (owner_id = auth.uid() AND public.is_admin_or_member()));

-- 6. RLS para tasks
DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_select_all ON public.tasks;
DROP POLICY IF EXISTS tasks_select_access ON public.tasks;
CREATE POLICY tasks_select_access ON public.tasks
  FOR SELECT TO authenticated
  USING (project_id IS NULL OR public.can_access_project(project_id));

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_all ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_access ON public.tasks;
CREATE POLICY tasks_insert_access ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (project_id IS NULL OR public.can_access_project(project_id));

DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_update_all ON public.tasks;
DROP POLICY IF EXISTS tasks_update_access ON public.tasks;
CREATE POLICY tasks_update_access ON public.tasks
  FOR UPDATE TO authenticated
  USING (project_id IS NULL OR public.can_access_project(project_id))
  WITH CHECK (project_id IS NULL OR public.can_access_project(project_id));

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_all ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_access ON public.tasks;
CREATE POLICY tasks_delete_access ON public.tasks
  FOR DELETE TO authenticated
  USING (public.is_admin_or_member() OR created_by = auth.uid());

-- 7. RLS para hub_documents (bloqueado para colaboradores)
DROP POLICY IF EXISTS hub_documents_select ON public.hub_documents;
DROP POLICY IF EXISTS hub_documents_select_team ON public.hub_documents;
CREATE POLICY hub_documents_select_team ON public.hub_documents
  FOR SELECT TO authenticated
  USING (public.is_admin_or_member());

DROP POLICY IF EXISTS hub_documents_insert ON public.hub_documents;
DROP POLICY IF EXISTS hub_documents_insert_team ON public.hub_documents;
CREATE POLICY hub_documents_insert_team ON public.hub_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_member());

DROP POLICY IF EXISTS hub_documents_update ON public.hub_documents;
DROP POLICY IF EXISTS hub_documents_update_team ON public.hub_documents;
CREATE POLICY hub_documents_update_team ON public.hub_documents
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_member())
  WITH CHECK (public.is_admin_or_member());

DROP POLICY IF EXISTS hub_documents_delete ON public.hub_documents;
DROP POLICY IF EXISTS hub_documents_delete_team ON public.hub_documents;
CREATE POLICY hub_documents_delete_team ON public.hub_documents
  FOR DELETE TO authenticated
  USING (public.is_admin_or_member());

-- 8. RLS para hub_vendors (bloqueado para colaboradores)
DROP POLICY IF EXISTS hub_vendors_select ON public.hub_vendors;
DROP POLICY IF EXISTS hub_vendors_select_team ON public.hub_vendors;
CREATE POLICY hub_vendors_select_team ON public.hub_vendors
  FOR SELECT TO authenticated
  USING (public.is_admin_or_member());

DROP POLICY IF EXISTS hub_vendors_insert ON public.hub_vendors;
DROP POLICY IF EXISTS hub_vendors_insert_team ON public.hub_vendors;
CREATE POLICY hub_vendors_insert_team ON public.hub_vendors
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_member());

DROP POLICY IF EXISTS hub_vendors_update ON public.hub_vendors;
DROP POLICY IF EXISTS hub_vendors_update_team ON public.hub_vendors;
CREATE POLICY hub_vendors_update_team ON public.hub_vendors
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_member())
  WITH CHECK (public.is_admin_or_member());

DROP POLICY IF EXISTS hub_vendors_delete ON public.hub_vendors;
DROP POLICY IF EXISTS hub_vendors_delete_team ON public.hub_vendors;
CREATE POLICY hub_vendors_delete_team ON public.hub_vendors
  FOR DELETE TO authenticated
  USING (public.is_admin_or_member());
