-- 0024_collaborator_can_create_projects.sql
-- Permite que colaboradores também criem projetos (owner_id = auth.uid()).
-- Projetos arquivados continuam inacessíveis para colaboradores.

DROP POLICY IF EXISTS projects_insert ON public.projects;
DROP POLICY IF EXISTS projects_insert_all ON public.projects;
DROP POLICY IF EXISTS projects_insert_team ON public.projects;

CREATE POLICY projects_insert_authenticated ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
