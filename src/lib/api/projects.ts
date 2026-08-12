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