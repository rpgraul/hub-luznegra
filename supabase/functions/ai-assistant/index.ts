// supabase/functions/ai-assistant/index.ts
// Edge Function: Assistente de IA do Hub (DeepSeek via OpenAI-compatible API)
// Executa comandos em linguagem natural para gerenciar tarefas e projetos.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, handleOptions } from '../_shared/cors.ts'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface RequestPayload {
  message: string
  history?: Message[]
  context?: {
    projectId?: string | null
    activeTaskId?: string | null
  }
}

interface AIAction {
  type:
    | 'create_task'
    | 'create_tasks'
    | 'duplicate_task'
    | 'break_down_subtasks'
    | 'list_overdue'
    | 'bulk_status_update'
    | 'create_project'
    | 'update_task'
    | 'delete_task'
    | 'create_user'
    | 'draft_email'
    | 'none'
  params?: Record<string, unknown>
}

interface AIResponseStructure {
  reply: string
  action?: AIAction
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Não autorizado.' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData?.user) {
      return json({ error: 'Sessão inválida.' }, 401)
    }

    const userId = userData.user.id
    const payload: RequestPayload = await req.json()
    const { message, history = [], context = {} } = payload

    if (!message || typeof message !== 'string') {
      return json({ error: 'Mensagem vazia.' }, 400)
    }

    // 1. Coleta contexto do banco de dados (projetos, membros, tarefas recentes)
    const { data: requesterProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    const isUserAdmin = requesterProfile?.role === 'admin'

    const { data: projects } = await admin
      .from('projects')
      .select('id, name')
      .eq('archived', false)

    const { data: members } = await admin
      .from('profiles')
      .select('id, username, full_name')

    let currentProjectTasks: Array<{
      id: string
      title: string
      status: string
      priority: string
      due_date: string | null
      assigned_to: string | null
      parent_id: string | null
    }> = []

    if (context.projectId) {
      const { data: tasks } = await admin
        .from('tasks')
        .select('id, title, status, priority, due_date, assigned_to, parent_id')
        .eq('project_id', context.projectId)
        .limit(50)
      currentProjectTasks = tasks ?? []
    }

    const membersMap = (members ?? []).map((m) => `@${m.username} (${m.full_name || m.username}, id: ${m.id})`).join(', ')
    const projectsMap = (projects ?? []).map((p) => `"${p.name}" (id: ${p.id})`).join(', ')
    const tasksSnippet = currentProjectTasks
      .slice(0, 10)
      .map((t) => `[${t.id}] "${t.title}" (${t.status}, ${t.priority})`)
      .join('\n')

    // 2. Monta o system prompt ultra-enxuto para economia máxima de tokens
    const systemPrompt = `Você é o Lorde Camarão, assistente de IA do Hub da Editora Luz Negra.
Hoje: ${new Date().toISOString().slice(0, 10)}. Usuário ID: ${userId}. Admin: ${isUserAdmin ? 'Sim' : 'Não'}. Projeto ativo ID: ${context.projectId || 'Nenhum'}.

Projetos: ${projectsMap || 'Nenhum'}
Membros: ${membersMap || 'Nenhum'}
Tarefas recentes no projeto:
${tasksSnippet || 'Nenhuma'}

DIRETRIZES DE RESPOSTA:
- Responda em Português do Brasil de forma extremamente DIRETA, OBJETIVA e CONCISA.
- Vá direto ao ponto, sem introduções longas.
- NÃO use emojis em nenhuma hipótese.
- Máximo de 1 a 2 frases curtas ao confirmar ações.
- Cores válidas para projetos: amarelo (#f59e0b), azul (#3b82f6), roxo (#7b68ee), verde (#10b981), vermelho (#ef4444), rosa (#ec4899), laranja (#f97316), ciano (#0ea5e9), teal (#14b8a6). Se o usuário pedir uma cor por nome (ex: "Amarelo"), converta para o hex correspondente.
- Se o usuário for administrador e pedir para criar uma conta de usuário/membro:
  action: create_user, params: { "email": string, "username": string, "full_name"?: string, "role"?: "admin"|"member", "password"?: string }

FORMATO OBRIGATÓRIO (JSON puro):
{
  "reply": "Mensagem curta, direta e sem emojis",
  "action": {
    "type": "create_task" | "create_project" | "update_task" | "delete_task" | "duplicate_task" | "break_down_subtasks" | "list_overdue" | "bulk_status_update" | "create_user" | "draft_email" | "none",
    "params": {
      // create_project: { "name": string, "color"?: string, "description"?: string }
      // create_task para 1 tarefa: { "title": string, "project_id"?: string, "priority"?: "low"|"medium"|"high"|"urgent", "assigned_to"?: string, "due_date"?: "YYYY-MM-DD", "start_date"?: "YYYY-MM-DD", "subtasks"?: string[] | Array<{ "title": string, "due_date"?: string }> }
      // create_task para múltiplas tarefas: { "tasks": Array<{ "title": string, "priority"?: string, "due_date"?: "YYYY-MM-DD", "start_date"?: "YYYY-MM-DD", "subtasks"?: string[] }> }
      // update_task: { "task_id"?: string, "task_title"?: string, "status"?: "backlog"|"todo"|"in_progress"|"review"|"done", "priority"?: "low"|"medium"|"high"|"urgent", "assigned_to"?: string, "due_date"?: "YYYY-MM-DD", "start_date"?: "YYYY-MM-DD", "title"?: string }
      // delete_task: { "task_id"?: string, "task_title"?: string }
      // duplicate_task: { "source_task_title": string, "new_title"?: string, "assigned_to"?: string, "due_date"?: string }
      // break_down_subtasks: { "parent_task_title": string, "subtasks": [string] }
      // bulk_status_update: { "project_id": string, "from_priority"?: string, "target_status": "done"|"in_progress"|"todo"|"backlog"|"review" }
      // create_user: { "email": string, "username": string, "full_name"?: string, "role"?: "admin"|"member", "password"?: string }
    }
  }
}`

    // 3. Chamada ao DeepSeek / OpenAI
    const rawKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('OPENAI_API_KEY') || ''
    const deepseekApiKey = rawKey.trim().replace(/^["']|["']$/g, '')
    let aiParsed: AIResponseStructure = {
      reply: 'Comando processado.',
      action: { type: 'none' },
    }

    if (deepseekApiKey) {
      const endpoint = Deno.env.get('DEEPSEEK_API_KEY')
        ? 'https://api.deepseek.com/chat/completions'
        : 'https://api.openai.com/v1/chat/completions'

      const model =
        Deno.env.get('DEEPSEEK_MODEL') ||
        (Deno.env.get('DEEPSEEK_API_KEY') ? 'deepseek-v4-flash' : 'gpt-4o-mini')

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-3).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ]

      const aiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deepseekApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 300,
        }),
      })

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text()
        console.error('DeepSeek API Error:', aiResponse.status, errorText)
        let errorMsg = `Erro na API DeepSeek (${aiResponse.status})`
        try {
          const errJson = JSON.parse(errorText)
          if (errJson.error?.message) {
            errorMsg = errJson.error.message
          }
        } catch {
          errorMsg = errorText || errorMsg
        }

        if (aiResponse.status === 402 || errorMsg.toLowerCase().includes('balance')) {
          errorMsg = 'Saldo insuficiente na conta da DeepSeek. É necessário recarregar créditos no portal platform.deepseek.com.'
        }

        return json({
          reply: `⚠️ **Aviso da IA**: ${errorMsg}`,
          action: { type: 'none' },
        })
      }

      const data = await aiResponse.json()
      const rawContent = data.choices?.[0]?.message?.content || '{}'
      const cleanContent = rawContent
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()

      try {
        aiParsed = JSON.parse(cleanContent)
      } catch (err) {
        console.error('Failed to parse AI JSON:', cleanContent, err)
        aiParsed = { reply: cleanContent, action: { type: 'none' } }
      }
    } else {
      // Fallback inteligente para desenvolvimento local quando chave não estiver configurada
      const lower = message.toLowerCase()
      if (lower.includes('crie um projeto') || lower.includes('criar projeto') || lower.includes('novo projeto')) {
        const nameMatch = message.match(/["']([^"']+)["']/) || message.match(/projeto (?:chamado )?([^.,\n]+)/i)
        const name = nameMatch ? nameMatch[1].trim() : 'Novo Projeto'
        let color = '#7b68ee'
        if (lower.includes('amarel') || lower.includes('yellow')) color = '#f59e0b'
        else if (lower.includes('azul') || lower.includes('blue')) color = '#3b82f6'
        else if (lower.includes('verde') || lower.includes('green')) color = '#10b981'
        else if (lower.includes('vermelh') || lower.includes('red')) color = '#ef4444'
        else if (lower.includes('rosa') || lower.includes('pink')) color = '#ec4899'
        else if (lower.includes('laranja') || lower.includes('orange')) color = '#f97316'

        aiParsed = {
          reply: `Projeto **"${name}"** criado com sucesso.`,
          action: {
            type: 'create_project',
            params: {
              name,
              color,
            },
          },
        }
      } else if (lower.includes('crie uma tarefa') || lower.includes('criar tarefa') || lower.includes('nova tarefa')) {
        const titleMatch = message.match(/["']([^"']+)["']/) || message.match(/tarefa (?:chamada )?([^.,\n]+)/i)
        const title = titleMatch ? titleMatch[1].trim() : 'Nova Tarefa'
        const isUrgent = lower.includes('urgente')
        const isHigh = lower.includes('alta')

        aiParsed = {
          reply: `Entendido! Criei a tarefa **"${title}"** no projeto ativo.`,
          action: {
            type: 'create_task',
            params: {
              title,
              project_id: context.projectId || projects?.[0]?.id,
              priority: isUrgent ? 'urgent' : isHigh ? 'high' : 'medium',
              assigned_to: userId,
            },
          },
        }
      } else if (lower.includes('atrasad') || lower.includes('vencid')) {
        aiParsed = {
          reply: `Verifiquei as suas tarefas. Todas as tarefas com prazo anterior à data de hoje foram listadas na visualização.`,
          action: { type: 'list_overdue' },
        }
      } else {
        aiParsed = {
          reply: `Olá! Sou o Assistente IA do Hub. Você pode me pedir para:
- *Criar projetos ou tarefas*
- *Quebrar tarefas em subtarefas*
- *Alterar responsáveis, prazos ou prioridades*
- *Concluir ou atualizar tarefas em lote*`,
          action: { type: 'none' },
        }
      }
    }

    // 4. Executa a ação no banco de dados se aplicável
    let actionResult: Record<string, unknown> | null = null

    function normalizeDate(d: unknown): string | null {
      if (!d || typeof d !== 'string') return null
      const trimmed = d.trim()
      const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (brMatch) {
        return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`
      }
      const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
      }
      return null
    }

    function resolveMemberId(identifier: unknown): string {
      if (!identifier || typeof identifier !== 'string') return userId
      const clean = identifier.replace(/^@/, '').toLowerCase().trim()
      const found = (members ?? []).find((m) => m.id === clean || m.username.toLowerCase() === clean)
      return found ? found.id : userId
    }

    if (aiParsed.action && aiParsed.action.type !== 'none') {
      const { type, params = {} } = aiParsed.action

      if (type === 'create_task' || type === 'create_tasks') {
        const projectIdToUse = (params.project_id as string) || context.projectId || projects?.[0]?.id
        if (projectIdToUse) {
          const taskList = Array.isArray(params.tasks)
            ? (params.tasks as Array<Record<string, unknown>>)
            : params.title
              ? [params]
              : []

          const createdTasks: unknown[] = []

          for (const item of taskList) {
            if (!item.title) continue
            const assignedUser = resolveMemberId(item.assigned_to || params.assigned_to)
            const dueDate = normalizeDate(item.due_date || params.due_date)
            const startDate = normalizeDate(item.start_date || params.start_date)

            const { data: created, error: createError } = await admin
              .from('tasks')
              .insert({
                title: String(item.title),
                project_id: (item.project_id as string) || projectIdToUse,
                priority: (item.priority as string) || (params.priority as string) || 'medium',
                status: (item.status as string) || 'todo',
                assigned_to: assignedUser,
                due_date: dueDate,
                start_date: startDate,
                created_by: userId,
              })
              .select()
              .single()

            if (!createError && created) {
              createdTasks.push(created)

              const subtasks = (item.subtasks || (taskList.length === 1 ? params.subtasks : null)) as Array<string | Record<string, unknown>>
              if (Array.isArray(subtasks) && subtasks.length > 0) {
                const subtaskInserts = subtasks.map((st, idx) => {
                  const isObj = typeof st === 'object' && st !== null
                  const stTitle = isObj ? String((st as Record<string, unknown>).title || '') : String(st)
                  const stDue = isObj ? normalizeDate((st as Record<string, unknown>).due_date) : null
                  const stStart = isObj ? normalizeDate((st as Record<string, unknown>).start_date) : null
                  const stAssigned = isObj ? resolveMemberId((st as Record<string, unknown>).assigned_to) : created.assigned_to

                  return {
                    title: stTitle,
                    project_id: created.project_id,
                    parent_id: created.id,
                    assigned_to: stAssigned,
                    due_date: stDue || created.due_date,
                    start_date: stStart,
                    priority: created.priority,
                    status: 'todo',
                    order_index: idx + 1,
                    created_by: userId,
                  }
                })

                await admin.from('tasks').insert(subtaskInserts)
              }
            } else if (createError) {
              console.error('Task insert error:', createError)
            }
          }

          actionResult = { success: true, count: createdTasks.length, tasks: createdTasks }
        }
      } else if (type === 'break_down_subtasks' && params.parent_task_title && Array.isArray(params.subtasks)) {
        // Encontra tarefa pai
        const { data: parentTasks } = await admin
          .from('tasks')
          .select('id, project_id, assigned_to')
          .ilike('title', `%${params.parent_task_title}%`)
          .limit(1)

        const parent = parentTasks?.[0]
        if (parent) {
          const subtaskInserts = (params.subtasks as string[]).map((stTitle, idx) => ({
            title: stTitle,
            project_id: parent.project_id,
            parent_id: parent.id,
            assigned_to: parent.assigned_to,
            status: 'todo',
            order_index: idx + 1,
            created_by: userId,
          }))

          const { data: createdSubtasks } = await admin
            .from('tasks')
            .insert(subtaskInserts)
            .select()

          actionResult = { success: true, count: createdSubtasks?.length ?? 0 }
        }
      } else if (type === 'bulk_status_update' && params.target_status) {
        const projectIdToUse = (params.project_id as string) || context.projectId
        if (projectIdToUse) {
          let query = admin
            .from('tasks')
            .update({ status: params.target_status as string })
            .eq('project_id', projectIdToUse)

          if (params.from_priority) {
            query = query.eq('priority', params.from_priority as string)
          }

          const { data: updated } = await query.select('id')
          actionResult = { success: true, updatedCount: updated?.length ?? 0 }
        }
      } else if (type === 'create_project' && params.name) {
        let color = String(params.color || '#7b68ee').trim()
        const colorNameMap: Record<string, string> = {
          amarelo: '#f59e0b',
          yellow: '#f59e0b',
          azul: '#3b82f6',
          blue: '#3b82f6',
          roxo: '#7b68ee',
          purple: '#7b68ee',
          verde: '#10b981',
          green: '#10b981',
          vermelho: '#ef4444',
          red: '#ef4444',
          rosa: '#ec4899',
          pink: '#ec4899',
          laranja: '#f97316',
          orange: '#f97316',
          ciano: '#0ea5e9',
          cyan: '#0ea5e9',
          teal: '#14b8a6',
        }
        if (colorNameMap[color.toLowerCase()]) {
          color = colorNameMap[color.toLowerCase()]
        }

        const { data: createdProj, error: projError } = await admin
          .from('projects')
          .insert({
            name: String(params.name).trim(),
            color,
            description: (params.description as string) || null,
            owner_id: userId,
          })
          .select()
          .single()

        if (projError) {
          console.error('Project create error:', projError)
          return json({
            reply: `Erro ao criar projeto: ${projError.message}`,
            action: { type: 'none' },
          })
        }

        actionResult = { success: true, project: createdProj }
      } else if (type === 'duplicate_task') {
        const sourceTitle = params.source_task_title as string
        if (sourceTitle) {
          const { data: found } = await admin
            .from('tasks')
            .select('*')
            .ilike('title', `%${sourceTitle}%`)
            .limit(1)

          const orig = found?.[0]
          if (orig) {
            const newTitle = (params.new_title as string) || `${orig.title} (Cópia)`
            const assigned = params.assigned_to ? resolveMemberId(params.assigned_to) : orig.assigned_to
            const due = params.due_date ? normalizeDate(params.due_date) : orig.due_date

            const { data: dupTask } = await admin
              .from('tasks')
              .insert({
                title: newTitle,
                project_id: orig.project_id,
                priority: orig.priority,
                status: 'todo',
                assigned_to: assigned,
                due_date: due,
                created_by: userId,
              })
              .select()
              .single()

            actionResult = { success: true, duplicatedTask: dupTask }
          }
        }
      } else if (type === 'update_task') {
        let taskId = params.task_id as string | undefined
        if (!taskId && params.task_title) {
          const { data: found } = await admin
            .from('tasks')
            .select('id')
            .ilike('title', `%${params.task_title}%`)
            .limit(1)
          taskId = found?.[0]?.id
        }

        if (taskId) {
          const patch: Record<string, unknown> = {}
          if (params.status) patch.status = params.status
          if (params.priority) patch.priority = params.priority
          if (params.title) patch.title = params.title
          if (params.assigned_to) patch.assigned_to = resolveMemberId(params.assigned_to)
          if (params.due_date !== undefined) patch.due_date = normalizeDate(params.due_date)
          if (params.start_date !== undefined) patch.start_date = normalizeDate(params.start_date)

          const { data: updated } = await admin
            .from('tasks')
            .update(patch)
            .eq('id', taskId)
            .select()
            .single()

          actionResult = { success: true, task: updated }
        }
      } else if (type === 'delete_task') {
        let taskId = params.task_id as string | undefined
        if (!taskId && params.task_title) {
          const { data: found } = await admin
            .from('tasks')
            .select('id')
            .ilike('title', `%${params.task_title}%`)
            .limit(1)
          taskId = found?.[0]?.id
        }

        if (taskId) {
          await admin.from('tasks').delete().eq('id', taskId)
          actionResult = { success: true, deletedTaskId: taskId }
        }
      } else if (type === 'create_user' && params.email && params.username) {
        if (!isUserAdmin) {
          return json({
            reply: 'Apenas administradores têm permissão para criar contas de usuário.',
            action: { type: 'none' },
          })
        }

        const cleanUsername = String(params.username).replace(/^@/, '').toLowerCase().trim()
        const defaultPassword = (params.password as string) || 'Hub@123456'

        const { data: existing } = await admin
          .from('profiles')
          .select('id')
          .ilike('username', cleanUsername)
          .maybeSingle()

        if (existing) {
          return json({
            reply: `O username @${cleanUsername} já está cadastrado.`,
            action: { type: 'none' },
          })
        }

        const { data: createdAuth, error: createAuthError } = await admin.auth.admin.createUser({
          email: params.email as string,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: params.full_name || cleanUsername },
        })

        if (createAuthError) {
          return json({
            reply: `Erro ao cadastrar usuário: ${createAuthError.message}`,
            action: { type: 'none' },
          })
        }

        if (createdAuth?.user) {
          await admin.from('profiles').upsert({
            id: createdAuth.user.id,
            username: cleanUsername,
            full_name: (params.full_name as string) || cleanUsername,
            role: (params.role as 'admin' | 'member') || 'member',
          })
          actionResult = {
            success: true,
            username: cleanUsername,
            email: params.email,
            password: defaultPassword,
          }
        }
      }
    }

    const finalReply =
      aiParsed.reply ||
      (aiParsed.action?.type === 'create_project'
        ? 'Projeto criado com sucesso.'
        : aiParsed.action?.type === 'create_task'
          ? 'Tarefa criada com sucesso.'
          : aiParsed.action?.type === 'create_user'
            ? 'Usuário criado com sucesso.'
            : aiParsed.action?.type === 'update_task'
              ? 'Tarefa atualizada com sucesso.'
              : aiParsed.action?.type === 'delete_task'
                ? 'Tarefa excluída com sucesso.'
                : aiParsed.action?.type === 'duplicate_task'
                  ? 'Tarefa duplicada com sucesso.'
                  : 'Comando processado com sucesso.')

    return json({
      reply: finalReply,
      action: aiParsed.action,
      actionResult,
    })
  } catch (error) {
    console.error('AI Assistant Error:', error)
    return json(
      {
        error: error instanceof Error ? error.message : 'Erro no processamento da IA.',
      },
      500,
    )
  }
})
