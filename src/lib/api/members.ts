import { supabase } from '@/lib/supabaseClient'

export interface ProjectMember {
  id: string
  username: string
  full_name: string | null
  avatar_url?: string | null
  role?: 'admin' | 'member' | 'collaborator'
}

export async function listProjectMembers(
  projectId: string | null,
): Promise<ProjectMember[]> {
  try {
    // 1. Tenta carregar diretamente da tabela profiles (muito mais rápido, ~10ms)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, role')
      .order('full_name', { nullsFirst: true })
      .order('username')

    if (!error && data && data.length > 0) {
      return data as ProjectMember[]
    }
  } catch {
    // Fallback silencioso para a Edge Function se necessário
  }

  // 2. Fallback caso a consulta direta falhe
  const { data, error } = await supabase.functions.invoke('project-members', {
    body: { project_id: projectId },
  })

  if (error) {
    const message =
      error.context instanceof Response
        ? ((await error.context.text()) as string)
        : error.message
    throw new Error(message)
  }

  return (data as { data?: ProjectMember[] }).data ?? []
}