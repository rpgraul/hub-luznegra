// Edge Function: membros de um projeto (dropdown de responsável).
// Sem project_id, retorna a equipe inteira (dashboard "Todas as tarefas").
// profiles tem RLS restritiva (só o próprio perfil), então o frontend não pode
// listar membros diretamente — aqui a service role faz a consulta.
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

    const body = (await req.json()) as { project_id?: string | null }
    const projectId = body.project_id

    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: caller } = await admin.auth.getUser(token)
    if (!caller.user) return json({ error: 'Não autorizado.' }, 401)

    // Sem projeto: lista a equipe inteira (dropdowns com "Todas as tarefas").
    if (!projectId) {
      const { data: all } = await admin
        .from('profiles')
        .select('id, username, full_name')
        .order('full_name', { nullsFirst: true })
        .order('username')
      return json({ data: all ?? [] })
    }

    // Confere participação usando o RPC já existente (SECURITY DEFINER, p/ authenticated)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    )
    const { data: isParticipant } = await userClient.rpc('is_project_participant', {
      p_project_id: projectId,
    })
    if (!isParticipant) {
      return json({ error: 'Você não participa deste projeto.' }, 403)
    }

    const { data: project } = await admin
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .maybeSingle()
    if (!project) return json({ error: 'Projeto não encontrado.' }, 404)

    const { data: assignees } = await admin
      .from('tasks')
      .select('assigned_to')
      .eq('project_id', projectId)
      .not('assigned_to', 'is', null)

    const ids = new Set<string>()
    if (project.owner_id) ids.add(project.owner_id)
    for (const a of assignees ?? []) {
      if (a.assigned_to) ids.add(a.assigned_to)
    }

    if (ids.size === 0) return json({ data: [] })

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, username, full_name')
      .in('id', Array.from(ids))

    return json({ data: profiles ?? [] })
  } catch (err) {
    console.error('project-members error:', err)
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
    )
  }
})