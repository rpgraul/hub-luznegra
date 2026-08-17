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
    | 'duplicate_task'
    | 'break_down_subtasks'
    | 'list_overdue'
    | 'bulk_status_update'
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
      .slice(0, 20)
      .map(
        (t) =>
          `[ID: ${t.id}] "${t.title}" | Status: ${t.status} | Prioridade: ${t.priority} | Vence: ${t.due_date || 'sem data'}`,
      )
      .join('\n')

    // 2. Monta o system prompt para o DeepSeek
    const systemPrompt = `Você é o "Lord Camarão" (🦐), o assistente de inteligência artificial do Hub da Editora Luz Negra, especialista em gestão ágil de tarefas, organização editorial e produtividade.
Hoje é: ${new Date().toISOString().slice(0, 10)}.
Usuário atual ID: ${userId}
Projeto ativo ID: ${context.projectId || 'Nenhum'}

Projetos disponíveis:
${projectsMap || 'Nenhum'}

Membros da equipe (para atribuição @username):
${membersMap || 'Nenhum'}

Tarefas recentes no projeto ativo:
${tasksSnippet || 'Nenhuma tarefa'}

Seu objetivo é responder em Português do Brasil (pt-BR) de forma amigável, clara e objetiva, e quando o usuário solicitar uma ação no sistema, retornar um JSON estruturado.

FORMATO OBRIGATÓRIO DE RESPOSTA (JSON):
Sua resposta DEVE ser um objeto JSON válido no formato:
{
  "reply": "Sua mensagem explicativa ou resumo amigável em Markdown em pt-BR",
  "action": {
    "type": "create_task" | "duplicate_task" | "break_down_subtasks" | "list_overdue" | "bulk_status_update" | "draft_email" | "none",
    "params": {
      // parâmetros específicos da ação:
      // Para create_task: { "title": string, "project_id": string, "priority": "low"|"medium"|"high"|"urgent", "assigned_to": string (UUID do membro), "due_date": "YYYY-MM-DD"|null, "start_date": "YYYY-MM-DD"|null }
      // Para duplicate_task: { "source_task_title": string, "new_title"?: string, "assigned_to"?: string, "due_date"?: string }
      // Para break_down_subtasks: { "parent_task_title": string, "subtasks": [string] }
      // Para bulk_status_update: { "project_id": string, "from_priority"?: string, "target_status": "done"|"in_progress"|"todo"|"backlog"|"review" }
    }
  }
}
Responda APENAS com o JSON válido, sem cercas de código markdown antes ou depois se possível.`

    // 3. Chamada ao DeepSeek / OpenAI
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('OPENAI_API_KEY')
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
        ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
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
          temperature: 0.3,
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
      if (lower.includes('crie uma tarefa') || lower.includes('criar tarefa') || lower.includes('nova tarefa')) {
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
- *Criar tarefas com prioridade e responsável*
- *Quebrar tarefas em subtarefas*
- *Duplicar tarefas alterando datas*
- *Concluir tarefas em lote*`,
          action: { type: 'none' },
        }
      }
    }

    // 4. Executa a ação no banco de dados se aplicável
    let actionResult: Record<string, unknown> | null = null

    if (aiParsed.action && aiParsed.action.type !== 'none') {
      const { type, params = {} } = aiParsed.action

      if (type === 'create_task' && params.title) {
        const projectIdToUse = (params.project_id as string) || context.projectId || projects?.[0]?.id
        if (projectIdToUse) {
          const { data: created, error: createError } = await admin
            .from('tasks')
            .insert({
              title: params.title as string,
              project_id: projectIdToUse,
              priority: (params.priority as string) || 'medium',
              status: 'todo',
              assigned_to: (params.assigned_to as string) || userId,
              due_date: (params.due_date as string) || null,
              start_date: (params.start_date as string) || null,
              created_by: userId,
            })
            .select()
            .single()

          if (!createError && created) {
            actionResult = { success: true, createdTask: created }
          }
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
      }
    }

    return json({
      reply: aiParsed.reply,
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
