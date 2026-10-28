import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { listProjectMembers, type ProjectMember } from '@/lib/api/members'

export function useProjectMembers(projectId: string | null) {
  const queryClient = useQueryClient()
  const KEY = ['project-members', projectId ?? 'all']

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => listProjectMembers(projectId),
    enabled: true,
    staleTime: 5000,
  })

  // Realtime: escuta atualizações na tabela profiles para atualizar listas de responsáveis instantaneamente
  useEffect(() => {
    const channelId = `realtime-profiles-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['project-members'] })
          void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  return {
    members: (query.data ?? []) as ProjectMember[],
    memberOf: (id: string | null) =>
      (query.data ?? []).find((member) => member.id === id) ?? null,
  }
}