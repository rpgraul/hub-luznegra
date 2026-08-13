import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/hooks/useAuth'
import {
  createTask,
  deleteTask,
  fetchTasks,
  moveTaskStatus,
  updateTask,
  type NewTaskInput,
  type TaskPatch,
} from '@/lib/api/tasks'
import type { Task, TaskStatus } from '@/types/database'

export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'done',
] as const

function tasksKey(showAll: boolean): (string | boolean)[] {
  return ['tasks', showAll]
}

export function useTasks(showAll: boolean) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const KEY = useMemo(() => tasksKey(showAll), [showAll])

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => fetchTasks(showAll, user!.id),
    enabled: !!user,
  })

  // Realtime: escuta a tabela inteira (a RLS entrega o que o usuário pode ver).
  useEffect(() => {
    const channel = supabase
      .channel('tasks-all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: KEY })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [KEY, queryClient])

  function setTasks(updater: (tasks: Task[]) => Task[]) {
    queryClient.setQueryData<Task[]>(KEY, (old) => updater(old ?? []))
  }

  const create = useMutation({
    mutationFn: async (input: NewTaskInput) => {
      const maxOrder =
        (query.data ?? []).reduce(
          (max, task) => Math.max(max, task.order_index),
          0,
        ) + 1
      return createTask({ ...input, order_index: maxOrder })
    },
    onSuccess: (newTask) => {
      setTasks((tasks) => [...tasks, newTask])
    },
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) =>
      updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: KEY })
      const previous = queryClient.getQueryData<Task[]>(KEY)
      setTasks((tasks) =>
        tasks.map((task) =>
          task.id === id
            ? { ...task, ...patch, updated_at: new Date().toISOString() }
            : task,
        ),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(KEY, context.previous)
      }
    },
  })

  const remove = useMutation({
    mutationFn: deleteTask,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: KEY })
      const previous = queryClient.getQueryData<Task[]>(KEY)
      setTasks((tasks) => tasks.filter((task) => task.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(KEY, context.previous)
      }
    },
  })

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      moveTaskStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: KEY })
      const previous = queryClient.getQueryData<Task[]>(KEY)
      setTasks((tasks) =>
        tasks.map((task) => {
          const affected = task.id === id || (task.parent_id === id && status === 'done')
          return affected
            ? { ...task, status, updated_at: new Date().toISOString() }
            : task
        }),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(KEY, context.previous)
      }
    },
  })

  const reorder = useMutation({
    mutationFn: async ({
      id,
      status,
      orderIndex,
    }: {
      id: string
      status?: TaskStatus
      orderIndex?: number
    }) => {
      const patch: TaskPatch = {}
      if (status) patch.status = status
      if (orderIndex !== undefined) patch.order_index = orderIndex
      await updateTask(id, patch)
    },
    onMutate: async ({ id, status, orderIndex }) => {
      await queryClient.cancelQueries({ queryKey: KEY })
      const previous = queryClient.getQueryData<Task[]>(KEY)
      setTasks((tasks) =>
        tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                ...(status ? { status } : {}),
                ...(orderIndex !== undefined ? { order_index: orderIndex } : {}),
                updated_at: new Date().toISOString(),
              }
            : task,
        ),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(KEY, context.previous)
      }
    },
  })

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createTask: create.mutateAsync,
    updateTask: update.mutateAsync,
    deleteTask: remove.mutateAsync,
    moveTaskStatus: move.mutateAsync,
    reorderTask: reorder.mutateAsync,
    getTask: (id: string) => (query.data ?? []).find((task) => task.id === id),
    childrenOf: (id: string) =>
      (query.data ?? []).filter((task) => task.parent_id === id),
  }
}