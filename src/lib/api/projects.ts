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