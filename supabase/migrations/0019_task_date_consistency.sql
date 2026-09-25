-- 0019: datas coerentes em tasks (regras do PRD §6)
-- O frontend já bloqueia start > due e abre modal de decisão quando a
-- subtarefa cai fora da janela do pai; aqui garantimos a integridade no banco.
-- NOT VALID: aplica-se às linhas novas/edições sem exigir varrer o histórico
-- (pode conter dados legados inconsistentes importados).
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_start_before_due;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_start_before_due
  CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date) NOT VALID;
