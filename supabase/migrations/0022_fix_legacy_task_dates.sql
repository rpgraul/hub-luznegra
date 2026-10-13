-- 0022_fix_legacy_task_dates.sql
-- Linhas legadas importadas com start_date > due_date derrubam QUALQUER update
-- na linha (ex.: reordenar subtarefas mexendo só em order_index), porque a
-- constraint CHECK tasks_start_before_due (0019, NOT VALID) ainda é aplicada
-- a linhas modificadas. Saneia o histórico (alinha o início ao vencimento)
-- e promove a constraint a VALID.

UPDATE public.tasks
SET start_date = due_date
WHERE start_date IS NOT NULL
  AND due_date IS NOT NULL
  AND start_date > due_date;

ALTER TABLE public.tasks VALIDATE CONSTRAINT tasks_start_before_due;
