import { useQuery } from '@tanstack/react-query'
import { listProjectMembers, type ProjectMember } from '@/lib/api/members'

export function useProjectMembers(projectId: string | null) {
  const query = useQuery({
    queryKey: ['project-members', projectId ?? 'all'],
    queryFn: () => listProjectMembers(projectId),
    enabled: true,
    staleTime: 60_000,
  })

  return {
    members: (query.data ?? []) as ProjectMember[],
    memberOf: (id: string | null) =>
      (query.data ?? []).find((member) => member.id === id) ?? null,
  }
}