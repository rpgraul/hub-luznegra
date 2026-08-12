// Edge Function: membros de um projeto (para dropdown de responsável).
// profiles tem RLS restritiva (só o próprio perfil), então o frontend não pode
// listar membros diretamente — aqui a service role faz a consulta.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'
import { json, handleOptions } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Não autorizado.' }, 401)
    }

    const body = (await req.json()) as { project_id?: string }
    const projectId = body.project_id
    if (!projectId) return json({ error: 'project_id é obrigatório.' }, 400)

    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: caller } = await admin.auth.getUser(token)
    if (!caller.user) return json({ error: 'Não autorizado.' }, 401)

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

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, username, full_name')
      .in('id', ids)

    return json({ data: profiles ?? [] })
  } catch (err) {
    console.error('project-members error:', err)
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
    )
  }
})