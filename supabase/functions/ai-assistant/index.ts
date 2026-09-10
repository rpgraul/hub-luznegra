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
    | 'create_link'
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
      .select('id, username, full_name, role')
      .eq('id', userId)
      .maybeSingle()
    const isUserAdmin = requesterProfile?.role === 'admin'

    const { data: projects } = await admin
      .from('projects')
      .select('id, name, color')
      .eq('archived', false)

    // Lista de membros e e-mails (para envio de e-mails e menções/notificações)
    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const emailByUser = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email]))

    const { data: members } = await admin
      .from('profiles')
      .select('id, username, full_name, role')

    const membersWithEmail = (members ?? []).map((m) => ({
      ...m,
      email: emailByUser.get(m.id) || null,
    }))

    // Buscar tarefas recentes de todos os projetos ordenadas por última modificação (updated_at DESC)
    const { data: allRecentTasks } = await admin
      .from('tasks')
      .select('id, title, status, priority, due_date, start_date, assigned_to, assignees, parent_id, project_id, categories, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(160)

    let currentProjectTasks: Array<{
      id: string
      title: string
      status: string
      priority: string
      due_date: string | null
      start_date: string | null
      assigned_to: string | null
      assignees?: string[] | null
      categories?: string[] | null
      parent_id: string | null
      project_id: string
      created_at: string
      updated_at: string
    }> = (allRecentTasks as any) ?? []

    // 1.1 Links e Documentos cadastrados no Hub
    const { data: hubLinks } = await admin
      .from('hub_links')
      .select('id, title, url, description, tags')
      .limit(40)

    const { data: hubDocs } = await admin
      .from('hub_documents')
      .select('id, title, file_name, file_type, tags, file_url, extracted_text')
      .limit(30)

    const membersMap = membersWithEmail
      .map((m) => `@${m.username} (${m.full_name || m.username}, email: ${m.email || 'não cadastrado'}, id: ${m.id})`)
      .join('\n')
    const projectsMap = (projects ?? []).map((p) => `"${p.name}" (id: ${p.id})`).join(', ')
    const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]))
    const memberNameById = new Map(
      (members ?? []).map((m) => [m.id, `@${m.username} (${m.full_name || m.username})`])
    )

    function formatDateTimePtBr(isoStr: string | null | undefined): string {
      if (!isoStr) return 's/data'
      try {
        const d = new Date(isoStr)
        if (isNaN(d.getTime())) return isoStr
        return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' })
      } catch {
        return isoStr
      }
    }

    function formatPtBrDate(dateStr: string | null | undefined): string {
      if (!dateStr) return 's/data'
      const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (m) return `${m[3]}/${m[2]}/${m[1]}`
      return dateStr
    }

    const statusPtBr: Record<string, string> = {
      uncertain: 'Incerto',
      backlog: 'Backlog',
      todo: 'A Fazer',
      in_progress: 'Em Andamento',
      review: 'Revisão',
      done: 'Concluído',
    }

    const priorityPtBr: Record<string, string> = {
      urgent: 'Urgente',
      high: 'Alta',
      medium: 'Normal/Média',
      low: 'Baixa',
    }

    const tasksSnippet = currentProjectTasks
      .slice(0, 100)
      .map((t) => {
        const projName = projectNameById.get(t.project_id) || 'Sem projeto'
        const assignedNames: string[] = []
        if (t.assigned_to) {
          assignedNames.push(memberNameById.get(t.assigned_to) || t.assigned_to)
        }
        if (Array.isArray(t.assignees)) {
          for (const uid of t.assignees) {
            if (uid && uid !== t.assigned_to) {
              assignedNames.push(memberNameById.get(uid) || uid)
            }
          }
        }
        const respStr = assignedNames.length > 0 ? assignedNames.join(', ') : 'Nenhum'
        const createdStr = formatDateTimePtBr(t.created_at)
        const updatedStr = formatDateTimePtBr(t.updated_at)
        const startStr = formatPtBrDate(t.start_date)
        const dueStr = formatPtBrDate(t.due_date)
        const statusLabel = statusPtBr[t.status] || t.status
        const priorityLabel = priorityPtBr[t.priority] || t.priority

        return `- [ID: ${t.id}] "${t.title}" (Projeto: "${projName}", Status: ${statusLabel} [${t.status}], Prioridade: ${priorityLabel} [${t.priority}], Responsáveis: ${respStr}, Categorias: [${(t.categories || []).join(', ')}], Início: ${startStr}, Prazo: ${dueStr}, Criada em: ${createdStr} [${t.created_at}], Última atualização: ${updatedStr} [${t.updated_at}]${t.parent_id ? `, Subtarefa de: ${t.parent_id}` : ''})`
      })
      .join('\n')

    const linksSnippet = (hubLinks ?? [])
      .map((l) => `- [${l.id}] "${l.title}" (URL: ${l.url}, Tags: [${(l.tags || []).join(', ')}], Descrição: "${l.description || 's/desc'}")`)
      .join('\n')

    const lastUserMsg = (message || '').toLowerCase()

    const docsSnippet = (hubDocs ?? [])
      .map((d) => {
        if (!d.extracted_text) {
          return `- [${d.id}] "${d.title}" (${d.file_name}, tipo: ${d.file_type}, Tags: [${(d.tags || []).join(', ')}], Link: ${d.file_url}, Conteúdo: "s/texto extraído")`
        }
        // Inclui até 8.000 caracteres do texto extraído para garantir que contratos, planilhas e relatórios estejam completos
        const isMatched = lastUserMsg && (
          d.title.toLowerCase().includes(lastUserMsg) ||
          d.file_name.toLowerCase().includes(lastUserMsg) ||
          lastUserMsg.split(/\s+/).some((w) => w.length > 3 && d.title.toLowerCase().includes(w))
        )
        const limit = isMatched ? 15000 : 8000
        const textContent = d.extracted_text.length > limit
          ? d.extracted_text.slice(0, limit) + '\n...[texto continuado/truncado]'
          : d.extracted_text

        return `- [${d.id}] "${d.title}" (${d.file_name}, tipo: ${d.file_type}, Tags: [${(d.tags || []).join(', ')}], Link: ${d.file_url})\n  Conteúdo Integral Extraído:\n  """\n${textContent}\n  """`
      })
      .join('\n\n')

    const now = new Date()
    const nowPtBr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'medium' })
    const nowIso = now.toISOString()

    // 2. Monta o system prompt completo
    const systemPrompt = `Você é o Lorde Camarão, assistente de IA do Hub da Editora Luz Negra.
Data e hora atual (Horário de Brasília): ${nowPtBr} (ISO: ${nowIso}).
Hoje: ${nowIso.slice(0, 10)}. Usuário logado: ${requesterProfile ? `@${requesterProfile.username} (${requesterProfile.full_name || requesterProfile.username})` : userId} (ID: ${userId}). Admin: ${isUserAdmin ? 'Sim' : 'Não'}. Projeto ativo ID: ${context.projectId || 'Nenhum'}.

Projetos cadastrados:
${projectsMap || 'Nenhum'}

Membros da equipe (reconheça nomes, usernames e e-mails para atribuição, filtros e mensagens):
${membersMap || 'Nenhum'}

Tarefas cadastradas no Hub (ordenadas pelas atualizações mais recentes; use os campos 'Última atualização' e 'Criada em' para responder com precisão sobre modificações recentes, mudanças de status, novos itens ou prazos):
${tasksSnippet || 'Nenhuma tarefa encontrada.'}

Links úteis cadastrados:
${linksSnippet || 'Nenhum link cadastrado.'}

Documentos e Contratos cadastrados:
${docsSnippet || 'Nenhum documento cadastrado.'}

DIRETRIZES DE RESPOSTA E PODERES:
- Responda sempre em Português do Brasil de forma clara, prestativa e estruturada.
- NÃO use emojis em nenhuma hipótese.

- CONSULTAS, LISTAGENS E RELATÓRIOS SOBRE TAREFAS (action: { "type": "none" }):
  Quando o usuário fizer perguntas ou pedir listagens, relatórios, checagens sobre tarefas, status, prazos, membros ou atualizações recentes:
  (Exemplos: "quais tarefas foram atualizadas ou criadas nos ultimos 2 dias?", "mudei o status de uma tarefa hoje mesmo", "pode checar os itens que tiveram status alterado?", "listar tarefas de todos os usuarios", "quais tarefas estão em andamento?", "quais tarefas foram criadas hoje?"):
  1. NÃO faça nenhuma ação de mutação no banco de dados. Retorne action: { "type": "none" }.
  2. Analise atentamente os campos "Criada em" e "Última atualização" de TODAS as tarefas fornecidas no contexto, comparando com a "Data e hora atual" (${nowPtBr}).
  3. Identifique com exatidão quais tarefas foram modificadas ou criadas no período solicitado pelo usuário (ou que foram alteradas recentemente/hoje).
  4. Responda no campo "reply" com uma listagem detalhada e organizada em Markdown:
     - Para cada tarefa encontrada:
       - **Título da Tarefa** (Projeto: Nome do Projeto)
         - Status atual: Status da tarefa (ex: Em Andamento, Concluído, etc.)
         - Responsável(is): Nome/username dos responsáveis
         - Última atualização: DD/MM/YYYY às HH:mm
         - Criada em: DD/MM/YYYY às HH:mm
         - Prazo: DD/MM/YYYY (se houver)
  5. Se nenhuma tarefa atender ao critério, explique com clareza informando as datas consideradas e quando ocorreu a tarefa atualizada mais recente.
  6. NUNCA responda apenas "Comando processado com sucesso." para perguntas, listagens, relatórios ou dúvidas!

- AÇÕES NO BANCO DE DADOS (apenas quando expressamente solicitado para criar, alterar ou excluir dados):
  - ATRIBUIR / ALTERAR RESPONSÁVEL OU ATUALIZAR TAREFA (update_task):
    Quando o usuário pedir para atribuir, trocar responsável, delegar, alterar status, prioridade ou prazos:
    (Exemplos: "Adicione Raul como responsável da tarefa Revisão", "Atribua a tarefa Diagramação para o Diego", "Coloque Diego na tarefa X", "Passe a tarefa Y para @diego", "Mude o status de X para in_progress", "Coloque prioridade alta na tarefa Y"):
    action: update_task, params: {
      "task_id"?: string (ID real da tarefa se identificado),
      "task_title"?: string (título da tarefa para localização),
      "assigned_to"?: string (username, nome, ou @username do responsável, ex: "diego", "raul", "@diego"),
      "status"?: "uncertain" | "backlog" | "todo" | "in_progress" | "review" | "done",
      "priority"?: "urgent" | "high" | "normal" | "low",
      "categories"?: string[] (ex: ["ig", "rpg"]),
      "due_date"?: "YYYY-MM-DD",
      "start_date"?: "YYYY-MM-DD"
    }
  - ATUALIZAR VÁRIAS TAREFAS / SEQUENCIAR (update_tasks):
    Quando o usuário pedir para sequenciar ou ajustar prazos/responsáveis de múltiplas tarefas:
    action: update_tasks, params: {
      "tasks": [
        {
          "task_id"?: string,
          "task_title"?: string,
          "assigned_to"?: string,
          "status"?: "uncertain" | "backlog" | "todo" | "in_progress" | "review" | "done",
          "priority"?: "urgent" | "high" | "normal" | "low",
          "categories"?: string[],
          "start_date"?: "YYYY-MM-DD",
          "due_date"?: "YYYY-MM-DD"
        }
      ]
    }
  - CRIAR TAREFA OU SUBTAREFAS (create_task):
    action: create_task, params: {
      "title": string,
      "assigned_to"?: string (username ou nome do membro),
      "priority"?: "urgent" | "high" | "normal" | "low",
      "categories"?: string[] (ex: ["ig", "rpg"]),
      "due_date"?: "YYYY-MM-DD",
      "start_date"?: "YYYY-MM-DD",
      "subtasks"?: string[]
    }
  - CONSULTA A DOCUMENTOS E CONTRATOS:
    Quando o usuário perguntar sobre contratos, documentos, planilhas ou relatórios da Editora Luz Negra (ex: partes envolvidas, contratante, contratado, valores totais, parcelas, prazos de entrega, envio à gráfica, cláusulas contratuais), CONSULTE ATENTAMENTE a seção "Conteúdo Integral Extraído" dos documentos e responda com precisão aos dados solicitados, citando os valores (ex: R$), datas, nomes das partes e itens do documento.
    OBRIGATÓRIO: Sempre que responder sobre um documento ou contrato, inclua no final da resposta o botão/link interativo no formato exato: [Abrir: Nome do Documento](doc:ID_DO_DOCUMENTO) para que o usuário possa clicar e conferir o arquivo no modal com 1 clique.
  - LINKS ÚTEIS E WEBSITES:
    Sempre que o usuário perguntar por links ou quando você citar drives, artes, sites ou páginas cadastradas, inclua o link clicável no formato markdown [Nome do Link](URL) para que o usuário possa abrir com 1 clique.
  - CRIAR LINK ÚTIL (create_link):
    Se o usuário pedir para salvar um link útil (ex: "Salve o link do drive https://... com título Artes 2026"):
    action: create_link, params: {
      "title": string,
      "url": string,
      "description"?: string,
      "tags"?: string[]
    }
  - ENVIAR E-MAIL IMEDIATO (send_email):
    Quando o usuário pedir para enviar e-mail:
    action: send_email, params: {
      "recipient": string (username, nome, ou e-mail),
      "subject": string (assunto do e-mail),
      "body": string (mensagem em texto claro com detalhes da tarefa; destaque o título da tarefa em negrito e datas em DD/MM/YYYY),
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
  - CRIAR PROJETO (create_project):
    action: create_project, params: { "name": string, "color"?: string }
  - Se o usuário pedir algo que você NÃO encontrou no banco (ex: tarefa inexistente ou usuário não encontrado), explique na "reply" com clareza ("Não encontrei a tarefa 'X'." ou "Usuário 'Y' não encontrado.") e retorne "action": { "type": "none" }.

FORMATO OBRIGATÓRIO (JSON puro):
{
  "reply": "Texto de resposta detalhado, relatório ou explicação sobre o que foi executado.",
  "action": {
    "type": "update_task" | "update_tasks" | "create_task" | "create_project" | "create_link" | "send_email" | "send_notification" | "delete_task" | "duplicate_task" | "break_down_subtasks" | "none",
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
      } else if (
        lower.includes('atualizad') ||
        lower.includes('criad') ||
        lower.includes('modificad') ||
        lower.includes('alterad') ||
        lower.includes('status') ||
        lower.includes('últimos') ||
        lower.includes('ultimos') ||
        lower.includes('hoje')
      ) {
        let days = 2
        const daysMatch = lower.match(/(?:últimos|ultimos|ultimas|últimas)\s+(\d+)\s+dias?/i)
        if (daysMatch) {
          days = parseInt(daysMatch[1], 10) || 2
        } else if (lower.includes('hoje')) {
          days = 1
        }

        const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
        const isTodayOnly = lower.includes('hoje')

        const matchedTasks = currentProjectTasks.filter((t) => {
          const uTime = new Date(t.updated_at).getTime()
          const cTime = new Date(t.created_at).getTime()
          if (isTodayOnly) {
            const todayStart = new Date().setHours(0, 0, 0, 0)
            return uTime >= todayStart || cTime >= todayStart
          }
          return uTime >= cutoffTime || cTime >= cutoffTime
        })

        if (matchedTasks.length > 0) {
          const listText = matchedTasks
            .map((t) => {
              const proj = projectNameById.get(t.project_id) || 'Sem projeto'
              const assignedNames: string[] = []
              if (t.assigned_to) {
                assignedNames.push(memberNameById.get(t.assigned_to) || t.assigned_to)
              }
              if (Array.isArray(t.assignees)) {
                for (const uid of t.assignees) {
                  if (uid && uid !== t.assigned_to) {
                    assignedNames.push(memberNameById.get(uid) || uid)
                  }
                }
              }
              const resp = assignedNames.length > 0 ? assignedNames.join(', ') : 'Nenhum'
              const st = statusPtBr[t.status] || t.status
              const upStr = formatDateTimePtBr(t.updated_at)
              const crStr = formatDateTimePtBr(t.created_at)

              return `• **${t.title}** (Projeto: *${proj}*)\n  - Status: **${st}**\n  - Responsável: ${resp}\n  - Última atualização: ${upStr}\n  - Criada em: ${crStr}`
            })
            .join('\n\n')

          aiParsed = {
            reply: `Encontrei **${matchedTasks.length} tarefa(s)** atualizada(s) ou criada(s) ${isTodayOnly ? 'hoje' : `nos últimos ${days} dias`}:\n\n${listText}`,
            action: { type: 'none' },
          }
        } else {
          aiParsed = {
            reply: `Não foram encontradas tarefas atualizadas ou criadas ${isTodayOnly ? 'hoje' : `nos últimos ${days} dias`}.`,
            action: { type: 'none' },
          }
        }
      } else {
        aiParsed = {
          reply: `Olá! Sou o Lorde Camarão, assistente do Hub. Você pode me pedir para:
