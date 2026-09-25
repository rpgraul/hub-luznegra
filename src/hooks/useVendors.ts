// src/hooks/useVendors.ts
// TanStack Query para a seção Fornecedores / Colaboradores.
// Mesmo padrão de useLinks/useDocuments: sem update otimista, invalida no
// sucesso e deixa o modal controlar o próprio loading.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
    staleTime: 1000 * 60 * 2,
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateVendorInput) => createVendor(input),
    onSuccess: (vendor) => {
      void queryClient.invalidateQueries({ queryKey })
      toast.success(`"${vendor.name}" adicionado aos fornecedores.`)
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao adicionar fornecedor: ${err.message}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: UpdateVendorInput) => updateVendor(input),
    onSuccess: (vendor) => {
      void queryClient.invalidateQueries({ queryKey })
      toast.success(`"${vendor.name}" atualizado.`)
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao atualizar fornecedor: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    // Recebe as chaves das artes para apagar os arquivos junto com o registro.
    mutationFn: ({ id, imageKeys }: { id: string; imageKeys?: string[] }) =>
      deleteVendor(id, imageKeys ?? []),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
      toast.success('Fornecedor excluído.')
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao excluir fornecedor: ${err.message}`)
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
