-- 0026_optimize_rls_and_collaborator_performance.sql
-- Elimina subqueries recursivas e lentidão em RLS para colaboradores

-- 1. Permitir leitura de perfis por todos os usuários autenticados (conforme PRD §3)
-- Evita depender de Edge Function para listar responsáveis/membros
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- 2. Índices de alta performance para checagens de acesso
CREATE INDEX IF NOT EXISTS idx_tasks_project_assigned ON public.tasks(project_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_project_members_user_project ON public.project_members(user_id, project_id);

-- 3. Trigger para manter project_members sincronizado com designações de tarefas
-- Garante que qualquer colaborador atribuído a uma tarefa já conste em project_members
CREATE OR REPLACE FUNCTION public.sync_task_assignees_to_project_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.project_members (project_id, user_id)
      VALUES (NEW.project_id, NEW.assigned_to)
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;

    IF NEW.assignees IS NOT NULL AND array_length(NEW.assignees, 1) > 0 THEN
      INSERT INTO public.project_members (project_id, user_id)
      SELECT NEW.project_id, u
      FROM unnest(NEW.assignees) AS u
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_task_assignees ON public.tasks;
CREATE TRIGGER trg_sync_task_assignees
  AFTER INSERT OR UPDATE OF project_id, assigned_to, assignees
  ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_assignees_to_project_members();

-- 4. Backfill de membros de projetos existentes baseados em tarefas
INSERT INTO public.project_members (project_id, user_id)
SELECT DISTINCT project_id, assigned_to
FROM public.tasks
WHERE project_id IS NOT NULL AND assigned_to IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO public.project_members (project_id, user_id)
SELECT DISTINCT t.project_id, u.user_id
FROM public.tasks t,
     LATERAL unnest(t.assignees) AS u(user_id)
WHERE t.project_id IS NOT NULL AND u.user_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 5. Atualizar can_access_project SEM varredura recursiva da tabela tasks
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
    );
$$;

-- 6. RLS otimizada e baseada em conjuntos para project_members
DROP POLICY IF EXISTS project_members_select ON public.project_members;
CREATE POLICY project_members_select ON public.project_members
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_member()
    OR user_id = auth.uid()
    OR project_id IN (
      SELECT pr.id FROM public.projects pr WHERE pr.owner_id = auth.uid()
      UNION
      SELECT pm2.project_id FROM public.project_members pm2 WHERE pm2.user_id = auth.uid()
    )
  );

-- 7. RLS otimizada e baseada em conjuntos para projects
DROP POLICY IF EXISTS projects_select_access ON public.projects;
CREATE POLICY projects_select_access ON public.projects
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_member()
    OR owner_id = auth.uid()
    OR id IN (
      SELECT pm.project_id FROM public.project_members pm
      WHERE pm.user_id = auth.uid()
    )
  );

-- 8. RLS otimizada e ultra-rápida para tasks (executada com SubPlan único em vez de N chamadas de função)
DROP POLICY IF EXISTS tasks_select_access ON public.tasks;
CREATE POLICY tasks_select_access ON public.tasks
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_member()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignees)
    OR created_by = auth.uid()
    OR project_id IN (
      SELECT pr.id FROM public.projects pr WHERE pr.owner_id = auth.uid()
      UNION
      SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tasks_insert_access ON public.tasks;
CREATE POLICY tasks_insert_access ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_member()
    OR project_id IS NULL
    OR project_id IN (
      SELECT pr.id FROM public.projects pr WHERE pr.owner_id = auth.uid()
      UNION
      SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tasks_update_access ON public.tasks;
CREATE POLICY tasks_update_access ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_member()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignees)
    OR created_by = auth.uid()
    OR project_id IN (
      SELECT pr.id FROM public.projects pr WHERE pr.owner_id = auth.uid()
      UNION
      SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin_or_member()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignees)
    OR created_by = auth.uid()
    OR project_id IN (
      SELECT pr.id FROM public.projects pr WHERE pr.owner_id = auth.uid()
      UNION
      SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tasks_delete_access ON public.tasks;
CREATE POLICY tasks_delete_access ON public.tasks
  FOR DELETE TO authenticated
  USING (
    public.is_admin_or_member()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR project_id IN (
      SELECT pr.id FROM public.projects pr WHERE pr.owner_id = auth.uid()
      UNION
      SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid()
    )
  );