- *Listar tarefas atualizadas ou criadas recentemente*
- *Verificar tarefas por responsável ou status*
- *Criar projetos ou tarefas*
- *Quebrar tarefas em subtarefas*
- *Alterar responsáveis, prazos ou prioridades*
- *Enviar e-mails ou notificações*`,
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

    function resolveMemberId(identifier: unknown): string | null {
      if (!identifier) return null
      if (typeof identifier !== 'string') return null
      const raw = identifier.trim()
      if (
        !raw ||
        [
          'none',
          'null',
          'nenhum',
          'desatribuir',
          'remover',
          'sem responsável',
          'sem_responsavel',
          'ninguem',
          'ninguém',
        ].includes(raw.toLowerCase())
      ) {
        return null
      }

      const clean = raw.replace(/^@/, '').toLowerCase().trim()

      // 1. Direct UUID match
      const byId = (members ?? []).find((m) => m.id === clean)
      if (byId) return byId.id

      // 2. Exact username match
      const byUsername = (members ?? []).find((m) => m.username.toLowerCase() === clean)
      if (byUsername) return byUsername.id

      // 3. Exact full_name match
      const byFullName = (members ?? []).find(
        (m) => m.full_name && m.full_name.toLowerCase() === clean
      )
      if (byFullName) return byFullName.id

      // 4. Word in full name (e.g. "diego" in "Diego Santos")
      const byWordInName = (members ?? []).find((m) => {
        if (!m.full_name) return false
        const parts = m.full_name.toLowerCase().split(/\s+/)
        return parts.includes(clean) || m.full_name.toLowerCase().startsWith(clean)
      })
      if (byWordInName) return byWordInName.id

      // 5. Partial full_name contains
      const byPartialName = (members ?? []).find(
        (m) => m.full_name && m.full_name.toLowerCase().includes(clean)
      )
      if (byPartialName) return byPartialName.id

      // 6. Partial username contains
      const byPartialUsername = (members ?? []).find(
        (m) => m.username.toLowerCase().includes(clean) || clean.includes(m.username.toLowerCase())
      )
      if (byPartialUsername) return byPartialUsername.id

      // 7. Email match
      const byEmail = (membersWithEmail ?? []).find(
        (m) => m.email && m.email.toLowerCase().includes(clean)
      )
      if (byEmail) return byEmail.id

      return null
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
            const assignedUser = resolveMemberId(item.assigned_to || params.assigned_to) || userId
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
                categories: Array.isArray(item.categories)
                  ? (item.categories as string[])
                  : Array.isArray(params.categories)
                    ? (params.categories as string[])
                    : [],
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
      } else if (type === 'create_link' && params.title && params.url) {
        const { data: createdLink, error: linkError } = await admin
          .from('hub_links')
          .insert({
            title: String(params.title).trim(),
            url: String(params.url).trim(),
            description: (params.description as string) || null,
            tags: Array.isArray(params.tags) ? params.tags : [],
            created_by: userId,
          })
          .select()
          .single()

        if (linkError) {
          console.error('Link create error:', linkError)
        } else {
          actionResult = { success: true, link: createdLink }
        }
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
      } else if (
        type === 'update_task' ||
        type === 'assign_task' ||
        type === 'assign_user' ||
        type === 'delegate_task' ||
        type === 'set_assignee'
      ) {
        let taskId = (params.task_id || params.id || params.taskId) as string | undefined
        const searchTitle = String(params.task_title || params.title || params.task_name || params.task || '').trim()

        // 1. Busca por título na lista de tarefas carregadas em memória
        if (!taskId && searchTitle) {
          const cleanSearch = searchTitle.toLowerCase().replace(/^["']|["']$/g, '').trim()
          const localMatch = currentProjectTasks.find(
            (t) =>
              t.title.toLowerCase() === cleanSearch ||
              t.title.toLowerCase().includes(cleanSearch) ||
              cleanSearch.includes(t.title.toLowerCase())
          )
          if (localMatch) {
            taskId = localMatch.id
          }
        }

        // 2. Busca no banco de dados se não achou em memória
        if (!taskId && searchTitle) {
          const cleanSearch = searchTitle.replace(/^["']|["']$/g, '').trim()
          const { data: found } = await admin
            .from('tasks')
            .select('id, title')
            .ilike('title', `%${cleanSearch}%`)
            .limit(1)
          taskId = found?.[0]?.id
        }

        if (taskId) {
          const patch: Record<string, unknown> = {}
          if (params.status) patch.status = params.status
          if (params.priority) patch.priority = params.priority
          if (params.title) patch.title = params.title

          const assignedParam =
            params.assigned_to ??
            params.responsible ??
            params.assignee ??
            params.member ??
            params.user ??
            params.responsavel
          if (assignedParam !== undefined) {
            patch.assigned_to = resolveMemberId(assignedParam)
          }

          if (params.due_date !== undefined) patch.due_date = normalizeDate(params.due_date)
          if (params.start_date !== undefined) patch.start_date = normalizeDate(params.start_date)
          if (params.categories !== undefined && Array.isArray(params.categories)) {
            patch.categories = (params.categories as string[]).map((c) => String(c).toLowerCase())
          }

          const { data: updated, error: updateErr } = await admin
            .from('tasks')
            .update(patch)
            .eq('id', taskId)
            .select()
            .single()

          if (updateErr) {
            console.error('Update task error:', updateErr)
            actionResult = { success: false, error: updateErr.message }
          } else {
            actionResult = { success: true, task: updated }
          }
        } else {
          actionResult = { success: false, error: `Tarefa "${searchTitle}" não encontrada.` }
        }
      } else if (type === 'update_tasks' && Array.isArray(params.tasks)) {
        const updatedList: unknown[] = []
        for (const item of params.tasks as Array<Record<string, unknown>>) {
          let taskId = (item.task_id || item.id || item.taskId) as string | undefined
          const searchTitle = String(item.task_title || item.title || item.task_name || item.task || '').trim()

          if (!taskId && searchTitle) {
            const cleanSearch = searchTitle.toLowerCase().replace(/^["']|["']$/g, '').trim()
            const localMatch = currentProjectTasks.find(
              (t) =>
                t.title.toLowerCase() === cleanSearch ||
                t.title.toLowerCase().includes(cleanSearch) ||
                cleanSearch.includes(t.title.toLowerCase())
            )
            if (localMatch) {
              taskId = localMatch.id
            }
          }

          if (!taskId && searchTitle) {
            const cleanSearch = searchTitle.replace(/^["']|["']$/g, '').trim()
            const { data: found } = await admin
              .from('tasks')
              .select('id, title')
              .ilike('title', `%${cleanSearch}%`)
              .limit(1)
            taskId = found?.[0]?.id
          }

          if (taskId) {
            const patch: Record<string, unknown> = {}
            if (item.status) patch.status = item.status
            if (item.priority) patch.priority = item.priority
            if (item.title) patch.title = item.title

            const assignedParam =
              item.assigned_to ??
              item.responsible ??
              item.assignee ??
              item.member ??
              item.user ??
              item.responsavel
            if (assignedParam !== undefined) {
              patch.assigned_to = resolveMemberId(assignedParam)
            }

            if (item.due_date !== undefined) patch.due_date = normalizeDate(item.due_date)
            if (item.start_date !== undefined) patch.start_date = normalizeDate(item.start_date)
            if (item.categories !== undefined && Array.isArray(item.categories)) {
              patch.categories = (item.categories as string[]).map((c) => String(c).toLowerCase())
            }

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

        // Busca dados completos da tarefa caso taskId esteja presente
        let taskData: { title: string; due_date: string | null; start_date: string | null; status: string; priority: string; project_id: string } | null = null
        if (taskId) {
          const { data: t } = await admin
            .from('tasks')
            .select('title, due_date, start_date, status, priority, project_id')
            .eq('id', taskId)
            .maybeSingle()
          if (t) taskData = t
        }

        function formatPtBrDate(dateStr: string | null | undefined): string {
          if (!dateStr) return 'Não definido'
          const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
          if (m) return `${m[3]}/${m[2]}/${m[1]}`
          const m2 = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
          if (m2) return dateStr
          return dateStr
        }

        // Converte datas no formato ISO dentro do texto do e-mail para DD/MM/YYYY
        bodyHtml = bodyHtml.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')

        const recipientName = targetUser?.full_name || targetUser?.username || recipient.replace(/^@/, '')
        const taskTitle = taskData?.title || ''
        const taskLink = taskId ? `https://hub.luznegra.com.br/task/${taskId}` : ''
        const taskDueDate = taskData?.due_date ? formatPtBrDate(taskData.due_date) : null

        // Monta template HTML profissional com identidade visual Hub / Editora Luz Negra
        const styledTemplate = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #1e293b; border: 1px solid #334155; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); border-bottom: 1px solid #4338ca;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">
                      HUB <span style="font-size: 13px; font-weight: 500; color: #a5b4fc; margin-left: 6px;">Editora Luz Negra</span>
                    </div>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-weight: 600; color: #c7d2fe; background-color: rgba(99, 102, 241, 0.3); border: 1px solid rgba(165, 180, 252, 0.2); padding: 4px 10px; border-radius: 20px;">Notificação</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px; font-size: 14px; line-height: 1.6; color: #e2e8f0;">
              <p style="margin-top: 0; margin-bottom: 20px; font-size: 15px; color: #f8fafc;">
                Olá, <strong>${recipientName}</strong>,
              </p>

              ${
                taskTitle
                  ? `<div style="margin: 20px 0; padding: 16px 20px; background-color: #0f172a; border-left: 4px solid #7b68ee; border-radius: 6px; border: 1px solid #334155;">
                      <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 4px;">Tarefa</div>
                      <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: ${taskDueDate ? '8px' : '0'};">
                        ${taskTitle}
                      </div>
                      ${
                        taskDueDate
                          ? `<div style="font-size: 13px; color: #cbd5e1;">
                              <span style="color: #94a3b8;">Prazo final:</span> <strong style="color: #f59e0b; background: rgba(245, 158, 11, 0.15); padding: 2px 6px; border-radius: 4px;">${taskDueDate}</strong>
                            </div>`
                          : ''
                      }
                    </div>`
                  : ''
              }

              <div style="margin: 20px 0; color: #cbd5e1;">
                ${
                  bodyHtml.includes('<p>') || bodyHtml.includes('<div>')
                    ? bodyHtml
                    : `<p style="margin: 0;">${bodyHtml.replace(/\n/g, '<br/>')}</p>`
                }
              </div>

              ${
                taskLink
                  ? `<div style="margin: 32px 0 20px; text-align: center;">
                      <a href="${taskLink}" target="_blank" style="display: inline-block; background-color: #7b68ee; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(123, 104, 238, 0.35);">
                        Abrir Tarefa no Hub &rarr;
                      </a>
                    </div>
                    <p style="margin-top: 12px; font-size: 11px; color: #64748b; text-align: center;">
                      Ou cole este link no navegador: <br/>
                      <a href="${taskLink}" style="color: #818cf8; text-decoration: underline; word-break: break-all;">${taskLink}</a>
                    </p>`
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0f172a; border-top: 1px solid #334155; font-size: 12px; color: #64748b; text-align: center;">
              <p style="margin: 0 0 4px;">Mensagem enviada automaticamente pelo <strong>Lorde Camarão</strong>.</p>
              <p style="margin: 0;">© ${new Date().getFullYear()} Editora Luz Negra • Hub</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim()

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
                html: styledTemplate,
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
            html: styledTemplate,
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
                      : aiParsed.action?.type === 'none'
                        ? 'Não identifiquei nenhuma tarefa ou ação para os parâmetros informados.'
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
