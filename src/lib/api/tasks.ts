import { supabase } from '@/lib/supabaseClient'
import type {
  Json,
  Task,
  TaskPriority,
  TaskStatus,
} from '@/types/database'

export interface NewTaskInput {
  title: string
  project_id: string
  parent_id?: string | null
  assigned_to?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  start_date?: string | null
  due_date?: string | null
  estimated_hours?: number | null
  description?: Json | null
  tags?: string[] | null
  order_index?: number
}

export type TaskPatch = Partial<
  Omit<Task, 'id' | 'created_at' | 'updated_at'>
>

/**
 * Busca tarefas de todos os projetos.
 * `showAll=false` filtra apenas as tarefas do próprio usuário
 * (switch "Minhas tarefas" do dashboard).
 */
export async function fetchTasks(
  showAll: boolean,
  userId: string,
): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select('*')
    .order('order_index', { ascending: true })

  if (!showAll) {
    query = query.eq('assigned_to', userId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(input)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateTask(
  id: string,
  patch: TaskPatch,
): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Move entre colunas. Leva as subtarefas junto quando a tarefa vai
 * para `done` (regra do PRD §6).
 */
export async function moveTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)

  if (status === 'done') {
    const { data: children, error: childError } = await supabase
      .from('tasks')
      .select('id')
      .eq('parent_id', id)
    if (childError) throw new Error(childError.message)
    if ((children ?? []).length > 0) {
      const { error: subError } = await supabase
        .from('tasks')
        .update({ status })
        .in(
          'id',
          (children ?? []).map((c) => c.id),
        )
      if (subError) throw new Error(subError.message)
    }
  }
}