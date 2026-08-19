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
  assignees?: string[] | null
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
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('order_index', { ascending: true })

  if (error) {
    console.error('fetchTasks error:', error)
    return []
  }

  const allTasks = (data as Task[]) ?? []
  if (showAll) {
    return allTasks
  }

  // Filtra com segurança em memória para garantir compatibilidade
  return allTasks.filter(
    (t) =>
      t.assigned_to === userId ||
      (Array.isArray(t.assignees) && t.assignees.includes(userId)),
  )
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const insertPayload = { ...input }
  if (!insertPayload.assignees || insertPayload.assignees.length === 0) {
    delete insertPayload.assignees
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    if (error.message.includes('assignees')) {
      delete insertPayload.assignees
      const retry = await supabase
        .from('tasks')
        .insert(insertPayload)
        .select('*')
        .single()
      if (retry.error) throw new Error(retry.error.message)
      return retry.data
    }
    throw new Error(error.message)
  }
  return data
}

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  const updatePayload = { ...patch }
  // Remove campos virtuais/não persistidos no banco caso existam
  if ('tags' in updatePayload) {
    delete updatePayload.tags
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    if (error.message.includes('assignees') && 'assignees' in updatePayload) {
      delete updatePayload.assignees
      const retry = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single()
      if (retry.error) throw new Error(retry.error.message)
      return retry.data
    }
    throw new Error(error.message)
  }
  return data
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
  const { data: currentTask, error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', id)
    .select('id, parent_id')
    .single()
  if (error) throw new Error(error.message)

  if (status === 'done') {
    // 1. Mark all subtasks done when parent is marked done
    const { data: children, error: childError } = await supabase
      .from('tasks')
      .select('id')
      .eq('parent_id', id)
    if (childError) throw new Error(childError.message)
    if ((children ?? []).length > 0) {
      const { error: subError } = await supabase
        .from('tasks')
        .update({ status: 'done' })
        .in(
          'id',
          (children ?? []).map((c) => c.id),
        )
      if (subError) throw new Error(subError.message)
    }

    // 2. Subtask completed: update parent task status
    if (currentTask?.parent_id) {
      const { data: parent } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('id', currentTask.parent_id)
        .single()

      const { data: siblings } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('parent_id', currentTask.parent_id)

      if (siblings && siblings.length > 0) {
        const allDone = siblings.every((s) => s.status === 'done')
        if (allDone) {
          await supabase
            .from('tasks')
            .update({ status: 'done' })
            .eq('id', currentTask.parent_id)
        } else if (parent && (parent.status === 'todo' || parent.status === 'backlog')) {
          await supabase
            .from('tasks')
            .update({ status: 'in_progress' })
            .eq('id', currentTask.parent_id)
        }
      }
    }
  } else if (currentTask?.parent_id) {
    // If subtask moved away from done, check if parent was done and reopen to in_progress
    const { data: parent } = await supabase
      .from('tasks')
      .select('id, status')
      .eq('id', currentTask.parent_id)
      .single()

    if (parent && parent.status === 'done') {
      await supabase
        .from('tasks')
        .update({ status: 'in_progress' })
        .eq('id', currentTask.parent_id)
    }
  }
}