// src/lib/api/links.ts
// Gerenciamento de Links Úteis da equipe (globais no Hub)

import { supabase } from '@/lib/supabaseClient'
import type { HubLink } from '@/types/database'

export interface CreateLinkInput {
  title: string
  url: string
  description?: string | null
  tags?: string[]
  task_id?: string | null
}

export interface UpdateLinkInput {
  id: string
  title?: string
  url?: string
  description?: string | null
  tags?: string[]
  task_id?: string | null
}

export async function listLinks(): Promise<HubLink[]> {
  const { data, error } = await supabase
    .from('hub_links')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao listar links:', error)
    throw new Error(error.message)
  }

  return (data ?? []) as HubLink[]
}

export async function createLink(input: CreateLinkInput): Promise<HubLink> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id || null

  const { data, error } = await supabase
    .from('hub_links')
    .insert({
      title: input.title.trim(),
      url: input.url.trim(),
      description: input.description?.trim() || null,
      tags: input.tags || [],
      task_id: input.task_id || null,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar link:', error)
    throw new Error(error.message)
  }

  return data as HubLink
}

export async function updateLink(input: UpdateLinkInput): Promise<HubLink> {
  const { id, ...updates } = input

  const { data, error } = await supabase
    .from('hub_links')
    .update({
      ...(updates.title !== undefined && { title: updates.title.trim() }),
      ...(updates.url !== undefined && { url: updates.url.trim() }),
      ...(updates.description !== undefined && { description: updates.description?.trim() || null }),
      ...(updates.tags !== undefined && { tags: updates.tags }),
      ...(updates.task_id !== undefined && { task_id: updates.task_id }),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Erro ao atualizar link:', error)
    throw new Error(error.message)
  }

  return data as HubLink
}

export async function deleteLink(id: string): Promise<void> {
  const { error } = await supabase.from('hub_links').delete().eq('id', id)

  if (error) {
    console.error('Erro ao excluir link:', error)
    throw new Error(error.message)
  }
}
