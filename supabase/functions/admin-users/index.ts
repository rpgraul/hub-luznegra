// Edge Function: gerenciamento de contas (apenas admin).
// Usa a service_role key para a Admin API do GoTrue (nunca expor no frontend).
// Ações: list | create | update | deactivate | reactivate
import { createClient } from '@supabase/supabase-js'
import { json, handleOptions } from '../_shared/cors.ts'

const ADMIN_BAN_DURATION = '876000h' // ~100 anos = conta desativada

interface AdminUserPayload {
  action: 'list' | 'create' | 'update' | 'deactivate' | 'reactivate'
  email?: string
  password?: string
  username?: string
  full_name?: string
  role?: 'admin' | 'member'
  user_id?: string
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
)

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false

  const token = authHeader.replace('Bearer ', '')
  const { data } = await admin.auth.getUser(token)
  if (!data.user) return false

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  return profile?.role === 'admin'
}

function isDuplicateUsername(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  )
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    if (!(await isAdmin(req.headers.get('Authorization')))) {
      return json({ error: 'Apenas administradores podem gerenciar contas.' }, 403)
    }

    const body = (await req.json()) as AdminUserPayload
    const action = body.action

    switch (action) {
      case 'list': {
        // Usuários de auth + perfis públicos, mesclados pelo id
        const { data: authUsers, error: authError } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        })
        if (authError) return json({ error: authError.message }, 500)

        const { data: profiles, error: profilesError } = await admin
          .from('profiles')
          .select('id, username, full_name, role')
        if (profilesError) return json({ error: profilesError.message }, 500)

        const profilesById = new Map(
          (profiles ?? []).map((p) => [p.id, p]),
        )

        const users = (authUsers.users ?? []).map((u) => ({
          id: u.id,
          email: u.email ?? '',
          username: profilesById.get(u.id)?.username ?? '',
          full_name: profilesById.get(u.id)?.full_name ?? null,
          role: profilesById.get(u.id)?.role ?? 'member',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          banned_until: u.banned_until,
        }))

        return json({ data: users })
      }

      case 'create': {
        const { email, password, username, full_name } = body
        if (!email || !password || !username) {
          return json({ error: 'E-mail, senha e username são obrigatórios.' }, 400)
        }
        if (password.length < 6) {
          return json({ error: 'A senha deve ter no mínimo 6 caracteres.' }, 400)
        }

        const { data: existing } = await admin
          .from('profiles')
          .select('id')
          .ilike('username', username)
          .maybeSingle()
        if (existing) {
          return json({ error: 'Este username já está em uso.' }, 400)
        }

        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: full_name ?? '' },
        })
        if (createError) {
          return json({ error: createError.message }, 400)
        }
        if (!created?.user?.id) {
          return json({ error: 'Não foi possível criar o usuário.' }, 500)
        }

        const { error: profileError } = await admin.from('profiles').insert({
          id: created.user.id,
          username,
          full_name: full_name ?? null,
          role: 'member',
        })

        if (profileError) {
          // Rollback do usuário em auth para não deixar órfão
          await admin.auth.admin.deleteUser(created.user.id)
          if (isDuplicateUsername(profileError)) {
            return json({ error: 'Este username já está em uso.' }, 400)
          }
          return json({ error: profileError.message }, 500)
        }

        // E-mail de boas-vindas: será enviado pela Edge Function send-email (próximo passo)
        return json({ data: { id: created.user.id } })
      }

      case 'update': {
        const { user_id, email, password, username, full_name, role } = body
        if (!user_id) return json({ error: 'user_id é obrigatório.' }, 400)

        const authUpdate: Parameters<typeof admin.auth.admin.updateUserById>[1] = {}
        if (email) authUpdate.email = email.trim()
        if (password) {
          if (password.length < 6) {
            return json({ error: 'A senha deve ter no mínimo 6 caracteres.' }, 400)
          }
          authUpdate.password = password
        }

        if (Object.keys(authUpdate).length > 0) {
          const { error: authError } = await admin.auth.admin.updateUserById(user_id, authUpdate)
          if (authError) return json({ error: authError.message }, 400)
        }

        const profilePatch: Record<string, unknown> = {}
        if (username !== undefined) profilePatch.username = username
        if (full_name !== undefined) profilePatch.full_name = full_name
        if (role !== undefined) profilePatch.role = role

        if (Object.keys(profilePatch).length > 0) {
          const { error: profileError } = await admin
            .from('profiles')
            .update(profilePatch)
            .eq('id', user_id)
          if (profileError) {
            if (isDuplicateUsername(profileError)) {
              return json({ error: 'Este username já está em uso.' }, 400)
            }
            return json({ error: profileError.message }, 500)
          }
        }

        return json({ data: { id: user_id } })
      }

      case 'deactivate':
      case 'reactivate': {
        const { user_id } = body
        if (!user_id) return json({ error: 'user_id é obrigatório.' }, 400)

        const { error } = await admin.auth.admin.updateUserById(user_id, {
          ban_duration: action === 'deactivate' ? ADMIN_BAN_DURATION : 'none',
        })
        if (error) return json({ error: error.message }, 400)

        return json({ data: { id: user_id } })
      }

      default:
        return json({ error: `Ação desconhecida: ${action}.` }, 400)
    }
  } catch (err) {
    console.error('admin-users error:', err)
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
    )
  }
})