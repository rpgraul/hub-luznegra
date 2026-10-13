-- 0021_task_status_financiamento.sql
-- Adiciona os status 'financing' ("Em Financiamento") e 'funded' ("Financiado"),
-- posicionados entre 'review' e 'done'.
--
-- IMPORTANTE: bloco DO (uma única declaração atômica). O par simples
-- DROP CONSTRAINT + ADD CONSTRAINT, colado no SQL Editor, já pegou mal:
-- se só o ADD executa (seleção parcial no editor), falha com 42710
-- ("already exists") e nada é alterado. Dentro do DO é tudo-ou-nada,
-- e o loop derruba QUALQUER check de status legado (ex.: renomeado para
-- tasks_status_check1), que de outra forma continuaria rejeitando os
-- novos valores mesmo com o novo constraint criado.
--
-- Histórico: aplicado manualmente no banco de produção via SQL Editor
-- (Dashboard Supabase, projeto uzxvlmnwgznjpqwshekt) em 2026-10-13.

DO $$
DECLARE
  c record;
BEGIN
  -- Derruba qualquer CHECK de status existente (por nome)
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass
      AND contype = 'c'
      AND conname ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('uncertain','backlog','todo','in_progress','review','financing','funded','done'));
END $$;
