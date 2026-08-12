import { supabase } from '@/lib/supabaseClient'
import type { TaskComment } from '@/types/database'

export async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createTaskComment(
  taskId: string,
  authorId: string,
  content: string,
): Promise<void> {
  const { error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: authorId, content })

  if (error) throw new Error(error.message)
}

export async function deleteTaskComment(id: string): Promise<void> {
  const { error } = await supabase.from('task_comments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}