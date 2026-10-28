-- 0031_collaborator_task_and_project_visibility.sql
-- 1. Visibilidade de projetos para colaboradores:
--    Colaboradores agora podem visualizar todos os projetos ativos (archived = false).
--    Projetos arquivados continuam restritos a administradores e membros internos.
-- 2. Visibilidade de tarefas para colaboradores:
--    Colaboradores visualizam APENAS tarefas onde estão atribuídos (assigned_to ou assignees),
--    OU tarefas filhas (subtarefas recursivas) de tarefas onde estão atribuídos.
-- 3. Storage de avatares:
--    Permite que administradores enviem, atualizem e excluam avatares de qualquer usuário.

-- ============================================================
-- 1. Políticas de Projects
-- ============================================================
DROP POLICY IF EXISTS projects_select ON public.projects;
DROP POLICY IF EXISTS projects_select_all ON public.projects;
DROP POLICY IF EXISTS projects_select_access ON public.projects;

CREATE POLICY projects_select_access ON public.projects
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_member()
    OR archived = false
  );

-- ============================================================
-- 2. Políticas de Project Members
-- ============================================================
DROP POLICY IF EXISTS project_members_select ON public.project_members;

CREATE POLICY project_members_select ON public.project_members
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 3. Função auxiliar recursiva para visibilidade de tarefas
-- ============================================================
-- Verifica se a tarefa ou algum de seus ancestrais possui o usuário atribuído
CREATE OR REPLACE FUNCTION public.is_collaborator_task_visible(p_task_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE task_ancestors AS (
    -- Inicia na tarefa indicada
    SELECT id, parent_id, assigned_to, assignees
    FROM public.tasks
    WHERE id = p_task_id
    UNION ALL
    -- Percorre para cima os pais na hierarquia
    SELECT p.id, p.parent_id, p.assigned_to, p.assignees
    FROM public.tasks p
    JOIN task_ancestors a ON a.parent_id = p.id
  )
  SELECT EXISTS (
    SELECT 1 FROM task_ancestors
    WHERE assigned_to = p_user_id
       OR p_user_id = ANY(assignees)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_collaborator_task_visible(UUID, UUID) TO authenticated;

-- ============================================================
-- 4. Políticas de Tasks
-- ============================================================
DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_select_all ON public.tasks;
DROP POLICY IF EXISTS tasks_select_access ON public.tasks;

CREATE POLICY tasks_select_access ON public.tasks
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_member()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignees)
    OR (
      parent_id IS NOT NULL
      AND public.is_collaborator_task_visible(parent_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_all ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_access ON public.tasks;

CREATE POLICY tasks_insert_access ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_member()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignees)
    OR (
      parent_id IS NOT NULL
      AND public.is_collaborator_task_visible(parent_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_update_all ON public.tasks;
DROP POLICY IF EXISTS tasks_update_access ON public.tasks;

CREATE POLICY tasks_update_access ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_member()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignees)
    OR (
      parent_id IS NOT NULL
      AND public.is_collaborator_task_visible(parent_id, auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin_or_member()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignees)
    OR (
      parent_id IS NOT NULL
      AND public.is_collaborator_task_visible(parent_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_all ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_access ON public.tasks;

CREATE POLICY tasks_delete_access ON public.tasks
  FOR DELETE TO authenticated
  USING (
    public.is_admin_or_member()
    OR created_by = auth.uid()
  );

-- ============================================================
-- 5. Storage RLS para bucket 'avatars'
-- ============================================================
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_admin_or_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_admin_or_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_admin_or_own" ON storage.objects;

CREATE POLICY "avatars_insert_admin_or_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR name LIKE (auth.uid()::text || '/%')
      OR name = auth.uid()::text
    )
  );

CREATE POLICY "avatars_update_admin_or_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR name LIKE (auth.uid()::text || '/%')
      OR name = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR name LIKE (auth.uid()::text || '/%')
      OR name = auth.uid()::text
    )
  );

CREATE POLICY "avatars_delete_admin_or_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR name LIKE (auth.uid()::text || '/%')
      OR name = auth.uid()::text
    )
  );

-- ============================================================
-- 6. Habilita Realtime na tabela profiles para atualização imediata
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
  END IF;
END $$;

