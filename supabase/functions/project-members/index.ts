// Edge Function: membros da equipe (dropdown de responsável e filtros).
// Retorna todos os usuários ativos da equipe para que qualquer membro
// cadastrado possa ser atribuído a tarefas ou novos projetos.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, handleOptions } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Não autorizado.' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: caller } = await admin.auth.getUser(token)
    if (!caller.user) return json({ error: 'Não autorizado.' }, 401)

    // Busca usuários de auth para filtrar desativados (banned_until)
    const { data: authUsers } = await admin.auth.admin.listUsers({
      perPage: 1000,
    })

    const activeUserIds = new Set<string>()
    for (const u of authUsers?.users ?? []) {
      const isBanned = Boolean(
        u.banned_until &&
        u.banned_until !== 'none' &&
        !isNaN(new Date(u.banned_until).getTime()) &&
        new Date(u.banned_until).getTime() > Date.now()
      )
      if (!isBanned) {
        activeUserIds.add(u.id)
      }
    }

    // Retorna todos os perfis ativos ordenados por nome / username
    const { data: allProfiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, username, full_name')
      .order('full_name', { nullsFirst: true })
      .order('username')

    if (profilesError) {
      return json({ error: profilesError.message }, 500)
    }

    const activeProfiles = (allProfiles ?? []).filter((p) => activeUserIds.has(p.id))

    return json({ data: activeProfiles })
  } catch (err) {
    console.error('project-members error:', err)
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
    )
  }
})