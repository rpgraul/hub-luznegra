-- 0013_remove_project_from_documents.sql
-- Remove vinculação de projeto da tabela hub_documents (documentos são globais no Hub)

ALTER TABLE public.hub_documents DROP COLUMN IF EXISTS project_id;
DROP INDEX IF EXISTS idx_hub_docs_project;
