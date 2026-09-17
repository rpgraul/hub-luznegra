import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

const KEY = ['task-comment-counts']

const EMPTY = new Map<string, number>()

/**
 * Contagem de comentários por tarefa em UMA query (`select task_id` + RLS),
 * compartilhada por todas as views via cache. Atualiza via Realtime
 * (novo comentário / exclusão) com debounce.
 */
async function fetchCommentCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('task_comments').select('task_id')

  if (error) throw new Error(error.message)
  const map = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ task_id: string }>) {
    map.set(row.task_id, (map.get(row.task_id) ?? 0) + 1)
  }
  return map
}

export function useTaskCommentCounts() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: KEY,
    queryFn: fetchCommentCounts,
  })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    function scheduleInvalidate() {
      if (document.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: KEY })
      }, 600)
    }
    const channelId = `task-comment-counts-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_comments',
        },
        scheduleInvalidate,
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  return {
    counts: query.data ?? EMPTY,
    isLoading: query.isLoading,
  }
}

/** Evento global para abrir o chat de comentários de uma tarefa. */
export function openTaskChat(taskId: string) {
  window.dispatchEvent(new CustomEvent('hub:open-task-chat', { detail: { taskId } }))
}
