// src/hooks/useLinks.ts
// TanStack Query hook para gerenciar Links Úteis (globais no Hub)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listLinks,
  createLink,
  updateLink,
  deleteLink,
  type CreateLinkInput,
  type UpdateLinkInput,
} from '@/lib/api/links'
import type { HubLink } from '@/types/database'
import { toast } from '@heroui/react'

export function useLinks() {
  const queryClient = useQueryClient()
  const queryKey = ['links']

  const {
    data: links = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<HubLink[]>({
    queryKey,
    queryFn: listLinks,
    staleTime: 1000 * 60 * 2, // 2 minutos
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateLinkInput) => createLink(input),
    onSuccess: (newLink) => {
      void queryClient.invalidateQueries({ queryKey: ['links'] })
      toast.success(`Link "${newLink.title}" adicionado.`)
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao adicionar link: ${err.message}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: UpdateLinkInput) => updateLink(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['links'] })
      toast.success('Link atualizado.')
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao atualizar link: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLink(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['links'] })
      toast.success('Link excluído.')
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao excluir link: ${err.message}`)
    },
  })

  return {
    links,
    isLoading,
    isError,
    error,
    refetch,
    createLink: createMutation.mutateAsync,
    updateLink: updateMutation.mutateAsync,
    deleteLink: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
