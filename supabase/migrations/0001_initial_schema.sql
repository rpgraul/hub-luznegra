-- 0001_initial_schema.sql
-- Schema inicial do Hub (PRD §3). Executar no Supabase SQL Editor ou via supabase db push.

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Perfis (estende auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL, -- apelido para login
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  ferias_inicio DATE,
  ferias_fim DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Preferências do usuário (persistência de visualização)
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  default_view TEXT DEFAULT 'gantt' CHECK (default_view IN ('gantt', 'kanban', 'lista', 'calendario')),
  active_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Projetos
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tarefas (hierárquica)
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description JSONB, -- estado serializado do Lexical
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE, -- NULL = raiz
  status TEXT DEFAULT 'todo' CHECK (status IN ('backlog','todo','in_progress','review','done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  start_date DATE,
  due_date DATE,
  estimated_hours NUMERIC(5,2),
  actual_hours NUMERIC(5,2),
  order_index INTEGER DEFAULT 0, -- ordenação manual
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Comentários / Atividades
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Notificações (in-app)
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('task_assigned', 'due_date_reminder', 'mention')),
  content TEXT NOT NULL,
  link TEXT, -- URL para a tarefa (ex: /task/{id})
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_notifications_user_id_read ON notifications(user_id, read);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper (SECURITY DEFINER) para login por username.
-- O e-mail real vive em auth.users; SECURITY DEFINER permite ler fora do schema public.
-- Grant p/ anon: o lookup acontece ANTES do login (usuário não autenticado).
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT au.email
  FROM auth.users au
  JOIN public.profiles p ON p.id = au.id
  WHERE lower(p.username) = lower(p_username)
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO anon, authenticated;

-- Helper (SECURITY DEFINER) para verificar participação em projeto sem recursão de RLS.
-- Participa: é owner, tem tarefa atribuída no projeto, ou é admin.
CREATE OR REPLACE FUNCTION public.is_project_participant(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.projects pr
      WHERE pr.id = p_project_id
        AND pr.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.project_id = p_project_id
        AND t.assigned_to = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles pf
      WHERE pf.id = auth.uid() AND pf.role = 'admin'
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_project_participant(UUID) TO authenticated;

-- ============================================================
-- RLS (restritiva por usuário, conforme PRD §3)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: só o próprio perfil; admin vê todos. Sem INSERT (sem self-signup:
-- contas são criadas pelo admin via Admin API / Edge Function).
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles adm WHERE adm.id = auth.uid() AND adm.role = 'admin'
  ));

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles adm WHERE adm.id = auth.uid() AND adm.role = 'admin'
  ));

-- User preferences: finas do próprio usuário (upsert no primeiro acesso).
CREATE POLICY user_preferences_select_own ON public.user_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_preferences_insert_own ON public.user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY user_preferences_update_own ON public.user_preferences
  FOR UPDATE USING (user_id = auth.uid());

-- Projects: visíveis para owner, participantes (tarefa atribuída) e admin.
CREATE POLICY projects_select ON public.projects
  FOR SELECT USING (
    owner_id = auth.uid() OR public.is_project_participant(id)
  );

CREATE POLICY projects_insert ON public.projects
  FOR INSERT WITH CHECK (owner_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles adm WHERE adm.id = auth.uid() AND adm.role = 'admin'
  ));

CREATE POLICY projects_update ON public.projects
  FOR UPDATE USING (owner_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles adm WHERE adm.id = auth.uid() AND adm.role = 'admin'
  ));

CREATE POLICY projects_delete ON public.projects
  FOR DELETE USING (owner_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles adm WHERE adm.id = auth.uid() AND adm.role = 'admin'
  ));

-- Tasks: visíveis/inseríveis por participantes do projeto; update também p/ o responsável.
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT USING (public.is_project_participant(project_id));

CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT WITH CHECK (public.is_project_participant(project_id));

CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE USING (
    public.is_project_participant(project_id) OR assigned_to = auth.uid()
  ) WITH CHECK (
    public.is_project_participant(project_id) OR assigned_to = auth.uid()
  );

CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE USING (public.is_project_participant(project_id) OR EXISTS (
    SELECT 1 FROM public.profiles adm WHERE adm.id = auth.uid() AND adm.role = 'admin'
  ));

-- Task comments: ver de tarefas de projetos que participa; criar/sair do autor.
CREATE POLICY task_comments_select ON public.task_comments
  FOR SELECT USING (
    task_id IN (SELECT id FROM public.tasks WHERE public.is_project_participant(project_id))
  );

CREATE POLICY task_comments_insert ON public.task_comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND task_id IN (SELECT id FROM public.tasks WHERE public.is_project_participant(project_id))
  );

CREATE POLICY task_comments_update ON public.task_comments
  FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY task_comments_delete ON public.task_comments
  FOR DELETE USING (author_id = auth.uid());

-- Notifications: apenas as próprias (insert vem de Edge Functions SECURITY DEFINER).
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());