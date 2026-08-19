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
    | 'update_tasks'
    | 'delete_task'
    | 'create_user'
    | 'send_email'
    | 'send_notification'
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

    // Lista de membros e e-mails (para envio de e-mails e menções/notificações)
    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const emailByUser = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email]))
    const userByEmail = new Map((authUsers?.users ?? []).map((u) => [u.email?.toLowerCase(), u.id]))

    const { data: members } = await admin
      .from('profiles')
      .select('id, username, full_name, role')

    const membersWithEmail = (members ?? []).map((m) => ({
      ...m,
      email: emailByUser.get(m.id) || null,
    }))

    let currentProjectTasks: Array<{
      id: string
      title: string
      status: string
      priority: string
      due_date: string | null
      start_date: string | null
      assigned_to: string | null
      parent_id: string | null
      project_id: string
    }> = []

    let taskQuery = admin
      .from('tasks')
      .select('id, title, status, priority, due_date, start_date, assigned_to, parent_id, project_id')

    if (context.projectId) {
      taskQuery = taskQuery.eq('project_id', context.projectId)
    }

    const { data: tasks } = await taskQuery.limit(80)
    currentProjectTasks = tasks ?? []

    const membersMap = membersWithEmail
      .map((m) => `@${m.username} (${m.full_name || m.username}, email: ${m.email || 'não cadastrado'}, id: ${m.id})`)
      .join('\n')
    const projectsMap = (projects ?? []).map((p) => `"${p.name}" (id: ${p.id})`).join(', ')
    const tasksSnippet = currentProjectTasks
      .slice(0, 40)
      .map((t) => `[${t.id}] "${t.title}" (status: ${t.status}, prioridade: ${t.priority}, início: ${t.start_date || 's/data'}, fim: ${t.due_date || 's/data'}, responsável_id: ${t.assigned_to || 'nenhum'}${t.parent_id ? `, pai_id: ${t.parent_id}` : ''})`)
      .join('\n')

    // 2. Monta o system prompt completo
    const systemPrompt = `Você é o Lorde Camarão, assistente de IA do Hub da Editora Luz Negra.
Hoje: ${new Date().toISOString().slice(0, 10)}. Usuário logado ID: ${userId}. Admin: ${isUserAdmin ? 'Sim' : 'Não'}. Projeto ativo ID: ${context.projectId || 'Nenhum'}.

Projetos cadastrados:
${projectsMap || 'Nenhum'}

Membros da equipe (reconheça nomes, usernames e e-mails):
${membersMap || 'Nenhum'}

Tarefas existentes (use os IDs e títulos reais para coletar dados, links e referenciar):
${tasksSnippet || 'Nenhuma tarefa encontrada.'}

DIRETRIZES DE RESPOSTA E PODERES:
- Responda em Português do Brasil de forma extremamente DIRETA, OBJETIVA e CONCISA.
- NÃO use emojis em nenhuma hipótese.
- Máximo de 1 a 3 frases explicando o que foi feito ou o motivo caso não tenha sido possível.
- ENVIAR E-MAIL (send_email):
  Quando o usuário pedir para enviar e-mail (ex: "Envie um e-mail para o Raul sobre a tarefa X", "mande um email com o prazo da tarefa Y para o diego"):
  1. Identifique o destinatário na lista de membros (por nome, username ou @username). Se ele não tiver e-mail ou não for encontrado, informe na resposta.
  2. Identifique a tarefa mencionada na lista de tarefas para extrair seus dados (título, prazo, status, link https://hub.luznegra.com.br/task/{id}).
  3. Gere a ação "send_email" com os campos:
     action: send_email, params: {
       "recipient": string (username, nome, ou e-mail),
       "subject": string (assunto do e-mail),
       "body": string (mensagem em texto claro ou HTML com detalhes da tarefa e link caso aplicável),
       "task_id"?: string (ID da tarefa vinculada se houver)
     }
- ENVIAR NOTIFICAÇÃO IN-APP (send_notification):
  Quando o usuário pedir para alertar/notificar um membro na plataforma:
  action: send_notification, params: {
    "recipient": string (username, nome, ou user_id),
    "type": "mention" | "task_assigned" | "due_date_reminder",
    "content": string (texto da notificação),
    "task_id"?: string (ID da tarefa para gerar o link direto)
  }
- Se o usuário pedir para sequenciar ou ajustar prazos de subtarefas:
  action: update_tasks, params: { "tasks": [ { "task_id": string, "task_title": string, "start_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD" } ] }
- Se o usuário pedir para criar projeto:
  action: create_project, params: { "name": string, "color"?: string }
- Se o usuário pedir algo que você NÃO encontrou no banco (ex: tarefa inexistente ou usuário não encontrado), explique na "reply" com clareza ("Não encontrei a tarefa 'X'." ou "Usuário 'Y' não encontrado.") e retorne "action": { "type": "none" }.

FORMATO OBRIGATÓRIO (JSON puro):
{
  "reply": "Explicação curta e direta sobre o que foi executado.",
  "action": {
    "type": "send_email" | "send_notification" | "create_task" | "create_project" | "update_task" | "update_tasks" | "delete_task" | "duplicate_task" | "break_down_subtasks" | "list_overdue" | "bulk_status_update" | "create_user" | "none",
    "params": { ... }
  }
}`

    // 3. Chamada ao DeepSeek / OpenAI
    const rawKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('OPENAI_API_KEY') || ''
    const deepseekApiKey = rawKey.trim().replace(/^["']|["']$/g, '')
    let aiParsed: AIResponseStructure = {
      reply: 'Não foi possível interpretar o comando.',
      action: { type: 'none' },
    }

    if (deepseekApiKey) {
      const endpoint = Deno.env.get('DEEPSEEK_API_KEY')
        ? 'https://api.deepseek.com/chat/completions'
        : 'https://api.openai.com/v1/chat/completions'

      const model =
        Deno.env.get('DEEPSEEK_MODEL') ||
        (Deno.env.get('DEEPSEEK_API_KEY') ? 'deepseek-chat' : 'gpt-4o-mini')

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
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
          max_tokens: 2048,
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

      function tryParseJson(str: string): Record<string, unknown> | null {
        try {
          return JSON.parse(str)
        } catch {
          // Tenta reparar JSON truncado fechando colchetes e chaves
          const attempts = [
            str + ']}',
            str + '"}]}}',
            str + '"]}}',
            str + '}}',
            str + '}',
          ]
          for (const att of attempts) {
            try {
              return JSON.parse(att)
            } catch {
              // continua
            }
          }
          return null
        }
      }

      const parsedObj = tryParseJson(cleanContent)
      if (parsedObj) {
        aiParsed = parsedObj as unknown as AIResponseStructure
      } else {
        // Se mesmo assim não parsear, extrai texto se houver
        const replyMatch = cleanContent.match(/"reply"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/)
        aiParsed = {
          reply: replyMatch ? replyMatch[1].replace(/\\"/g, '"') : cleanContent,
          action: { type: 'none' },
        }
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
      } else if (type === 'update_tasks' && Array.isArray(params.tasks)) {
        const updatedList: unknown[] = []
        for (const item of params.tasks as Array<Record<string, unknown>>) {
          let taskId = item.task_id as string | undefined
          if (!taskId && item.task_title) {
            const { data: found } = await admin
              .from('tasks')
              .select('id')
              .ilike('title', `%${item.task_title}%`)
              .limit(1)
            taskId = found?.[0]?.id
          }

          if (taskId) {
            const patch: Record<string, unknown> = {}
            if (item.status) patch.status = item.status
            if (item.priority) patch.priority = item.priority
            if (item.title) patch.title = item.title
            if (item.assigned_to) patch.assigned_to = resolveMemberId(item.assigned_to)
            if (item.due_date !== undefined) patch.due_date = normalizeDate(item.due_date)
            if (item.start_date !== undefined) patch.start_date = normalizeDate(item.start_date)

            const { data: updated } = await admin
              .from('tasks')
              .update(patch)
              .eq('id', taskId)
              .select()
              .single()

            if (updated) updatedList.push(updated)
          }
        }
        actionResult = { success: true, count: updatedList.length, tasks: updatedList }
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
      } else if (type === 'send_email') {
        const recipient = String(params.recipient || '').trim()
        const subject = String(params.subject || 'Notificação do Hub - Editora Luz Negra').trim()
        let bodyHtml = String(params.body || '').trim()
        const taskId = (params.task_id as string) || null

        // Descobre o e-mail do destinatário
        let targetEmail: string | null = null
        let targetUser = membersWithEmail.find(
          (m) =>
            m.email?.toLowerCase() === recipient.toLowerCase() ||
            m.username.toLowerCase() === recipient.replace(/^@/, '').toLowerCase() ||
            m.id === recipient ||
            (m.full_name && m.full_name.toLowerCase().includes(recipient.toLowerCase()))
        )

        if (targetUser?.email) {
          targetEmail = targetUser.email
        } else if (recipient.includes('@') && recipient.includes('.')) {
          targetEmail = recipient
        }

        if (!targetEmail) {
          return json({
            reply: `Não foi possível encontrar o e-mail para o usuário "${recipient}".`,
            action: { type: 'none' },
          })
        }

        // Se houver uma tarefa referenciada e o corpo não incluir HTML rico, monta formato elegante
        if (!bodyHtml.includes('<p>') && !bodyHtml.includes('<div>')) {
          bodyHtml = `<p>${bodyHtml.replace(/\n/g, '<br/>')}</p>`
        }

        if (taskId && !bodyHtml.includes(`/task/${taskId}`)) {
          bodyHtml += `<p style="margin-top: 16px;"><a href="https://hub.luznegra.com.br/task/${taskId}" style="background-color: #7b68ee; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Abrir Tarefa no Hub</a></p>`
        }

        // Envia via Resend diretamente se a chave estiver presente
        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        let emailSentDirectly = false

        if (resendApiKey) {
          try {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'no-reply@hub.luznegra.com.br',
                to: targetEmail,
                subject,
                html: bodyHtml,
              }),
            })
            if (res.ok) {
              emailSentDirectly = true
            } else {
              console.warn('Resend direct send failed, queuing instead:', await res.text())
            }
          } catch (resendErr) {
            console.warn('Resend direct fetch error, fallback to queue:', resendErr)
          }
        }

        // Se houver tabela email_queue, registra como log
        try {
          await admin.from('email_queue').insert({
            to_email: targetEmail,
            subject,
            html: bodyHtml,
            task_id: taskId,
            status: emailSentDirectly ? 'sent' : 'pending',
          })
        } catch {
          // ignora caso a tabela email_queue seja opcional
        }

        actionResult = {
          success: true,
          recipient: targetEmail,
          subject,
          direct: emailSentDirectly,
        }
      } else if (type === 'send_notification') {
        const recipient = String(params.recipient || '').trim()
        const notifType = (params.type as 'mention' | 'task_assigned' | 'due_date_reminder') || 'mention'
        const content = String(params.content || '').trim()
        const taskId = (params.task_id as string) || null

        let targetUserId: string | null = null
        const targetUser = membersWithEmail.find(
          (m) =>
            m.username.toLowerCase() === recipient.replace(/^@/, '').toLowerCase() ||
            m.id === recipient ||
            (m.full_name && m.full_name.toLowerCase().includes(recipient.toLowerCase())) ||
            m.email?.toLowerCase() === recipient.toLowerCase()
        )

        if (targetUser) {
          targetUserId = targetUser.id
        }

        if (!targetUserId) {
          return json({
            reply: `Não foi possível encontrar o usuário "${recipient}" para enviar a notificação.`,
            action: { type: 'none' },
          })
        }

        const { data: createdNotif, error: notifErr } = await admin
          .from('notifications')
          .insert({
            user_id: targetUserId,
            type: notifType,
            content,
            link: taskId ? `/task/${taskId}` : null,
            read: false,
          })
          .select()
          .single()

        if (notifErr) {
          console.error('Error inserting notification:', notifErr)
          return json({
            reply: `Erro ao emitir notificação: ${notifErr.message}`,
            action: { type: 'none' },
          })
        }

        actionResult = {
          success: true,
          notification: createdNotif,
        }
      }
    }

    const finalReply =
      aiParsed.reply ||
      (aiParsed.action?.type === 'send_email'
        ? 'E-mail enviado com sucesso.'
        : aiParsed.action?.type === 'send_notification'
          ? 'Notificação enviada com sucesso.'
          : aiParsed.action?.type === 'create_project'
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
