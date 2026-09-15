-- =========== Migration: cascade delete de subtarefas ===========

-- 0. (Opcional) Conferir como estão as FKs de tasks hoje
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.tasks'::regclass
  AND contype = 'f';

-- 1. Limpa subtarefas órfãs (parent_id apontando para tarefa que não existe)
WITH RECURSIVE live AS (
  SELECT id FROM public.tasks WHERE parent_id IS NULL
  UNION
  SELECT t.id
  FROM public.tasks t
  JOIN live l ON t.parent_id = l.id
)
DELETE FROM public.tasks t
WHERE NOT EXISTS (SELECT 1 FROM live WHERE live.id = t.id);

-- 2. Remove QUALQUER FK existente na coluna parent_id (qualquer nome)
DO $$ DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.conrelid = 'public.tasks'::regclass
      AND att.attname = 'parent_id'
  LOOP
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;

-- 3. Índice para o cascade ser rápido
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id
  ON public.tasks (parent_id);

-- 4. Recria a FK com ON DELETE CASCADE
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_parent_id_fkey
  FOREIGN KEY (parent_id)
  REFERENCES public.tasks (id)
  ON DELETE CASCADE;