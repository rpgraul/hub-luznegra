import { supabase } from '@/lib/supabaseClient'

export interface ProjectMember {
  id: string
  username: string
  full_name: string | null
  avatar_url?: string | null
}

export async function listProjectMembers(
  projectId: string | null,
): Promise<ProjectMember[]> {
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