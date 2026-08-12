import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import {
  createTaskComment,
  deleteTaskComment,
  fetchTaskComments,
} from '@/lib/api/comments'

export function useTaskComments(taskId: string | null) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const KEY = ['task-comments', taskId]

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => fetchTaskComments(taskId!),
    enabled: !!taskId && !!user,
  })

  const add = useMutation({
    mutationFn: (content: string) =>
      createTaskComment(taskId!, user!.id, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
  })

  const remove = useMutation({
    mutationFn: deleteTaskComment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
  })

  return {
    comments: query.data ?? [],
    isLoading: query.isLoading,
    addComment: add.mutateAsync,
    deleteComment: remove.mutateAsync,
  }
}