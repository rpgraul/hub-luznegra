// src/lib/api/vendors.ts
// Fornecedores / Colaboradores (ilustradores, autores, parceiros...).
// Mesma política de acesso de Links Úteis e Documentos: todos autenticados.

import { supabase } from '@/lib/supabaseClient'
import { normalizeLinkUrl } from '@/utils/lexical'
import type { Json, Vendor, VendorKind } from '@/types/database'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const VENDOR_FOLDER = 'fornecedores'
/** Limite prático de artes por fornecedor (evita modal gigante). */
export const MAX_VENDOR_IMAGES = 8

export interface CreateVendorInput {
  name: string
  kind?: VendorKind
  phone?: string | null
  email?: string | null
  link1?: string | null
  link2?: string | null
  link3?: string | null
  style?: string | null
  notes?: Json | null
  pix?: string | null
  images?: string[]
  image_keys?: string[]
}

export type UpdateVendorInput = Partial<CreateVendorInput> & { id: string }

function nullIfEmpty(value: string | null | undefined): string | null {
  const t = (value ?? '').trim()
  return t === '' ? null : t
}

/**
 * Valida o formulário antes de tocar no banco. Retorna as mensagens por campo
 * (o modal mostra inline) — evita gravar link quebrado ou e-mail inválido.
 */
export function validateVendor(input: {
  name: string
  email: string | null | undefined
  link1: string | null | undefined
  link2: string | null | undefined
  link3: string | null | undefined
}): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.name.trim()) errors.name = 'Informe o nome do fornecedor.'
  if (input.email && !EMAIL_RE.test(input.email.trim())) {
    errors.email = 'E-mail inválido.'
  }
  const links = { link1: input.link1, link2: input.link2, link3: input.link3 }
  for (const [field, value] of Object.entries(links)) {
    if (value && !normalizeLinkUrl(value)) {
      errors[field] = 'URL inválida (use http:// ou https://).'
    }
  }
  return errors
}

/** Normaliza os 3 links genéricos (aceita "www..." → "https://www..."). */
export function normalizeVendorLinks(input: {
  link1?: string | null
  link2?: string | null
  link3?: string | null
}): { link1: string | null; link2: string | null; link3: string | null } {
  return {
    link1: normalizeLinkUrl(input.link1 ?? '') ?? nullIfEmpty(input.link1),
    link2: normalizeLinkUrl(input.link2 ?? '') ?? nullIfEmpty(input.link2),
    link3: normalizeLinkUrl(input.link3 ?? '') ?? nullIfEmpty(input.link3),
  }
}

export async function listVendors(): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from('hub_vendors')
    .select('*')
    // Alfabética por nome (fallback estável para nomes iguais).
    .order('name', { ascending: true })

  if (error) {
    console.error('Erro ao listar fornecedores:', error)
    throw new Error(error.message)
  }

  return (data ?? []) as Vendor[]
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const { data: userData } = await supabase.auth.getUser()
  const links = normalizeVendorLinks(input)

  const { data, error } = await supabase
    .from('hub_vendors')
    .insert({
      name: input.name.trim(),
      kind: input.kind ?? 'ilustrador',
      phone: nullIfEmpty(input.phone),
      email: nullIfEmpty(input.email),
      ...links,
      style: nullIfEmpty(input.style),
      notes: input.notes ?? null,
      pix: nullIfEmpty(input.pix),
      images: input.images ?? [],
      image_keys: input.image_keys ?? [],
      created_by: userData.user?.id ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar fornecedor:', error)
    throw new Error(error.message)
  }

  return data as Vendor
}

export async function updateVendor(input: UpdateVendorInput): Promise<Vendor> {
  const patch: {
    name?: string
    kind?: VendorKind
    phone?: string | null
    email?: string | null
    link1?: string | null
    link2?: string | null
    link3?: string | null
    style?: string | null
    notes?: Json | null
    pix?: string | null
    images?: string[]
    image_keys?: string[]
  } = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.kind !== undefined) patch.kind = input.kind
  if (input.phone !== undefined) patch.phone = nullIfEmpty(input.phone)
  if (input.email !== undefined) patch.email = nullIfEmpty(input.email)
  if (input.style !== undefined) patch.style = nullIfEmpty(input.style)
  if (input.notes !== undefined) patch.notes = input.notes ?? null
  if (input.pix !== undefined) patch.pix = nullIfEmpty(input.pix)
  if (input.images !== undefined) patch.images = input.images
  if (input.image_keys !== undefined) patch.image_keys = input.image_keys
  if (input.link1 !== undefined || input.link2 !== undefined || input.link3 !== undefined) {
    const links = normalizeVendorLinks(input)
    patch.link1 = links.link1
    patch.link2 = links.link2
    patch.link3 = links.link3
  }

  const { data, error } = await supabase
    .from('hub_vendors')
    .update(patch)
    .eq('id', input.id)
    .select()
    .single()

  if (error) {
    console.error('Erro ao atualizar fornecedor:', error)
    throw new Error(error.message)
  }

  return data as Vendor
}

/** Apaga as artes no storage (falha só avisa) e depois o registro. */
export async function deleteVendor(id: string, imageKeys: string[] = []): Promise<void> {
  for (const key of imageKeys) {
    if (!key) continue
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      await supabase.functions.invoke('r2-storage', {
        body: { action: 'delete', fileKey: key },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
    } catch (err) {
      console.warn('Não foi possível apagar a imagem do storage:', key, err)
    }
  }

  const { error } = await supabase.from('hub_vendors').delete().eq('id', id)
  if (error) {
    console.error('Erro ao excluir fornecedor:', error)
    throw new Error(error.message)
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] || result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export interface UploadedImage {
  url: string
  key: string
}

/**
 * Sobe uma arte de exemplo para o R2 (fallback: bucket `documents` do
 * Supabase Storage, mesmo bucket usado pela Edge Function).
 */
export async function uploadVendorImage(file: File): Promise<UploadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Envie um arquivo de imagem.')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Imagem acima de 10 MB.')
  }

  const fileBase64 = await fileToBase64(file)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  let fileKey = `${VENDOR_FOLDER}/${Date.now()}_${safeName}`
  let fileUrl = ''

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const { data: uploadRes, error: uploadErr } = await supabase.functions.invoke('r2-storage', {
      body: {
        action: 'upload',
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileBase64,
        folder: VENDOR_FOLDER,
      },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (uploadErr || !uploadRes?.fileUrl) {
      throw uploadErr || new Error('Falha no upload da imagem.')
    }
    fileKey = uploadRes.fileKey || fileKey
    fileUrl = uploadRes.fileUrl
  } catch (err) {
    console.warn('Upload via Edge Function falhou; usando Supabase Storage.', err)
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileKey, file, { upsert: true })
    if (uploadError) {
      throw new Error(`Erro ao enviar imagem: ${uploadError.message}`)
    }
    const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(fileKey)
    fileUrl = publicUrlData.publicUrl
  }

  return { url: fileUrl, key: fileKey }
}

/** Remove uma arte que foi enviada nesta sessão (cancelar não deixa lixo). */
export async function removeVendorImage(key: string): Promise<void> {
  if (!key) return
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    await supabase.functions.invoke('r2-storage', {
      body: { action: 'delete', fileKey: key },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
  } catch (err) {
    console.warn('Não foi possível apagar a imagem do storage:', key, err)
  }
}
