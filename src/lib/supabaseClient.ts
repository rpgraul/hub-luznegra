import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variáveis de ambiente ausentes: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example)',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

const projectRef = supabaseUrl.split('//')[1]?.split('.')[0]

const AUTH_STORAGE_KEY = projectRef ? `sb-${projectRef}-auth-token` : null

// Sessão "não manter logado": remove o token persistido para que a sessão
// viva apenas em memória e morra ao fechar/atualizar a aba.
export function clearPersistedSession(): void {
  if (AUTH_STORAGE_KEY) {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }
}

// ============================================================
// Admin (gerenciamento de contas)
// A Admin API exige service_role key e roda apenas na Edge Function
// `admin-users` (supabase/functions/admin-users). O frontend só invoca.
// ============================================================

export type UserRoleName = 'admin' | 'member'

export interface AdminUser {
  id: string
  email: string
  username: string
  full_name: string | null
  role: UserRoleName
  created_at: string
  last_sign_in_at: string | null
  banned_until: string | null
}

export interface CreateUserInput {
  email: string
  password: string
  username: string
  full_name?: string
}

export interface UpdateUserInput {
  user_id: string
  email?: string
  password?: string
  username?: string
  full_name?: string
  role?: UserRoleName
}

interface AdminFunctionResponse<T> {
  data?: T
  error?: string
}

async function invokeAdmin<T>(
  body: Record<string, unknown>,
): Promise<AdminFunctionResponse<T>> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body,
  })

  if (error) {
    const message =
      error.context instanceof Response
        ? ((await error.context.text()) as string)
        : error.message
    return { error: message }
  }

  return (data ?? {}) as AdminFunctionResponse<T>
}

export async function createUser(input: CreateUserInput): Promise<{ error: string | null }> {
  const res = await invokeAdmin<{ id: string }>({ action: 'create', ...input })
  return { error: res.error ?? null }
}

export async function listUsers(): Promise<AdminUser[]> {
  const res = await invokeAdmin<AdminUser[]>({ action: 'list' })
  if (res.error) {
    throw new Error(res.error)
  }
  return res.data ?? []
}

export async function updateUser(input: UpdateUserInput): Promise<{ error: string | null }> {
  const res = await invokeAdmin<{ id: string }>({ action: 'update', ...input })
  return { error: res.error ?? null }
}

export async function deactivateUser(userId: string): Promise<{ error: string | null }> {
  const res = await invokeAdmin<{ id: string }>({
    action: 'deactivate',
    user_id: userId,
  })
  return { error: res.error ?? null }
}

export async function reactivateUser(userId: string): Promise<{ error: string | null }> {
  const res = await invokeAdmin<{ id: string }>({
    action: 'reactivate',
    user_id: userId,
  })
  return { error: res.error ?? null }
}

export async function sendPasswordResetEmail(email: string): Promise<{ error: string | null }> {
  try {
    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    return { error: error?.message ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao enviar e-mail.' }
  }
}

export async function generateRecoveryLink(email: string): Promise<{ link: string | null; error: string | null }> {
  const redirectTo = `${window.location.origin}/reset-password`
  const res = await invokeAdmin<{ link: string }>({
    action: 'generate_recovery_link',
    email,
    redirect_to: redirectTo,
  })
  if (res.error) return { link: null, error: res.error }
  return { link: res.data?.link ?? null, error: null }
}

// ============================================================
// Perfil (próprio usuário)
// ============================================================

export interface FeriasTask {
  id: string
  title: string
  start_date: string | null
  due_date: string | null
}

export async function updateProfile(input: {
  full_name?: string | null
  avatar_url?: string | null
}): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada.' }

  const updates: Database['public']['Tables']['profiles']['Update'] = {}
  if (input.full_name !== undefined) updates.full_name = input.full_name
  if (input.avatar_url !== undefined) updates.avatar_url = input.avatar_url

  const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
  return { error: error?.message ?? null }
}

const AVATAR_MAX_SIZE = 2 * 1024 * 1024 // 2MB

export async function uploadAvatar(file: File): Promise<{ url: string | null; error: string | null }> {
  if (!file.type.startsWith('image/')) {
    return { url: null, error: 'O arquivo deve ser uma imagem.' }
  }
  if (file.size > AVATAR_MAX_SIZE) {
    return { url: null, error: 'A imagem deve ter no máximo 2MB.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'Sessão expirada.' }

  const path = `${user.id}/avatar`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true })
  if (uploadError) return { url: null, error: uploadError.message }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return { url: data.publicUrl, error: null }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string | null }> {
  if (newPassword.length < 6) {
    return { error: 'A nova senha deve ter no mínimo 6 caracteres.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return { error: 'Não foi possível reautenticar a conta.' }
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (reauthError) {
    return { error: 'Senha atual incorreta.' }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return { error: error?.message ?? null }
}

export async function updateFerias(
  inicio: string,
  fim: string,
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('profiles')
    .update({
      ferias_inicio: inicio || null,
      ferias_fim: fim || null,
    })
    .eq('id', user.id)
  return { error: error?.message ?? null }
}

export async function checkTasksInPeriod(
  inicio: string,
  fim: string,
): Promise<{ tasks: FeriasTask[]; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { tasks: [], error: 'Sessão expirada.' }

  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, start_date, due_date')
    .eq('assigned_to', user.id)
    .or(
      `and(start_date.lte.${fim},due_date.gte.${inicio}),and(start_date.is.null,due_date.gte.${inicio}),and(due_date.is.null,start_date.lte.${fim})`,
    )

  return { tasks: data ?? [], error: error?.message ?? null }
}