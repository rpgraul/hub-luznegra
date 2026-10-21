import { supabase } from '@/lib/supabaseClient'
import type { Project } from '@/types/database'

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('archived', false)
    .order('name')

  if (error) throw new Error(error.message)
  return data ?? []
}

export interface NewProjectInput {
  name: string
  description?: string | null
  color?: string
}

export interface UpdateProjectInput {
  id: string
  name?: string
  description?: string | null
  color?: string
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sessão expirada.')

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color || '#6366F1',
      owner_id: user.id,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateProject(input: UpdateProjectInput): Promise<Project> {
  const patch: Partial<Project> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.description !== undefined) patch.description = input.description?.trim() || null
  if (input.color !== undefined) patch.color = input.color

  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function archiveProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ archived: true })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function listArchivedProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('archived', true)
    .order('name')

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function unarchiveProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ archived: false })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function getProjectMemberIds(projectId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)

  if (error) {
    console.error('Erro ao buscar membros do projeto:', error)
    return []
  }
  return (data ?? []).map((row) => row.user_id)
}

export async function setProjectMembers(projectId: string, userIds: string[]): Promise<void> {
  // Remove membros atuais
  const { error: delError } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)

  if (delError) {
    console.error('Erro ao limpar membros do projeto:', delError)
  }

  if (userIds.length === 0) return

  const rows = userIds.map((userId) => ({
    project_id: projectId,
    user_id: userId,
  }))

  const { error: insError } = await supabase
    .from('project_members')
    .insert(rows)

  if (insError) {
    console.error('Erro ao associar membros ao projeto:', insError)
  }
}
