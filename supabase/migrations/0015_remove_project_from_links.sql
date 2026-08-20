-- 0015_remove_project_from_links.sql
-- Remove vinculação de projeto da tabela hub_links (links são globais no Hub, não vinculados a projetos)

ALTER TABLE public.hub_links DROP COLUMN IF EXISTS project_id;
DROP INDEX IF EXISTS idx_hub_links_project;
