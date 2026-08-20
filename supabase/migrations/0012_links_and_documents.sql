-- 0012_links_and_documents.sql
-- Tabelas para Links Úteis e Documentos com Cloudflare R2 / Armazenamento

-- 1. TABELA DE LINKS ÚTEIS
CREATE TABLE IF NOT EXISTS public.hub_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABELA DE DOCUMENTOS
CREATE TABLE IF NOT EXISTS public.hub_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf', 'docx', 'xlsx', 'csv', 'txt', 'image', 'other'
  file_size BIGINT NOT NULL DEFAULT 0,
  file_key TEXT NOT NULL, -- R2 object key
  file_url TEXT NOT NULL, -- URL pública ou de acesso direto
  extracted_text TEXT, -- Conteúdo de texto extraído para busca e IA
  tags TEXT[] DEFAULT '{}',
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ÍNDICES DE DESEMPENHO E BUSCA
CREATE INDEX IF NOT EXISTS idx_hub_links_project ON public.hub_links(project_id);
CREATE INDEX IF NOT EXISTS idx_hub_links_task ON public.hub_links(task_id);
CREATE INDEX IF NOT EXISTS idx_hub_links_tags ON public.hub_links USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_hub_links_created_at ON public.hub_links(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_docs_project ON public.hub_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_hub_docs_task ON public.hub_documents(task_id);
CREATE INDEX IF NOT EXISTS idx_hub_docs_tags ON public.hub_documents USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_hub_docs_type ON public.hub_documents(file_type);
CREATE INDEX IF NOT EXISTS idx_hub_docs_created_at ON public.hub_documents(created_at DESC);

-- 4. GATILHOS DE UPDATED_AT
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_hub_links_updated_at ON public.hub_links;
CREATE TRIGGER tr_hub_links_updated_at
  BEFORE UPDATE ON public.hub_links
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_hub_documents_updated_at ON public.hub_documents;
CREATE TRIGGER tr_hub_documents_updated_at
  BEFORE UPDATE ON public.hub_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 5. POLÍTICAS DE RLS (ROW LEVEL SECURITY)
ALTER TABLE public.hub_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_documents ENABLE ROW LEVEL SECURITY;

-- Links: Todos os usuários autenticados podem ver, criar e gerenciar links
DROP POLICY IF EXISTS hub_links_select ON public.hub_links;
CREATE POLICY hub_links_select ON public.hub_links
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS hub_links_insert ON public.hub_links;
CREATE POLICY hub_links_insert ON public.hub_links
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS hub_links_update ON public.hub_links;
CREATE POLICY hub_links_update ON public.hub_links
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS hub_links_delete ON public.hub_links;
CREATE POLICY hub_links_delete ON public.hub_links
  FOR DELETE TO authenticated
  USING (true);

-- Documentos: Todos os usuários autenticados podem ver, criar e gerenciar documentos
DROP POLICY IF EXISTS hub_documents_select ON public.hub_documents;
CREATE POLICY hub_documents_select ON public.hub_documents
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS hub_documents_insert ON public.hub_documents;
CREATE POLICY hub_documents_insert ON public.hub_documents
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS hub_documents_update ON public.hub_documents;
CREATE POLICY hub_documents_update ON public.hub_documents
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS hub_documents_delete ON public.hub_documents;
CREATE POLICY hub_documents_delete ON public.hub_documents
  FOR DELETE TO authenticated
  USING (true);
