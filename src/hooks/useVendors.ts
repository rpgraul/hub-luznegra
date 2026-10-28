// src/hooks/useVendors.ts
// TanStack Query para a seção Fornecedores / Colaboradores com Realtime e refetch imediato.

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import {
  listVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  type CreateVendorInput,
  type UpdateVendorInput,
} from '@/lib/api/vendors'
import type { Vendor } from '@/types/database'
import { toast } from '@heroui/react'

export function useVendors() {
  const queryClient = useQueryClient()
  const queryKey = ['vendors']

  const {
    data: vendors = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Vendor[]>({
    queryKey,
    queryFn: listVendors,
    staleTime: 5000,
  })

  // Realtime: escuta alterações na tabela hub_vendors para atualizar a tela instantaneamente
  useEffect(() => {
    const channelId = `realtime-vendors-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hub_vendors' },
        () => {
          void queryClient.invalidateQueries({ queryKey })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: (input: CreateVendorInput) => createVendor(input),
    onSuccess: async (vendor) => {
      await queryClient.refetchQueries({ queryKey, type: 'all' })
      toast.success(`"${vendor.name}" adicionado aos fornecedores / colaboradores.`)
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao adicionar fornecedor / colaborador: ${err.message}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: UpdateVendorInput) => updateVendor(input),
    onSuccess: async (vendor) => {
      await queryClient.refetchQueries({ queryKey, type: 'all' })
      toast.success(`"${vendor.name}" atualizado.`)
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao atualizar: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, imageKeys }: { id: string; imageKeys?: string[] }) =>
      deleteVendor(id, imageKeys ?? []),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey, type: 'all' })
      toast.success('Fornecedor / colaborador excluído.')
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao excluir: ${err.message}`)
    },
  })

  return {
    vendors,
    isLoading,
    isError,
    error,
    refetch,
    createVendor: createMutation.mutateAsync,
    updateVendor: updateMutation.mutateAsync,
    deleteVendor: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
