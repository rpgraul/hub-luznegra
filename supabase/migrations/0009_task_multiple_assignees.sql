-- Migration 0009: Multiple Assignees per task
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assignees UUID[] DEFAULT '{}';

-- Populate assignees from existing assigned_to
UPDATE public.tasks
SET assignees = ARRAY[assigned_to]
WHERE assigned_to IS NOT NULL AND (assignees IS NULL OR assignees = '{}');

-- GIN index for assignees array searches
CREATE INDEX IF NOT EXISTS idx_tasks_assignees ON public.tasks USING GIN (assignees);

-- Update RLS policy to include any assigned user
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select_policy" ON public.tasks;

CREATE POLICY "tasks_select_policy" ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR auth.uid() = ANY(assignees)
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id
      AND (p.owner_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
    )
  );
