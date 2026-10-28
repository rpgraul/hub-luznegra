-- 0032_user_deactivation_and_deletion.sql
-- Adiciona suporte a desativação e exclusão permanente de usuários com limpeza de vínculos

-- 1. Adiciona coluna is_active em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Garante que todos os registros existentes estejam como ativos
UPDATE public.profiles
SET is_active = true
WHERE is_active IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles (is_active);

-- 2. Altera a foreign key de projects.owner_id para não deletar em cascata o projeto inteiro
-- se o usuário dono for excluído
ALTER TABLE public.projects ALTER COLUMN owner_id DROP NOT NULL;

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'projects'
    AND kcu.column_name = 'owner_id'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.projects DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.projects
    ADD CONSTRAINT projects_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
END $$;

-- 3. Função para limpar tarefas e vínculos de membros quando um usuário é desativado ou deletado
CREATE OR REPLACE FUNCTION public.admin_cleanup_user_assignments(
  p_user_id UUID,
  p_reassign_projects_to UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fallback_admin UUID;
BEGIN
  -- Identifica um admin para fallback de propriedade de projetos
  IF p_reassign_projects_to IS NOT NULL AND p_reassign_projects_to <> p_user_id THEN
    v_fallback_admin := p_reassign_projects_to;
  ELSE
    SELECT id INTO v_fallback_admin
    FROM public.profiles
    WHERE role = 'admin' AND id <> p_user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- 1. Desvincula o usuário de tarefas individuais (assigned_to)
  UPDATE public.tasks
  SET assigned_to = NULL
  WHERE assigned_to = p_user_id;

  -- 2. Remove o usuário do array de múltiplos responsáveis (assignees)
  UPDATE public.tasks
  SET assignees = array_remove(assignees, p_user_id)
  WHERE p_user_id = ANY(assignees);

  -- 3. Remove de membros de projetos
  DELETE FROM public.project_members
  WHERE user_id = p_user_id;

  -- 4. Reatribui a propriedade de projetos pertencentes ao usuário
  IF v_fallback_admin IS NOT NULL THEN
    UPDATE public.projects
    SET owner_id = v_fallback_admin
    WHERE owner_id = p_user_id;
  ELSE
    UPDATE public.projects
    SET owner_id = NULL
    WHERE owner_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cleanup_user_assignments(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_user_assignments(UUID, UUID) TO service_role;

-- 4. Função para excluir permanentemente um usuário do banco público
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_user_id UUID,
  p_reassign_projects_to UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Limpa todas as atribuições
  PERFORM public.admin_cleanup_user_assignments(p_user_id, p_reassign_projects_to);

  -- Remove preferências e notificações
  DELETE FROM public.user_preferences WHERE user_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id;

  -- Remove o perfil público
  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID, UUID) TO service_role;

-- 5. Permissão de DELETE em profiles para administradores
DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
CREATE POLICY profiles_delete_admin ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());
