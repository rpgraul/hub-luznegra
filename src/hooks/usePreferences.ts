import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import {
  getPreferences,
  updatePreferences,
  type PreferencesPatch,
} from '@/lib/api/preferences'

export const PREFERENCES_KEY = ['preferences']

export function usePreferences() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: preferences } = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: () => getPreferences(user!.id),
    enabled: !!user,
  })

  const mutation = useMutation({
    mutationFn: (patch: PreferencesPatch) =>
      updatePreferences(user!.id, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: PREFERENCES_KEY })
      const previous = queryClient.getQueryData(PREFERENCES_KEY)
      queryClient.setQueryData(PREFERENCES_KEY, (old: unknown) => {
        const current =
          (old as { user_id: string } | undefined)?.user_id ??
          user!.id
        return { user_id: current, ...(old ?? {}), ...patch }
      })
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PREFERENCES_KEY, context.previous)
      }
    },
  })

  return {
    preferences: preferences ?? null,
    setView: (view: PreferencesPatch['default_view']) =>
      mutation.mutate({ default_view: view }),
    setProject: (projectId: string | null) =>
      mutation.mutate({ active_project_id: projectId }),
    setShowAll: (show: boolean) => mutation.mutate({ show_all_tasks: show }),
    isSaving: mutation.isPending,
  }
}