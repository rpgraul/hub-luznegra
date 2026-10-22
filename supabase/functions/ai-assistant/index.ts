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
    | 'delete_project'
    | 'archive_project'
    | 'update_task'
    | 'update_tasks'
    | 'delete_task'
    | 'create_user'
    | 'send_email'
    | 'send_notification'
    | 'draft_email'
    | 'create_link'
    | 'create_vendor'
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
    const userRole = requesterProfile?.role || 'member'
    const isUserAdmin = userRole === 'admin'
    const isCollaborator = userRole === 'collaborator'

    const { data: allProjects } = await admin
      .from('projects')
      .select('id, name, color, owner_id, archived, created_at')
      .order('name', { ascending: true })

    let accessibleProjects = allProjects ?? []
    if (isCollaborator) {
      const { data: userProjectMemberships } = await admin
        .from('project_members')
        .select('project_id')
        .eq('user_id', userId)

      const memberProjectIds = new Set((userProjectMemberships ?? []).map((m) => m.project_id))

      const { data: userTaskProjects } = await admin
        .from('tasks')
        .select('project_id')
        .is('deleted_at', null)
        .or(`assigned_to.eq.${userId},assignees.cs.{${userId}}`)

      for (const t of userTaskProjects ?? []) {
        if (t.project_id) memberProjectIds.add(t.project_id)
      }

      accessibleProjects = (allProjects ?? []).filter(
        (p) => memberProjectIds.has(p.id) || p.owner_id === userId,
      )
    }

    const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id))
    const projects = accessibleProjects.filter((p) => !p.archived)
    const archivedProjects = isCollaborator ? [] : accessibleProjects.filter((p) => p.archived)

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

    // Buscar tarefas recentes de todos os projetos acessíveis ordenadas por última modificação (updated_at DESC)
    const { data: allRecentTasks } = await admin
      .from('tasks')
      .select('id, title, status, priority, due_date, start_date, assigned_to, assignees, parent_id, project_id, categories, created_at, updated_at')
      .is('deleted_at', null)
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
    }> = ((allRecentTasks as any) ?? []).filter(
      (t: { project_id: string }) => !isCollaborator || accessibleProjectIds.has(t.project_id),
    )

    // Tarefas em aberto atribuídas ao usuário logado (para priorização pessoal, semana e prazos)
    const { data: myTasksRaw } = await admin
      .from('tasks')
      .select('id, title, status, priority, due_date, start_date, assigned_to, assignees, parent_id, project_id, categories, created_at, updated_at')
      .is('deleted_at', null)
      .or(`assigned_to.eq.${userId},assignees.cs.{${userId}}`)
      .not('status', 'eq', 'done')
      .order('due_date', { ascending: true, nullsFirst: false })

    const myOpenTasks: typeof currentProjectTasks = (myTasksRaw as any) ?? []

    // 1.1 Links, Documentos e Fornecedores/Colaboradores cadastrados no Hub
    const { data: hubLinks } = await admin
      .from('hub_links')
      .select('id, title, url, description, tags')
      .limit(40)

    let hubDocs: Array<{
      id: string
      title: string
      file_name: string
      file_type: string
      tags: string[]
      file_url: string
      extracted_text: string | null
    }> = []

    let hubVendors: Array<{
      id: string
      name: string
      kind: string
      phone: string | null
      email: string | null
      link1: string | null
      link2: string | null
      link3: string | null
      note: string | null
      pix: string | null
      created_at: string
    }> = []

    if (!isCollaborator) {
      const { data: rawDocs } = await admin
        .from('hub_documents')
        .select('id, title, file_name, file_type, tags, file_url, extracted_text')
        .limit(30)
      hubDocs = (rawDocs as any) ?? []

      const { data: rawVendors } = await admin
        .from('hub_vendors')
        .select('id, name, kind, phone, email, link1, link2, link3, note, pix, created_at')
        .order('name', { ascending: true })
        .limit(60)
      hubVendors = (rawVendors as any) ?? []
    }

    const membersMap = membersWithEmail
      .map((m) => `@${m.username} (${m.full_name || m.username}, email: ${m.email || 'não cadastrado'}, id: ${m.id})`)
      .join('\n')
    const projectsMap = (projects ?? []).map((p) => `"${p.name}" (id: ${p.id})`).join(', ')
    const archivedProjectsMap = (archivedProjects ?? []).length > 0
      ? (archivedProjects ?? []).map((p) => `- [ID: ${p.id}] "${p.name}" (Arquivado)`).join('\n')
      : 'Nenhum projeto arquivado no momento.'
    const projectNameById = new Map((allProjects ?? []).map((p) => [p.id, p.name]))
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
      if (!dateStr) return 'Não definido'
      const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (m) return `${m[3]}/${m[2]}/${m[1]}`
      const m2 = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
      if (m2) return dateStr
      return dateStr
    }

    const statusPtBr: Record<string, string> = {
      uncertain: 'Incerto',
      backlog: 'Backlog',
      todo: 'A Fazer',
      in_progress: 'Em Andamento',
      review: 'Revisão',
      financing: 'Em Financiamento',
      funded: 'Financiado',
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

    const docsSnippet = isCollaborator
      ? 'Acesso restrito: o usuário possui perfil de Colaborador e não tem acesso à Central de Documentos da editora.'
      : (() => {
      // Orçamento total de contexto dos documentos: evita estourar a janela
      // do modelo (que truncaria o JSON de saída) quando há muitos docs.
      const TOTAL_BUDGET = 60000
      let used = 0
      const parts: string[] = []
      for (const d of hubDocs ?? []) {
        if (used >= TOTAL_BUDGET) {
          parts.push(`...[+${(hubDocs ?? []).length - parts.length} documento(s) omitido(s) por limite de contexto]`)
          break
        }
        if (!d.extracted_text) {
          parts.push(`- [${d.id}] "${d.title}" (${d.file_name}, tipo: ${d.file_type}, Tags: [${(d.tags || []).join(', ')}], Link: ${d.file_url}, Conteúdo: "s/texto extraído")`)
          continue
        }
        // Inclui o texto extraído com limite por documento
        const isMatched = lastUserMsg && (
          d.title.toLowerCase().includes(lastUserMsg) ||
          d.file_name.toLowerCase().includes(lastUserMsg) ||
          lastUserMsg.split(/\s+/).some((w) => w.length > 3 && d.title.toLowerCase().includes(w))
        )
        const limit = Math.min(isMatched ? 8000 : 4000, TOTAL_BUDGET - used)
        const textContent = d.extracted_text.length > limit
          ? d.extracted_text.slice(0, limit) + '\n...[texto continuado/truncado]'
          : d.extracted_text
        used += textContent.length

        parts.push(`- [${d.id}] "${d.title}" (${d.file_name}, tipo: ${d.file_type}, Tags: [${(d.tags || []).join(', ')}], Link: ${d.file_url})\n  Conteúdo Integral Extraído:\n  """\n${textContent}\n  """`)
      }
      return parts.join('\n\n')
    })()

    const now = new Date()
    const nowPtBr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'medium' })
    const nowIso = now.toISOString()
    const todayIso = nowIso.slice(0, 10)
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const in7DaysIso = in7Days.toISOString().slice(0, 10)

    // Agrupamento detalhado das tarefas em aberto do usuário logado
    const myOverdueTasks: string[] = []
    const myTodayTasks: string[] = []
    const myThisWeekTasks: string[] = []
    const myFutureTasks: string[] = []
    const myNoDateTasks: string[] = []

    for (const t of myOpenTasks) {
      const projName = projectNameById.get(t.project_id) || 'Sem projeto'
      const statusLabel = statusPtBr[t.status] || t.status
      const priorityLabel = priorityPtBr[t.priority] || t.priority
      const startStr = formatPtBrDate(t.start_date)
      const dueStr = formatPtBrDate(t.due_date)
      const isSub = !!t.parent_id
      const itemDesc = `- [ID: ${t.id}] "${t.title}" (Projeto: "${projName}", Prioridade: ${priorityLabel} [${t.priority}], Status: ${statusLabel} [${t.status}], Início: ${startStr}, Prazo: ${dueStr}${isSub ? ', Subtarefa' : ''})`

      if (!t.due_date) {
        myNoDateTasks.push(itemDesc)
      } else if (t.due_date < todayIso) {
        myOverdueTasks.push(itemDesc + ` [ATRASADA - venceu em ${dueStr}]`)
      } else if (t.due_date === todayIso) {
        myTodayTasks.push(itemDesc + ` [VENCE HOJE]`)
      } else if (t.due_date <= in7DaysIso) {
        myThisWeekTasks.push(itemDesc + ` [Esta semana - ${dueStr}]`)
      } else {
        myFutureTasks.push(itemDesc)
      }
    }

    const myTasksSnippet = [
      `Total de tarefas em aberto de @${requesterProfile?.username || 'você'}: ${myOpenTasks.length} pendência(s).`,
      myOverdueTasks.length > 0 ? `* TAREFAS ATRASADAS (${myOverdueTasks.length}):\n${myOverdueTasks.join('\n')}` : null,
      myTodayTasks.length > 0 ? `* TAREFAS PARA HOJE (${myTodayTasks.length}):\n${myTodayTasks.join('\n')}` : null,
      myThisWeekTasks.length > 0 ? `* TAREFAS DOS PRÓXIMOS 7 DIAS (${myThisWeekTasks.length}):\n${myThisWeekTasks.join('\n')}` : null,
      myFutureTasks.length > 0 ? `* TAREFAS FUTURAS (${myFutureTasks.length}):\n${myFutureTasks.join('\n')}` : null,
      myNoDateTasks.length > 0 ? `* TAREFAS SEM PRAZO DEFINIDO (${myNoDateTasks.length}):\n${myNoDateTasks.join('\n')}` : null,
    ].filter(Boolean).join('\n\n')

    const vendorsSnippet = isCollaborator
      ? 'Acesso restrito: o usuário possui perfil de Colaborador e não tem acesso à lista de Fornecedores da editora.'
      : (hubVendors ?? []).length > 0
          ? (hubVendors ?? [])
              .map((v) => {
                const links = [v.link1, v.link2, v.link3].filter(Boolean).join(', ')
                return `- [ID: ${v.id}] "${v.name}" (Tipo: ${v.kind || 'fornecedor'}, Email: ${v.email || 'N/A'}, Tel: ${v.phone || 'N/A'}, PIX: ${v.pix || 'N/A'}${links ? `, Portfólio/Links: ${links}` : ''}${v.note ? `, Obs: "${v.note}"` : ''})`
              })
              .join('\n')
          : 'Nenhum fornecedor/colaborador cadastrado.'

    const userRoleDesc = isUserAdmin
      ? 'Administrador (Acesso total)'
      : isCollaborator
      ? 'Colaborador (Autor, Ilustrador, Redator - Acesso restrito apenas aos projetos designados)'
      : 'Membro da Equipe (Acesso operacional normal)'

    const collaboratorRules = isCollaborator
      ? `
REGRAS E PERMISSÕES DO PERFIL DESTE USUÁRIO (COLABORADOR):
- O usuário possui perfil de COLABORADOR (autor, ilustrador ou redator).
- Ele PODE criar novos projetos e gerenciar tarefas e subtarefas dentro dos projetos aos quais tem acesso.
- Projetos atualmente acessíveis a ele: ${projects.map((p) => `"${p.name}" (ID: ${p.id})`).join(', ') || 'Nenhum projeto no momento'}.
- Ele NÃO tem acesso à Central de Documentos nem a Fornecedores da editora.
- Ele NÃO tem acesso a projetos arquivados, e NÃO tem permissão para arquivar ou deletar projetos.
- Ele NÃO tem permissão para cadastrar fornecedores nem criar contas de usuários.
- Se ele pedir qualquer uma dessas ações restritas (documentos, fornecedores, arquivar ou deletar projetos), recuse cordialmente explicando que o perfil de colaborador não tem permissão para essa ação.
`
      : ''

    // 2. Monta o system prompt completo
    const systemPrompt = `Você é o Lorde Camarão, assistente de IA do Hub da Editora Luz Negra.
Data e hora atual (Horário de Brasília): ${nowPtBr} (ISO: ${nowIso}).
Hoje: ${todayIso}. Usuário logado: ${requesterProfile ? `@${requesterProfile.username} (${requesterProfile.full_name || requesterProfile.username})` : userId} (ID: ${userId}). Papel: ${userRoleDesc}. Projeto ativo ID: ${context.projectId || 'Nenhum'}.
${collaboratorRules}
Projetos Ativos:
${projectsMap || 'Nenhum'}

Projetos Arquivados:
${archivedProjectsMap || 'Nenhum projeto arquivado.'}

Membros da equipe (reconheça nomes, usernames e e-mails para atribuição, filtros e mensagens):
${membersMap || 'Nenhum'}

TAREFAS EM ABERTO ATRIBUÍDAS AO USUÁRIO LOGADO (@${requesterProfile?.username || 'você'}) - Use para planejamento pessoal, prioridades e semana:
${myTasksSnippet || 'Nenhuma tarefa pendente atribuída ao usuário.'}

Tarefas recentes de todos os projetos (ordenadas por modificações recentes):
${tasksSnippet || 'Nenhuma tarefa encontrada.'}

Fornecedores e Colaboradores cadastrados (ilustradores, autores, parceiros):
${vendorsSnippet}

Links úteis cadastrados:
${linksSnippet || 'Nenhum link cadastrado.'}

Documentos e Contratos cadastrados:
${docsSnippet || 'Nenhum documento cadastrado.'}

DIRETRIZES DE RESPOSTA E PODERES:
- Responda sempre em Português do Brasil de forma clara, prestativa e estruturada.
- NÃO use emojis em nenhuma hipótese.

- ORGANIZAÇÃO PESSOAL, PRIORIDADES E PLANEJAMENTO DA SEMANA:
  Quando o usuário pedir para listar suas prioridades, planejar sua semana, ver o que tem para fazer hoje/na semana ou organizar suas tarefas:
  1. Baseie-se DIRETAMENTE na seção "TAREFAS EM ABERTO ATRIBUÍDAS AO USUÁRIO LOGADO".
  2. Apresente um plano de ação claro, objetivo e estruturado em tópicos:
     - Tarefas Atrasadas / Urgentes (se houver, com o prazo original e dias de atraso)
     - Tarefas para Hoje e Próximos 7 Dias (em ordem cronológica)
     - Ordem de Execução Recomendada (uma sugestão lógica de foco para o usuário)
     - Tarefas Sem Prazo ou Futuras (para quando houver tempo livre)
  3. Indique sempre o Título da tarefa em negrito, o Projeto e a Prioridade.
  4. Seja prestativo: ofereça proativamente atualizar status para concluído ou reagendar prazos se o usuário desejar.

- CONSULTA A FORNECEDORES E PARCEIROS:
  Quando o usuário perguntar sobre ilustradores, autores, fornecedores, parceiros, chaves PIX, telefones, e-mails, portfólios ou observações:
  Consulte a seção "Fornecedores e Colaboradores cadastrados" e responda com precisão aos dados solicitados.

- CONSULTAS, LISTAGENS E RELATÓRIOS SOBRE TAREFAS (action: { "type": "none" }):
  Quando o usuário fizer perguntas ou pedir listagens, relatórios, checagens sobre tarefas, status, prazos, membros ou atualizações recentes:
  (Exemplos: "quais tarefas foram atualizadas ou criadas nos ultimos 2 dias?", "mudei o status de uma tarefa hoje mesmo", "pode checar os itens que tiveram status alterado?", "listar tarefas de todos os usuarios", "quais tarefas estão em andamento?"):
  1. NÃO faça nenhuma ação de mutação no banco de dados. Retorne action: { "type": "none" }.
  2. Analise atentamente os campos "Criada em" e "Última atualização" de TODAS as tarefas fornecidas no contexto.
  3. Identifique com exatidão quais tarefas foram modificadas ou criadas no período solicitado pelo usuário.
  4. Responda no campo "reply" com uma listagem detalhada e organizada em Markdown.
  5. NUNCA responda apenas "Comando processado com sucesso." para perguntas, listagens, relatórios ou dúvidas!

- AÇÕES NO BANCO DE DADOS (apenas quando expressamente solicitado para criar, alterar ou excluir dados):
  - EXCLUIR PROJETO ARQUIVADO (delete_project):
    Quando o usuário pedir para deletar ou excluir um projeto arquivado (ou excluir projeto):
    action: delete_project, params: {
      "project_id"?: string,
      "project_name"?: string
    }
  - ARQUIVAR OU DESARQUIVAR PROJETO (archive_project):
    action: archive_project, params: {
      "project_id"?: string,
      "project_name"?: string,
      "archive"?: boolean (true para arquivar, false para desarquivar/restaurar)
    }
  - CADASTRAR FORNECEDOR / COLABORADOR (create_vendor):
    Quando o usuário pedir para cadastrar um ilustrador, autor, fornecedor ou parceiro:
    action: create_vendor, params: {
      "name": string,
      "kind"?: "ilustrador" | "fornecedor" | "autor" | "colaborador" | "outro",
      "phone"?: string,
      "email"?: string,
      "pix"?: string,
      "note"?: string,
      "link1"?: string
    }
  - ATRIBUIR / ALTERAR RESPONSÁVEL OU ATUALIZAR TAREFA (update_task):
    Quando o usuário pedir para atribuir, trocar responsável, delegar, alterar status, prioridade ou prazos de uma tarefa ou subtarefa:
    action: update_task, params: {
      "task_id"?: string (ID real da tarefa se identificado),
      "task_title"?: string (título da tarefa para localização),
      "assigned_to"?: string (username, nome, ou @username do responsável),
      "status"?: "uncertain" | "backlog" | "todo" | "in_progress" | "review" | "financing" | "funded" | "done",
      "priority"?: "urgent" | "high" | "medium" | "low",
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
          "status"?: "uncertain" | "backlog" | "todo" | "in_progress" | "review" | "financing" | "funded" | "done",
          "priority"?: "urgent" | "high" | "medium" | "low",
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
      "priority"?: "urgent" | "high" | "medium" | "low",
      "categories"?: string[] (ex: ["ig", "rpg"]),
      "due_date"?: "YYYY-MM-DD",
      "start_date"?: "YYYY-MM-DD",
      "subtasks"?: string[],
      "send_email"?: boolean (coloque true se o usuário pedir para enviar e-mail com os detalhes da tarefa ou avisar por e-mail),
      "email_recipient"?: string (username, e-mail ou nome de quem deve receber o e-mail; padrão é o assigned_to)
    }
    REGRA CRÍTICA PARA E-MAIL NA CRIAÇÃO: Se o usuário pedir para criar a tarefa E enviar e-mail (ex: "crie a tarefa X e me mande por e-mail"), NUNCA divida em dois turnos nem diga que só faz uma ação por vez! Utilize a ação "create_task" com "send_email": true. O sistema criará a tarefa e enviará o e-mail automaticamente na mesma execução.
    LIMITE: no máximo 20 subtarefas por resposta.
  - EXCLUIR TAREFA OU SUBTAREFA (delete_task):
    Quando o usuário pedir para deletar ou excluir uma tarefa ou subtarefa:
    action: delete_task, params: {
      "task_id"?: string,
      "task_title"?: string
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
    "type": "update_task" | "update_tasks" | "create_task" | "create_project" | "delete_project" | "archive_project" | "create_link" | "create_vendor" | "send_email" | "send_notification" | "delete_task" | "duplicate_task" | "break_down_subtasks" | "none",
    "params": { ... }
  }
}`

    // 3. Chamada à IA (Groq como principal, DeepSeek / OpenAI como fallback)
    const rawGroqKey = Deno.env.get('GROQ_API_KEY') || ''
    const groqApiKey = rawGroqKey.trim().replace(/^["']|["']$/g, '')

    const rawDeepseekKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('OPENAI_API_KEY') || ''
    const deepseekApiKey = rawDeepseekKey.trim().replace(/^["']|["']$/g, '')

    let aiParsed: AIResponseStructure = {
      reply: 'Não foi possível interpretar o comando.',
      action: { type: 'none' },
    }
    // Escopo da função: indica se a saída crua da IA veio cortada pelo
    // limite de tokens (usado na etapa 4, fora do bloco da API).
    let truncatedOutput = false

    // Detecta conteúdo cortado no meio (chaves/colchetes desbalanceados ou
    // string não terminada). Declarada no escopo da função para ser usada
    // tanto no parse quanto na execução da ação.
    function looksTruncated(str: string): boolean {
      const t = (str || '').trim()
      if (!t) return false
      let depth = 0
      let inStr = false
      let esc = false
      for (const ch of t) {
        if (inStr) {
          if (esc) esc = false
          else if (ch === '\\') esc = true
          else if (ch === '"') inStr = false
        } else {
          if (ch === '"') inStr = true
          else if (ch === '{' || ch === '[') depth++
          else if (ch === '}' || ch === ']') depth--
        }
      }
      return depth > 0 || inStr
    }

    if (groqApiKey || deepseekApiKey) {
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ]

      async function callProvider(
        providerName: 'Groq' | 'DeepSeek',
        apiKey: string,
        endpoint: string,
        model: string,
        maxTokens: number,
      ): Promise<{ ok: true; content: string } | { ok: false; status: number; error: string }> {
        try {
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              response_format: { type: 'json_object' },
              temperature: 0.1,
              max_tokens: maxTokens,
            }),
          })

          if (!resp.ok) {
            const errorText = await resp.text()
            console.error(`${providerName} API Error:`, resp.status, errorText)
            let errorMsg = `Erro na API ${providerName} (${resp.status})`
            try {
              const errJson = JSON.parse(errorText)
              if (errJson.error?.message) {
                errorMsg = errJson.error.message
              }
            } catch {
              errorMsg = errorText || errorMsg
            }

            if (resp.status === 402 || errorMsg.toLowerCase().includes('balance')) {
              errorMsg = `Saldo insuficiente na conta da ${providerName}.`
            } else if (resp.status === 429) {
              errorMsg = `Limite de requisições excedido na ${providerName} (Rate Limit).`
            }

            return { ok: false, status: resp.status, error: errorMsg }
          }

          const data = await resp.json()
          const rawContent = data.choices?.[0]?.message?.content || '{}'
          return { ok: true, content: rawContent }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.error(`Falha de conexão com ${providerName}:`, errorMsg)
          return { ok: false, status: 500, error: `Falha de conexão com ${providerName}: ${errorMsg}` }
        }
      }

      let rawContent = ''
      let lastError = ''

      // 1. Tenta Groq (principal) se a chave estiver configurada
      if (groqApiKey) {
        const groqEndpoint = 'https://api.groq.com/openai/v1/chat/completions'
        const candidateModels = [
          Deno.env.get('GROQ_MODEL'),
          'openai/gpt-oss-120b',
          'openai/gpt-oss-20b',
          'qwen/qwen3.8-27b',
          'llama-3.3-70b-versatile',
        ].filter(Boolean) as string[]
        const groqMaxTokens = parseInt(Deno.env.get('GROQ_MAX_TOKENS') || '8000', 10) || 8000

        for (const modelToTry of candidateModels) {
          const res = await callProvider('Groq', groqApiKey, groqEndpoint, modelToTry, groqMaxTokens)
          if (res.ok) {
            rawContent = res.content
            break
          } else {
            lastError = res.error
            console.warn(`Groq com modelo ${modelToTry} falhou (${res.error}). Tentando próximo...`)
          }
        }
      }

      // 2. Se Groq não retornou ou não está configurada, tenta DeepSeek (fallback)
      if (!rawContent && deepseekApiKey) {
        const dsEndpoint = Deno.env.get('DEEPSEEK_API_KEY')
          ? 'https://api.deepseek.com/chat/completions'
          : 'https://api.openai.com/v1/chat/completions'
        const dsModel =
          Deno.env.get('DEEPSEEK_MODEL') ||
          (Deno.env.get('DEEPSEEK_API_KEY') ? 'deepseek-chat' : 'gpt-4o-mini')
        const dsMaxTokens = parseInt(Deno.env.get('DEEPSEEK_MAX_TOKENS') || '8000', 10) || 8000

        const res = await callProvider('DeepSeek', deepseekApiKey, dsEndpoint, dsModel, dsMaxTokens)
        if (res.ok) {
          rawContent = res.content
        } else {
          lastError = res.error
        }
      }

      if (!rawContent) {
        return json({
          reply: `⚠️ **Aviso da IA**: ${lastError || 'Não foi possível obter resposta dos provedores de IA configurados.'}`,
          action: { type: 'none' },
        })
      }

      const cleanContent = rawContent
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()

      function tryParseJson(str: string): Record<string, unknown> | null {
        try {
          return JSON.parse(str)
        } catch {
          // Resposta pode vir truncada (limite de tokens). Extrai o maior
          // objeto JSON válido com balanceamento de chaves (respeitando
          // strings e escapes) em vez de remendos ingênuos de sufixo.
          const candidates: Record<string, unknown>[] = []
          let i = str.indexOf('{')
          while (i >= 0 && i < str.length) {
            let depth = 0
            let inStr = false
            let esc = false
            for (let j = i; j < str.length; j++) {
              const ch = str[j]
              if (inStr) {
                if (esc) esc = false
                else if (ch === '\\') esc = true
                else if (ch === '"') inStr = false
              } else {
                if (ch === '"') inStr = true
                else if (ch === '{') depth++
                else if (ch === '}') {
                  depth--
                  if (depth === 0) {
                    try {
                      const obj = JSON.parse(str.slice(i, j + 1))
                      if (obj && typeof obj === 'object') {
                        candidates.push(obj as Record<string, unknown>)
                      }
                    } catch {
                      // continua procurando
                    }
                    break
                  }
                }
              }
            }
            i = str.indexOf('{', i + 1)
          }
          // Prefere o candidato que tem "reply" ou "action"
          candidates.sort((a, b) => {
            const score = (o: Record<string, unknown>) =>
              (typeof o.reply === 'string' ? 2 : 0) + (o.action ? 1 : 0)
            return score(b) - score(a)
          })
          if (candidates.length > 0) return candidates[0]
          // Último recurso: remendos de sufixo para JSON cortado no fim
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

      truncatedOutput = looksTruncated(cleanContent)

      const parsedObj = tryParseJson(cleanContent)
      if (parsedObj) {
        const rawReply =
          parsedObj.reply ??
          parsedObj.response ??
          parsedObj.message ??
          parsedObj.text ??
          parsedObj.content ??
          parsedObj.resposta ??
          parsedObj.mensagem ??
          parsedObj.explanation ??
          ''

        let actionObj = (parsedObj.action ?? parsedObj.acao) as AIAction | undefined
        if (!actionObj || typeof actionObj !== 'object') {
          actionObj = { type: 'none' }
        }

        aiParsed = {
          reply: typeof rawReply === 'string' ? rawReply.trim() : String(rawReply || ''),
          action: actionObj,
        }
      } else {
        // Se mesmo assim não parsear, extrai texto se houver
        const replyMatch = cleanContent.match(/"(?:reply|response|message|text|content|resposta|mensagem)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/)
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

    // Normaliza prioridade para os valores aceitos pelo CHECK do banco
    // (low|medium|high|urgent). A IA costuma emitir "normal" — que o banco rejeita.
    function normalizePriority(p: unknown): string {
      const v = String(p ?? 'medium').trim().toLowerCase()
      if (['urgent', 'urgente', 'urgencia', 'urgência', 'critical', 'crítica', 'critica'].includes(v)) return 'urgent'
      if (['high', 'alta', 'alto', 'high priority', 'prioridade alta'].includes(v)) return 'high'
      if (['low', 'baixa', 'baixo', 'minor', 'baixa prioridade'].includes(v)) return 'low'
      return 'medium'
    }

    // Normaliza status para os valores aceitos pelo CHECK do banco.
    // Retorna null quando irreconhecível (chamador decide o fallback).
    function normalizeStatus(s: unknown): string | null {
      const v = String(s ?? '').trim().toLowerCase()
      const map: Record<string, string> = {
        uncertain: 'uncertain',
        incerto: 'uncertain',
        backlog: 'backlog',
        todo: 'todo',
        'a fazer': 'todo',
        afazer: 'todo',
        pending: 'todo',
        pendente: 'todo',
        in_progress: 'in_progress',
        'in progress': 'in_progress',
        'em andamento': 'in_progress',
        andamento: 'in_progress',
        doing: 'in_progress',
        review: 'review',
        'revisão': 'review',
        revisao: 'review',
        financing: 'financing',
        'em financiamento': 'financing',
        financiamento: 'financing',
        funded: 'funded',
        financiado: 'funded',
        done: 'done',
        'concluído': 'done',
        concluido: 'done',
        concluded: 'done',
        complete: 'done',
        completed: 'done',
      }
      return map[v] ?? null
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

    // Remove lembretes de vencimento pendentes de tarefas concluídas.
    async function clearDueRemindersFor(taskIds: string[]): Promise<void> {
      const ids = [...new Set(taskIds.filter(Boolean))]
      if (ids.length === 0) return
      try {
        await admin
          .from('notifications')
          .delete()
          .in('task_id', ids)
          .eq('type', 'due_date_reminder')
          .eq('read', false)
      } catch {
        // best-effort
      }
    }

    // Dispara e-mail de notificação profissional via Resend
    async function dispatchEmailNotification({
      recipient,
      subject,
      bodyHtml,
      taskId,
      taskTitle,
      taskDueDate,
    }: {
      recipient: string
      subject: string
      bodyHtml: string
      taskId?: string | null
      taskTitle?: string | null
      taskDueDate?: string | null
    }): Promise<{ success: boolean; direct: boolean; targetEmail?: string; error?: string }> {
      const cleanRecipient = String(recipient || '').trim()
      let targetEmail: string | null = null
      const targetUser = membersWithEmail.find(
        (m) =>
          m.email?.toLowerCase() === cleanRecipient.toLowerCase() ||
          m.username.toLowerCase() === cleanRecipient.replace(/^@/, '').toLowerCase() ||
          m.id === cleanRecipient ||
          (m.full_name && m.full_name.toLowerCase().includes(cleanRecipient.toLowerCase()))
      )

      if (targetUser?.email) {
        targetEmail = targetUser.email
      } else if (cleanRecipient.includes('@') && cleanRecipient.includes('.')) {
        targetEmail = cleanRecipient
      }

      if (!targetEmail) {
        return { success: false, direct: false, error: `Não foi possível encontrar o e-mail para "${cleanRecipient}".` }
      }

      const formattedBody = bodyHtml.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')
      const recipientName = targetUser?.full_name || targetUser?.username || cleanRecipient.replace(/^@/, '')
      const finalTaskTitle = taskTitle || ''
      const taskLink = taskId ? `https://hub.luznegra.com.br/task/${taskId}` : ''
      const finalDueDate = taskDueDate ? formatPtBrDate(taskDueDate) : null

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
          <tr>
            <td style="padding: 32px; font-size: 14px; line-height: 1.6; color: #e2e8f0;">
              <p style="margin-top: 0; margin-bottom: 20px; font-size: 15px; color: #f8fafc;">
                Olá, <strong>${recipientName}</strong>,
              </p>
              ${
                finalTaskTitle
                  ? `<div style="margin: 20px 0; padding: 16px 20px; background-color: #0f172a; border-left: 4px solid #7b68ee; border-radius: 6px; border: 1px solid #334155;">
                      <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 4px;">Tarefa</div>
                      <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: ${finalDueDate ? '8px' : '0'};">
                        ${finalTaskTitle}
                      </div>
                      ${
                        finalDueDate
                          ? `<div style="font-size: 13px; color: #cbd5e1;">
                              <span style="color: #94a3b8;">Prazo final:</span> <strong style="color: #f59e0b; background: rgba(245, 158, 11, 0.15); padding: 2px 6px; border-radius: 4px;">${finalDueDate}</strong>
                            </div>`
                          : ''
                      }
                    </div>`
                  : ''
              }
              <div style="margin: 20px 0; color: #cbd5e1;">
                ${
                  formattedBody.includes('<p>') || formattedBody.includes('<div>')
                    ? formattedBody
                    : `<p style="margin: 0;">${formattedBody.replace(/\n/g, '<br/>')}</p>`
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

      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      let emailSentDirectly = false

      if (resendApiKey) {
        try {
          const plainText = [
            `Olá, ${recipientName}!`,
            '',
            finalTaskTitle ? `Tarefa: ${finalTaskTitle}` : '',
            finalDueDate ? `Prazo final: ${finalDueDate}` : '',
            '',
            formattedBody.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, '').trim(),
            '',
            taskLink ? `Abrir tarefa no Hub: ${taskLink}` : '',
            '',
            '--',
            'Editora Luz Negra • Hub',
          ].filter((line) => line !== undefined && line !== null).join('\n')

          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Hub - Editora Luz Negra <no-reply@hub.luznegra.com.br>',
              to: targetEmail,
              subject,
              html: styledTemplate,
              text: plainText,
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

      try {
        await admin.from('email_queue').insert({
          to_email: targetEmail,
          subject,
          html: styledTemplate,
          task_id: taskId || null,
          status: emailSentDirectly ? 'sent' : 'pending',
        })
      } catch {
        // ignora
      }

      return { success: true, direct: emailSentDirectly, targetEmail }
    }

    if (aiParsed.action && aiParsed.action.type !== 'none') {
      const { type, params = {} } = aiParsed.action

      if (isCollaborator) {
        if (
          type === 'delete_project' ||
          type === 'archive_project' ||
          type === 'create_vendor' ||
          type === 'create_user'
        ) {
          return json({
            reply: 'Seu perfil de Colaborador não possui permissão para executar esta ação no Hub (restrita a administradores e membros da equipe).',
            action: { type: 'none' },
          })
        }
      }

      // Insere subtarefas em lotes para não estourar limites de payload,
      // retornando quantas foram criadas e quais falharam.
      async function insertSubtasks(
        parent: { id: string; project_id: string; assigned_to: string | null; due_date: string | null; priority: string },
        subtasks: Array<string | Record<string, unknown>>,
      ): Promise<{ created: number; failed: number; errors: string[] }> {
        const rows = subtasks
          .map((st, idx) => {
            const isObj = typeof st === 'object' && st !== null
            const stTitle = isObj ? String((st as Record<string, unknown>).title || '').trim() : String(st).trim()
            if (!stTitle) return null
            const stDue = isObj ? normalizeDate((st as Record<string, unknown>).due_date) : null
            const stStart = isObj ? normalizeDate((st as Record<string, unknown>).start_date) : null
            const stAssigned = isObj
              ? resolveMemberId((st as Record<string, unknown>).assigned_to) || parent.assigned_to
              : parent.assigned_to
            return {
              title: stTitle,
              project_id: parent.project_id,
              parent_id: parent.id,
              assigned_to: stAssigned,
              due_date: stDue || parent.due_date,
              start_date: stStart,
              priority: normalizePriority(parent.priority),
              status: 'todo',
              order_index: idx + 1,
              created_by: userId,
            }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)

        let created = 0
        const errors: string[] = []
        const BATCH = 20
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH)
          const { data, error } = await admin.from('tasks').insert(chunk).select('id')
          if (error) {
            console.error('Subtask batch insert error:', error)
            errors.push(error.message)
          } else {
            created += data?.length ?? 0
          }
        }
        return { created, failed: rows.length - created, errors }
      }

      if (type === 'create_task' || type === 'create_tasks') {
        let projectIdToUse = (params.project_id as string) || (params.projectId as string)
        const projNameParam = String(params.project_name || params.project || '').trim().toLowerCase()

        // 1. Busca por nome se passado nos parâmetros
        if (projNameParam) {
          const match = (projects ?? []).find(
            (p) =>
              p.name.toLowerCase() === projNameParam ||
              p.name.toLowerCase().includes(projNameParam) ||
              projNameParam.includes(p.name.toLowerCase()),
          )
          if (match) projectIdToUse = match.id
        }

        // 2. Se projectIdToUse não for um UUID válido em accessibleProjectIds, tenta achar por nome
        if (projectIdToUse && !accessibleProjectIds.has(projectIdToUse)) {
          const match = (projects ?? []).find(
            (p) =>
              p.name.toLowerCase() === projectIdToUse.toLowerCase() ||
              p.name.toLowerCase().includes(projectIdToUse.toLowerCase()),
          )
          if (match) projectIdToUse = match.id
        }

        // 3. Procura menção aos nomes dos projetos no texto da mensagem do usuário
        if (!projectIdToUse) {
          const match = (projects ?? []).find((p) =>
            message.toLowerCase().includes(p.name.toLowerCase()),
          )
          if (match) projectIdToUse = match.id
        }

        // 4. Fallback para projeto ativo no contexto ou primeiro projeto acessível
        if (!projectIdToUse) {
          projectIdToUse =
            context.projectId && accessibleProjectIds.has(context.projectId)
              ? context.projectId
              : projects?.[0]?.id
        }

        if (!projectIdToUse) {
          return json({
            reply: 'Não encontrei nenhum projeto acessível para criar a tarefa. Você pode criar um projeto primeiro dizendo "Crie o projeto NomeDoProjeto".',
            action: { type: 'none' },
          })
        }
        if (isCollaborator && !accessibleProjectIds.has(projectIdToUse)) {
          return json({
            reply: 'Você não possui permissão para criar tarefas neste projeto, pois ele não foi designado a você.',
            action: { type: 'none' },
          })
        }
        {
          const taskList = Array.isArray(params.tasks)
            ? (params.tasks as Array<Record<string, unknown>>)
            : params.title
              ? [params]
              : []

          if (taskList.length === 0 || taskList.every((t) => !t.title)) {
            return json({
              reply: truncatedOutput
                ? 'A resposta da IA veio incompleta (limite de saída atingido) e não consegui identificar a tarefa. Tente de novo com um pedido menor — por exemplo, dividindo as subtarefas em partes.'
                : 'Não consegui identificar o título da tarefa no seu pedido. Pode repetir com o título entre aspas?',
              action: { type: 'none' },
            })
          }

          const createdTasks: unknown[] = []
          let subtasksCreated = 0
          let subtasksFailed = 0
          const insertErrors: string[] = []

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
                priority: normalizePriority(item.priority ?? params.priority),
                status: normalizeStatus(item.status) ?? 'todo',
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
                const res = await insertSubtasks(
                  {
                    id: (created as { id: string }).id,
                    project_id: (created as { project_id: string }).project_id,
                    assigned_to: (created as { assigned_to: string | null }).assigned_to,
                    due_date: (created as { due_date: string | null }).due_date,
                    priority: (created as { priority: string }).priority,
                  },
                  subtasks.slice(0, 60),
                )
                subtasksCreated += res.created
                subtasksFailed += res.failed
                insertErrors.push(...res.errors)
                if (subtasks.length > 60) {
                  insertErrors.push(`Limite de 60 subtarefas por pedido: ${subtasks.length - 60} ignorada(s). Peça para continuar.`)
                }
              }
            } else if (createError) {
              console.error('Task insert error:', createError)
              insertErrors.push(createError.message)
            }
          }

          if (createdTasks.length === 0) {
            return json({
              reply: `Não consegui criar a tarefa no banco de dados (${insertErrors[0] || 'erro desconhecido'}). Tente novamente.`,
              action: { type: 'none' },
            })
          }

          if (truncatedOutput || subtasksFailed > 0) {
            const parts: string[] = []
            if (subtasksFailed > 0) parts.push(`${subtasksFailed} subtarefa(s) não foram salvas`)
            if (truncatedOutput) parts.push('a resposta da IA foi cortada pelo limite de saída e pode estar faltando item')
            aiParsed.reply = `${aiParsed.reply || 'Tarefa criada.'} Atenção: ${parts.join('; ')}. Peça "continue criando as subtarefas restantes".`
          }

          let emailInfo: { sent: boolean; direct?: boolean; recipient?: string } | undefined
          if (createdTasks.length > 0 && (params.send_email || params.notify_email || params.email_recipient)) {
            const firstTask = createdTasks[0] as { id: string; title: string; due_date: string | null; start_date: string | null; assigned_to: string | null }
            const emailRecipient = (params.email_recipient as string) || (params.assigned_to as string) || firstTask.assigned_to || userId
            const emailSubject = (params.email_subject as string) || `Nova tarefa criada: ${firstTask.title}`
            const emailBody = (params.email_body as string) || `A tarefa <strong>${firstTask.title}</strong> foi criada com sucesso no Hub.`
            const emailRes = await dispatchEmailNotification({
              recipient: String(emailRecipient),
              subject: emailSubject,
              bodyHtml: emailBody,
              taskId: firstTask.id,
              taskTitle: firstTask.title,
              taskDueDate: firstTask.due_date,
            })
            emailInfo = { sent: emailRes.success, direct: emailRes.direct, recipient: emailRes.targetEmail }
          }

          actionResult = {
            success: subtasksFailed === 0,
            count: createdTasks.length,
            tasks: createdTasks,
            subtasksCreated,
            subtasksFailed,
            errors: insertErrors,
            truncated: truncatedOutput,
            email: emailInfo,
          }
        }
      } else if (type === 'break_down_subtasks' && params.parent_task_title && Array.isArray(params.subtasks)) {
        // Encontra tarefa pai
        const { data: parentTasks } = await admin
          .from('tasks')
          .select('id, project_id, assigned_to')
          .is('deleted_at', null)
          .ilike('title', `%${params.parent_task_title}%`)
          .limit(1)

        const parent = parentTasks?.[0]
        if (!parent) {
          return json({
            reply: `Não encontrei a tarefa "${params.parent_task_title}". Verifique o título e tente de novo.`,
            action: { type: 'none' },
          })
        }
        if (isCollaborator && !accessibleProjectIds.has(parent.project_id)) {
          return json({
            reply: `Você não possui permissão para modificar tarefas deste projeto, pois ele não foi designado a você.`,
            action: { type: 'none' },
          })
        }
        {
          const { data: fullParent } = await admin
            .from('tasks')
            .select('id, project_id, assigned_to, due_date, priority')
            .eq('id', parent.id)
            .maybeSingle()
          const res = await insertSubtasks(
            {
              id: parent.id,
              project_id: (fullParent?.project_id as string) ?? parent.project_id,
              assigned_to: (fullParent?.assigned_to as string | null) ?? parent.assigned_to,
              due_date: (fullParent?.due_date as string | null) ?? null,
              priority: (fullParent?.priority as string) ?? 'medium',
            },
            (params.subtasks as Array<string | Record<string, unknown>>).slice(0, 60),
          )
          if (res.created === 0) {
            return json({
              reply: `Não consegui criar as subtarefas (${res.errors[0] || 'nenhum título válido'}). Tente de novo.`,
              action: { type: 'none' },
            })
          }
          if (truncatedOutput || res.failed > 0) {
            aiParsed.reply = `${aiParsed.reply || 'Subtarefas criadas.'} Atenção: ${res.failed > 0 ? `${res.failed} subtarefa(s) não foram salvas; ` : ''}${truncatedOutput ? 'a resposta da IA foi cortada pelo limite de saída e pode estar faltando item; ' : ''}peça para continuar.`
          }
          actionResult = {
            success: res.failed === 0,
            count: res.created,
            parentTaskId: parent.id,
            subtasksCreated: res.created,
            subtasksFailed: res.failed,
            errors: res.errors,
            truncated: truncatedOutput,
          }
        }
      } else if (type === 'bulk_status_update' && params.target_status) {
        const normTarget = normalizeStatus(params.target_status)
        if (!normTarget) {
          return json({
            reply: `Status "${params.target_status}" inválido. Use: backlog, todo, in_progress, review ou done.`,
            action: { type: 'none' },
          })
        }
        const projectIdToUse = (params.project_id as string) || context.projectId
        if (projectIdToUse) {
          let query = admin
            .from('tasks')
            .update({ status: normTarget })
            .eq('project_id', projectIdToUse)

          if (params.from_priority) {
            query = query.eq('priority', normalizePriority(params.from_priority))
          }

          const { data: updated } = await query.select('id')
          if (normTarget === 'done') {
            await clearDueRemindersFor(
              ((updated ?? []) as Array<{ id: string }>).map((t) => t.id),
            )
          }
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
      } else if (type === 'delete_project') {
        let projectId = (params.project_id || params.id) as string | undefined
        const searchName = String(params.project_name || params.name || '').trim().toLowerCase()

        if (!projectId && searchName) {
          const match = (allProjects ?? []).find(
            (p) => p.name.toLowerCase() === searchName ||
                   p.name.toLowerCase().includes(searchName) ||
                   searchName.includes(p.name.toLowerCase())
          )
          if (match) projectId = match.id
        }

        if (projectId) {
          const targetProj = (allProjects ?? []).find((p) => p.id === projectId)
          if (!targetProj) {
            return json({
              reply: `Não encontrei nenhum projeto com o ID ou nome informado para excluir.`,
              action: { type: 'none' },
            })
          }

          // Exclui projeto (as tarefas vinculadas cascateiam via ON DELETE CASCADE no banco)
          const { error: delErr } = await admin.from('projects').delete().eq('id', projectId)
          if (delErr) {
            return json({
              reply: `Erro ao excluir o projeto "${targetProj.name}": ${delErr.message}`,
              action: { type: 'none' },
            })
          }

          actionResult = {
            success: true,
            deletedProjectId: projectId,
            projectName: targetProj.name,
            wasArchived: targetProj.archived,
          }
        } else {
          return json({
            reply: `Não identifiquei qual projeto você deseja excluir. Informe o nome ou ID do projeto arquivado.`,
            action: { type: 'none' },
          })
        }
      } else if (type === 'archive_project') {
        let projectId = (params.project_id || params.id) as string | undefined
        const searchName = String(params.project_name || params.name || '').trim().toLowerCase()
        if (!projectId && searchName) {
          const match = (allProjects ?? []).find(
            (p) => p.name.toLowerCase() === searchName ||
                   p.name.toLowerCase().includes(searchName) ||
                   searchName.includes(p.name.toLowerCase())
          )
          if (match) projectId = match.id
        }

        if (projectId) {
          const targetProj = (allProjects ?? []).find((p) => p.id === projectId)
          const shouldArchive = params.archive !== undefined ? Boolean(params.archive) : true
          const { error: archErr } = await admin.from('projects').update({ archived: shouldArchive }).eq('id', projectId)
          if (archErr) {
            return json({ reply: `Erro ao alterar status do projeto: ${archErr.message}`, action: { type: 'none' } })
          }
          actionResult = {
            success: true,
            projectId,
            projectName: targetProj?.name || projectId,
            archived: shouldArchive,
          }
        } else {
          return json({ reply: `Não identifiquei o projeto para arquivar.`, action: { type: 'none' } })
        }
      } else if (type === 'create_vendor') {
        const name = String(params.name || '').trim()
        if (!name) {
          return json({ reply: 'Informe o nome do fornecedor ou colaborador.', action: { type: 'none' } })
        }
        const { data: createdVendor, error: vendorErr } = await admin.from('hub_vendors').insert({
          name,
          kind: (params.kind as string) || 'fornecedor',
          phone: (params.phone as string) || null,
          email: (params.email as string) || null,
          pix: (params.pix as string) || null,
          note: (params.note as string) || null,
          link1: (params.link1 as string) || (params.link as string) || null,
          created_by: userId,
        }).select().single()

        if (vendorErr) {
          return json({ reply: `Erro ao cadastrar fornecedor: ${vendorErr.message}`, action: { type: 'none' } })
        }
        actionResult = { success: true, vendor: createdVendor }
      } else if (type === 'duplicate_task') {
        const sourceTitle = params.source_task_title as string
        if (sourceTitle) {
          const { data: found } = await admin
            .from('tasks')
            .select('*')
            .is('deleted_at', null)
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
          } else {
            return json({
              reply: `Não encontrei a tarefa "${sourceTitle}" para duplicar.`,
              action: { type: 'none' },
            })
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
            .is('deleted_at', null)
            .ilike('title', `%${cleanSearch}%`)
            .limit(1)
          taskId = found?.[0]?.id
        }

        if (taskId) {
          if (isCollaborator) {
            const { data: targetTask } = await admin
              .from('tasks')
              .select('id, project_id')
              .eq('id', taskId)
              .maybeSingle()
            if (!targetTask || !accessibleProjectIds.has(targetTask.project_id)) {
              return json({
                reply: 'Você não possui permissão para modificar esta tarefa, pois ela não pertence aos seus projetos designados.',
                action: { type: 'none' },
              })
            }
          }

          const patch: Record<string, unknown> = {}
          const normStatus = normalizeStatus(params.status)
          if (normStatus) patch.status = normStatus
          if (params.priority !== undefined) patch.priority = normalizePriority(params.priority)
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
            if ((patch.status as string) === 'done') {
              await clearDueRemindersFor([taskId])
            }
            actionResult = { success: true, task: updated }
          }
        } else {
          actionResult = { success: false, error: `Tarefa "${searchTitle}" não encontrada.` }
          return json({
            reply: `Não encontrei a tarefa "${searchTitle || 'informada'}". Verifique o título e tente de novo.`,
            action: { type: 'none' },
          })
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
              .is('deleted_at', null)
              .ilike('title', `%${cleanSearch}%`)
              .limit(1)
            taskId = found?.[0]?.id
          }

          if (taskId) {
            if (isCollaborator) {
              const { data: targetTask } = await admin
                .from('tasks')
                .select('id, project_id')
                .eq('id', taskId)
                .maybeSingle()
              if (!targetTask || !accessibleProjectIds.has(targetTask.project_id)) {
                continue
              }
            }

            const patch: Record<string, unknown> = {}
            const normItemStatus = normalizeStatus(item.status)
            if (normItemStatus) patch.status = normItemStatus
            if (item.priority !== undefined) patch.priority = normalizePriority(item.priority)
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
        const doneIds = (updatedList as Array<{ id: string; status?: string }>)
          .filter((t) => {
            const wanted = (params.tasks as Array<Record<string, unknown>>).find(
              (it) => it.task_id === t.id || it.id === t.id,
            )
            return normalizeStatus(wanted?.status) === 'done' || t.status === 'done'
          })
          .map((t) => t.id)
        await clearDueRemindersFor(doneIds)
        if (updatedList.length === 0) {
          return json({
            reply: 'Não encontrei as tarefas informadas para atualizar. Verifique os títulos e tente de novo.',
            action: { type: 'none' },
          })
        }
        actionResult = { success: true, count: updatedList.length, tasks: updatedList }
      } else if (type === 'delete_task') {
        let taskId = params.task_id as string | undefined
        if (!taskId && params.task_title) {
          const { data: found } = await admin
            .from('tasks')
            .select('id')
            .is('deleted_at', null)
            .ilike('title', `%${params.task_title}%`)
            .limit(1)
          taskId = found?.[0]?.id
        }

        if (taskId) {
          if (isCollaborator) {
            const { data: targetTask } = await admin
              .from('tasks')
              .select('id, project_id')
              .eq('id', taskId)
              .maybeSingle()
            if (!targetTask || !accessibleProjectIds.has(targetTask.project_id)) {
              return json({
                reply: 'Você não possui permissão para excluir esta tarefa.',
                action: { type: 'none' },
              })
            }
          }

          // Soft delete da tarefa e de todas as suas subtarefas recursivamente
          const nowIso = new Date().toISOString()
          const idsToDelete: string[] = [taskId]
          let parentIds = [taskId]
          while (parentIds.length > 0) {
            const { data: children } = await admin
              .from('tasks')
              .select('id')
              .in('parent_id', parentIds)
            if (children && children.length > 0) {
              const childIds = children.map((c: { id: string }) => c.id)
              idsToDelete.push(...childIds)
              parentIds = childIds
            } else {
              parentIds = []
            }
          }

          await admin.from('tasks').update({ deleted_at: nowIso }).in('id', idsToDelete)
          actionResult = { success: true, deletedTaskId: taskId, count: idsToDelete.length }
        } else {
          return json({
            reply: `Não encontrei a tarefa "${(params.task_title as string) || 'informada'}" para excluir.`,
            action: { type: 'none' },
          })
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
            role: (params.role as 'admin' | 'member' | 'collaborator') || 'member',
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
        const bodyHtml = String(params.body || '').trim()
        const taskId = (params.task_id as string) || null

        // Busca dados completos da tarefa caso taskId esteja presente
        let taskData: { title: string; due_date: string | null } | null = null
        if (taskId) {
          const { data: t } = await admin
            .from('tasks')
            .select('title, due_date')
            .eq('id', taskId)
            .maybeSingle()
          if (t) taskData = t
        }

        const emailResult = await dispatchEmailNotification({
          recipient,
          subject,
          bodyHtml,
          taskId,
          taskTitle: taskData?.title || null,
          taskDueDate: taskData?.due_date || null,
        })

        if (!emailResult.success) {
          return json({
            reply: emailResult.error || `Não foi possível encontrar o e-mail para o usuário "${recipient}".`,
            action: { type: 'none' },
          })
        }

        actionResult = {
          success: true,
          recipient: emailResult.targetEmail,
          subject,
          direct: emailResult.direct,
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

    // Se a execução falhou, não deixa o texto otimista da IA passar como sucesso.
    const execFailed =
      actionResult !== null &&
      typeof actionResult === 'object' &&
      (actionResult as Record<string, unknown>).success === false
    const finalReply =
      aiParsed.reply ||
      (aiParsed.action?.type === 'send_email'
        ? 'E-mail enviado com sucesso.'
        : aiParsed.action?.type === 'send_notification'
          ? 'Notificação enviada com sucesso.'
          : aiParsed.action?.type === 'create_project'
            ? 'Projeto criado com sucesso.'
            : aiParsed.action?.type === 'delete_project'
              ? 'Projeto excluído com sucesso.'
              : aiParsed.action?.type === 'archive_project'
                ? 'Status do projeto atualizado com sucesso.'
                : aiParsed.action?.type === 'create_vendor'
                  ? 'Fornecedor/colaborador cadastrado com sucesso.'
                  : aiParsed.action?.type === 'create_link'
                    ? 'Link útil salvo com sucesso.'
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
                        ? 'Não identifiquei nenhuma ação direta para executar. Se deseja criar uma tarefa ou projeto, especifique o título ou detalhes.'
                        : 'Comando processado com sucesso.')

    return json({
      reply: execFailed
        ? `${finalReply} (A ação não foi concluída: ${(actionResult as Record<string, unknown>).error || 'verifique os parâmetros e tente de novo'}.)`
        : finalReply,
      action: execFailed ? { type: 'none' } : aiParsed.action,
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
