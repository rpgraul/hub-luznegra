import { supabase } from '@/lib/supabaseClient'
import type { HubDocument } from '@/types/database'
import { extractTextFromFile } from '@/lib/extractors'

export interface UploadDocumentInput {
  file: File
  title?: string
  tags?: string[]
  task_id?: string | null
}

export interface UpdateDocumentInput {
  id: string
  title?: string
  tags?: string[]
  task_id?: string | null
}

export async function listDocuments(): Promise<HubDocument[]> {
  const { data, error } = await supabase
    .from('hub_documents')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao listar documentos:', error)
    throw new Error(error.message)
  }

  return (data ?? []) as HubDocument[]
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] || result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function uploadDocument(input: UploadDocumentInput): Promise<HubDocument> {
  const { file, title, tags = [], task_id } = input

  // 1. Extração de texto no cliente
  const { text: extractedText, fileType } = await extractTextFromFile(file)

  // 2. Converte para base64 para envio seguro via Edge Function
  const fileBase64 = await fileToBase64(file)

  // 3. Obtém sessão do usuário
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const userId = sessionData.session?.user?.id || null

  let fileKey = `documents/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  let fileUrl = ''

  // 4. Tenta invocar a Edge Function r2-storage
  try {
    const { data: uploadRes, error: uploadErr } = await supabase.functions.invoke('r2-storage', {
      body: {
        action: 'upload',
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileBase64,
      },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    if (uploadErr || !uploadRes?.fileUrl) {
      throw uploadErr || new Error('Falha ao processar upload na Cloudflare R2.')
    }

    fileKey = uploadRes.fileKey || fileKey
    fileUrl = uploadRes.fileUrl
  } catch (err) {
    console.warn('Tentando upload direto via Supabase Storage como fallback...', err)
    // Fallback direto via Supabase Storage
    const { error: directUploadError } = await supabase.storage
      .from('documents')
      .upload(fileKey, file, { upsert: true })

    if (directUploadError) {
      throw new Error(`Erro ao enviar arquivo: ${directUploadError.message}`)
    }

    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fileKey)

    fileUrl = publicUrlData.publicUrl
  }

  // 5. Insere registro na tabela hub_documents
  const docTitle = title?.trim() || file.name.replace(/\.[^/.]+$/, '')

  const { data: newDoc, error: insertError } = await supabase
    .from('hub_documents')
    .insert({
      title: docTitle,
      file_name: file.name,
      file_type: fileType,
      file_size: file.size,
      file_key: fileKey,
      file_url: fileUrl,
      extracted_text: extractedText,
      tags: tags,
      task_id: task_id || null,
      created_by: userId,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Erro ao salvar documento no banco:', insertError)
    throw new Error(insertError.message)
  }

  return newDoc as HubDocument
}

export async function updateDocument(input: UpdateDocumentInput): Promise<HubDocument> {
  const { id, ...updates } = input

  const { data, error } = await supabase
    .from('hub_documents')
    .update({
      ...(updates.title !== undefined && { title: updates.title.trim() }),
      ...(updates.tags !== undefined && { tags: updates.tags }),
      ...(updates.task_id !== undefined && { task_id: updates.task_id }),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Erro ao atualizar documento:', error)
    throw new Error(error.message)
  }

  return data as HubDocument
}

export async function deleteDocument(doc: HubDocument): Promise<void> {
  // 1. Exclui do storage via Edge Function
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    await supabase.functions.invoke('r2-storage', {
      body: {
        action: 'delete',
        fileKey: doc.file_key,
      },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
  } catch (err) {
    console.warn('Aviso ao excluir arquivo físico do storage:', err)
  }

  // 2. Exclui do banco
  const { error } = await supabase.from('hub_documents').delete().eq('id', doc.id)
  if (error) {
    console.error('Erro ao excluir documento do banco:', error)
    throw new Error(error.message)
  }
}
