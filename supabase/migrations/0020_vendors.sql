-- 0020_vendors.sql
-- Seção "Fornecedores / Colaboradores" (ilustradores, autores, parceiros...).
-- Mesmo padrão de acesso de Links Úteis e Documentos (todos autenticados).

-- 1. TABELA
CREATE TABLE IF NOT EXISTS public.hub_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Por hora tudo é "ilustrador"; o campo existe para diferenciar depois
  -- (autor, fornecedor, tradutor...) sem nova migração.
  kind TEXT NOT NULL DEFAULT 'ilustrador'
    CHECK (kind IN ('ilustrador', 'fornecedor', 'autor', 'colaborador', 'outro')),
  phone TEXT,               -- celular
  email TEXT,
  link1 TEXT,               -- hiperlinks genéricos
  link2 TEXT,
  link3 TEXT,
  style TEXT,               -- estilo de traço/arte
  notes JSONB,              -- observação (estado serializado do Lexical)
  pix TEXT,                 -- chave PIX para pagamento
  images TEXT[] DEFAULT '{}',    -- URLs públicas das artes de exemplo
  image_keys TEXT[] DEFAULT '{}',-- chaves no R2/Storage (permite apagar o arquivo)
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_hub_vendors_name ON public.hub_vendors(lower(name));
CREATE INDEX IF NOT EXISTS idx_hub_vendors_kind ON public.hub_vendors(kind);
CREATE INDEX IF NOT EXISTS idx_hub_vendors_created_at ON public.hub_vendors(created_at DESC);

-- 3. UPDATED_AT (função criada em 0012; recriada aqui por idempotência)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_hub_vendors_updated_at ON public.hub_vendors;
CREATE TRIGGER tr_hub_vendors_updated_at
  BEFORE UPDATE ON public.hub_vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. RLS
ALTER TABLE public.hub_vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hub_vendors_select ON public.hub_vendors;
CREATE POLICY hub_vendors_select ON public.hub_vendors
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS hub_vendors_insert ON public.hub_vendors;
CREATE POLICY hub_vendors_insert ON public.hub_vendors
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS hub_vendors_update ON public.hub_vendors;
CREATE POLICY hub_vendors_update ON public.hub_vendors
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS hub_vendors_delete ON public.hub_vendors;
CREATE POLICY hub_vendors_delete ON public.hub_vendors
  FOR DELETE TO authenticated
  USING (true);
