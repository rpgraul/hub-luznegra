// src/hooks/useDocuments.ts
// TanStack Query hook para gerenciar Documentos

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listDocuments,
  uploadDocument,
  updateDocument,
  deleteDocument,
  type UploadDocumentInput,
  type UpdateDocumentInput,
} from '@/lib/api/documents'
import type { HubDocument } from '@/types/database'
import { toast } from '@heroui/react'

export function useDocuments(projectId?: string | null) {
  const queryClient = useQueryClient()
  const queryKey = ['documents', projectId ?? 'all']

  const {
    data: documents = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<HubDocument[]>({
    queryKey,
    queryFn: () => listDocuments(projectId),
    staleTime: 1000 * 60 * 2, // 2 minutos
  })

  const uploadMutation = useMutation({
    mutationFn: (input: UploadDocumentInput) => uploadDocument(input),
    onSuccess: (newDoc) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success(`Documento "${newDoc.title}" enviado com sucesso.`)
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao enviar documento: ${err.message}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: UpdateDocumentInput) => updateDocument(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Documento atualizado.')
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao atualizar documento: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (doc: HubDocument) => deleteDocument(doc),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Documento excluído.')
    },
    onError: (err: Error) => {
      toast.danger(`Erro ao excluir documento: ${err.message}`)
    },
  })

  return {
    documents,
    isLoading,
    isError,
    error,
    refetch,
    uploadDocument: uploadMutation.mutateAsync,
    updateDocument: updateMutation.mutateAsync,
    deleteDocument: deleteMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
