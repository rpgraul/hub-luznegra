/**
 * ============================================================================
 * HUB LUZ NEGRA — AUTOMAÇÃO DE TRIAGEM INTELIGENTE DE E-MAILS DE PÓS-VENDA & DEV
 * ============================================================================
 * Plataforma: Google Apps Script (Executado no Gmail / Google Workspace)
 * Modelo de IA: Groq (openai/gpt-oss-120b com fallbacks) com JSON Mode
 * Destino: Supabase Database (REST API /rest/v1/tasks)
 *
 * RECURSOS IMPLEMENTADOS:
 * - Filtro anti-backlog: analisa apenas mensagens recentes (newer_than:2d).
 * - Roteamento inteligente: e-mails de desenvolvimento/site/servidor/segurança vão para @rpgraul.
 * - Prazos automáticos (due_date): entre 3 e 10 dias úteis conforme a urgência.
 * - Follow-up inteligente: mensagens adicionais do mesmo cliente elevam a prioridade e inserem comentário.
 * - Idempotência completa via label "Processado-IA" e índice único por gmail_thread_id.
 * ============================================================================
 */

// ============================================================================
// CONFIGURAÇÕES — PREENCHA SUAS CHAVES AQUI
// ============================================================================
const CONFIG = {
  // Chave de API da Groq (https://console.groq.com/keys)
  GROQ_API_KEY: "COLE_SUA_CHAVE_GROQ_AQUI",

  // URL do projeto Supabase (ex: "https://uzxvlmnwgznjpqwshekt.supabase.co")
  SUPABASE_URL: "COLE_SUA_URL_SUPABASE_AQUI",

  // Chave secreta de serviço do Supabase (Service Role Key, para acesso via script)
  // Dashboard Supabase -> Project Settings -> API -> Project API keys -> service_role
  SUPABASE_SERVICE_ROLE_KEY: "COLE_SUA_SERVICE_ROLE_KEY_AQUI",

  // ID do Projeto fixo "Pós-Venda / Suporte" criado na migração 0028 do HUB.
  PROJETO_ID: "00000000-0000-4000-a000-000000000501",

  // ID do membro @rpgraul no HUB (para atribuição automática de chamados técnicos/dev)
  RPGRAUL_USER_ID: "35a42dbe-5137-4899-9653-e0764b464571",

  // Nome do marcador do Gmail para controle de idempotência
  LABEL_PROCESSADO: "Processado-IA",

  // Janela de busca para ignorar e-mails antigos esquecidos na Inbox (ex: "2d" = últimos 2 dias)
  JANELA_BUSCA: "newer_than:2d",

  // Limite de threads analisadas por execução (evita timeout do GAS)
  MAX_THREADS_POR_EXECUCAO: 15,

  // Intervalo do gatilho automático de tempo em minutos
  INTERVALO_MINUTOS_GATILHO: 15,

  // Modelo principal da Groq
  GROQ_MODEL: "openai/gpt-oss-120b",

  // Modelos alternativos de fallback caso o principal retorne 404
  GROQ_FALLBACK_MODELS: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
};

/**
 * Função principal: busca e-mails novos na Inbox, filtra via Groq e gera tarefas no HUB.
 */
function triagemEmailsPosVenda() {
  Logger.log("=== INICIANDO TRIAGEM DE E-MAILS DE PÓS-VENDA & SUPORTE ===");

  if (!CONFIG.GROQ_API_KEY || CONFIG.GROQ_API_KEY.includes("COLE_SUA")) {
    throw new Error("GROQ_API_KEY não configurada. Preencha no topo do script.");
  }
  if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes("COLE_SUA")) {
    throw new Error("SUPABASE_URL não configurada. Preencha no topo do script.");
  }
  if (!CONFIG.SUPABASE_SERVICE_ROLE_KEY || CONFIG.SUPABASE_SERVICE_ROLE_KEY.includes("COLE_SUA")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada. Preencha no topo do script.");
  }

  // 1. Garantir que a label de processado existe no Gmail
  const labelProcessado = obterOuCriarLabel(CONFIG.LABEL_PROCESSADO);

  // 2. Buscar threads não processadas e recentes na caixa de entrada
  const query = `label:inbox -label:${CONFIG.LABEL_PROCESSADO} ${CONFIG.JANELA_BUSCA}`;
  const threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_POR_EXECUCAO);

  Logger.log(`Query de busca: "${query}"`);
  Logger.log(`Encontradas ${threads.length} thread(s) pendente(s) de avaliação.`);
  if (threads.length === 0) {
    Logger.log("Nenhum e-mail novo na janela de busca.");
    return;
  }

  let tarefasCriadas = 0;
  let followUpsAtualizados = 0;
  let emailsIgnorados = 0;
  let erros = 0;

  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const threadId = thread.getId();

    try {
      const messages = thread.getMessages();
      const lastMessage = messages[messages.length - 1]; // Última mensagem da thread

      const remetenteRaw = lastMessage.getFrom();
      const remetenteEmail = extrairEmailPuro(remetenteRaw);
      const assunto = thread.getFirstMessageSubject() || "(Sem assunto)";
      const dataMsg = lastMessage.getDate();

      // Monta corpo textual concatenado (últimas mensagens com limite de caracteres)
      const corpoTexto = extrairCorpoMensagens(messages);

      Logger.log(`\n[${i + 1}/${threads.length}] Analisando: "${assunto}" | De: ${remetenteRaw}`);

      // 3. Chamar a IA Groq para triagem e classificação
      const analise = analisarComGroq({
        remetente: remetenteRaw,
        assunto: assunto,
        corpo: corpoTexto,
        data: dataMsg.toISOString()
      });

      Logger.log(`Decisão da IA: ignorar=${analise.ignorar} | Categoria: ${analise.categoria || 'N/A'} | Urgência: ${analise.urgencia || 'N/A'} | Motivo: ${analise.motivo_decisao}`);

      // 4. Se a IA indicar que exige ação humana
      if (!analise.ignorar) {
        // 4.1 Verificar se já existe uma tarefa aberta para esse caso (Follow-up)
        const tarefaAberta = buscarTarefaAbertaExistente({
          threadId: threadId,
          remetenteEmail: remetenteEmail,
          analise: analise
        });

        if (tarefaAberta) {
          // É uma mensagem repetida ou réplica: eleva prioridade e insere comentário
          elevarPrioridadeTarefa(tarefaAberta, {
            remetente: remetenteRaw,
            assunto: assunto,
            corpo: corpoTexto,
            analise: analise
          });
          followUpsAtualizados++;
        } else {
          // Criar nova tarefa no Supabase
          const tarefaPayload = montarPayloadTarefa({
            threadId: threadId,
            remetente: remetenteRaw,
            remetenteEmail: remetenteEmail,
            assunto: assunto,
            corpo: corpoTexto,
            analise: analise
          });

          const sucesso = criarTarefaNoSupabase(tarefaPayload);
          if (sucesso) {
            tarefasCriadas++;
            Logger.log(`Tarefa criada com sucesso no HUB: "${analise.titulo_tarefa}"`);
          } else {
            erros++;
          }
        }
      } else {
        emailsIgnorados++;
      }

      // 5. Idempotência: marcar a thread com a label Processado-IA
      thread.addLabel(labelProcessado);

    } catch (err) {
      erros++;
      Logger.log(`ERRO ao processar thread ${threadId}: ${err.message}`);
      // Marca a label mesmo em caso de erro para não travar a fila em loop
      try {
        thread.addLabel(labelProcessado);
      } catch (e) {
        Logger.log(`Não foi possível marcar label na thread com erro: ${e.message}`);
      }
    }
  }

  Logger.log("\n=== RESUMO DA EXECUÇÃO ===");
  Logger.log(`Total avaliado: ${threads.length}`);
  Logger.log(`Novas tarefas criadas no HUB: ${tarefasCriadas}`);
  Logger.log(`Follow-ups atualizados (prioridade elevada): ${followUpsAtualizados}`);
  Logger.log(`E-mails ignorados (transacionais/spam): ${emailsIgnorados}`);
  Logger.log(`Erros: ${erros}`);
}

/**
 * Consulta a IA da Groq com response_format: json_object.
 */
function analisarComGroq(dadosEmail) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const systemPrompt = `Você é o Agente de Triagem e Suporte Pós-Venda da Editora Luz Negra (editora de livros, RPG e quadrinhos).
Sua missão é triar e-mails da caixa de entrada e identificar se exigem ação humana da equipe ou se devem ser ignorados.

REGRAS DE CLASSIFICAÇÃO:

1. DEFINIR "ignorar: true" (NÃO CRIAR TAREFA) OBRIGATORIAMENTE PARA:
- E-mails transacionais automáticos de rotina (redefinição de senha pessoal, confirmação de cadastro de conta, confirmação automática de login em dispositivo pessoal, códigos 2FA).
- Confirmações automáticas de entrega ou avisos de rastreio de transportadora SEM reclamação explícita de cliente.
- Notificações rotineiras de sistemas (extratos bancários simples, recibos automáticos de compra que não exigem ação, informes diários sem alerta).
- Newsletters, marketing, propagandas comerciais, parcerias genéricas, spam e auto-respostas de férias.

2. DEFINIR "ignorar: false" (CRIAR TAREFA) EXCLUSIVAMENTE PARA:
- DESENVOLVIMENTO / SITE / SERVIDOR / SEGURANÇA:
  E-mails de provedores de infraestrutura ou plataformas técnicas (Mercado Pago, Cloudflare, HostGator, GitHub, Supabase, etc.) contendo "AÇÃO NECESSÁRIA", vulnerabilidade crítica de segurança (ex: falhas de PHP, injeção de código, servidores desatualizados), certificados SSL expirando, erros críticos de integração da loja/WooCommerce ou problemas no servidor.
  -> categoria: "desenvolvimento"
  -> urgencia: "alta"
- EXTRAVIO: pacote sumido, roubado, devolvido indevidamente ou parado nos Correios há muito tempo.
  -> categoria: "extravio"
  -> urgencia: "alta"
- AVARIA: livro ou recompensa que chegou amassada, rasgada, com defeito gráfico, faltando itens ou produto trocado.
  -> categoria: "avaria"
  -> urgencia: "alta" ou "media"
- ATRASO: cliente reclamando de prazo expirado ou solicitando código de rastreamento pendente.
  -> categoria: "atraso"
  -> urgencia: "media" ou "alta"
- DÚVIDA / SUPORTE AO CLIENTE: cliente/apoiador com dúvida sobre envio, endereço de entrega, recompensa do Catarse ou necessitando de suporte real da equipe.
  -> categoria: "duvida"
  -> urgencia: "media" ou "baixa"

EXTRAÇÃO DE DADOS:
- categoria: 'extravio' | 'avaria' | 'atraso' | 'duvida' | 'desenvolvimento' | 'outro'
- urgencia: 'alta' (segurança/vulnerabilidade técnica, extravio ou danos graves), 'media' (atraso/dúvida de entrega), 'baixa' (dúvida geral)
- precisa_abrir_pi_correios: true APENAS se for extravio ou atraso crítico onde cabe abertura de Pedido de Informação (PI) nos Correios.
- codigo_rastreio: código no padrão Correios (ex: BR123456789BR, AA123456789BR) ou transportadora se citado (ou null).
- codigo_pedido: número do pedido, ID do apoio no Catarse/Apoia.se ou referência da compra se citado (ou null).
- titulo_tarefa: Título descritivo, objetivo e claro para o card do gestor de tarefas.
- resumo_ia: Síntese direta de 1 a 2 linhas explicando o problema central para o responsável.
- motivo_decisao: Breve justificativa do porquê foi ignorado ou aprovado.

Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "ignorar": boolean,
  "motivo_decisao": string,
  "titulo_tarefa": string,
  "categoria": "extravio" | "avaria" | "atraso" | "duvida" | "desenvolvimento" | "outro",
  "urgencia": "baixa" | "media" | "alta",
  "codigo_rastreio": string | null,
  "codigo_pedido": string | null,
  "precisa_abrir_pi_correios": boolean,
  "resumo_ia": string
}`;

  const userContent = `DADOS DO E-MAIL:
Remetente: ${dadosEmail.remetente}
Assunto: ${dadosEmail.assunto}
Data: ${dadosEmail.data}

CONTEÚDO DO E-MAIL:
${dadosEmail.corpo}
`;

  const candidateModels = Array.from(new Set([CONFIG.GROQ_MODEL, ...(CONFIG.GROQ_FALLBACK_MODELS || [])]));
  let lastError = null;

  for (const modelToTry of candidateModels) {
    const payload = {
      model: modelToTry,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 800
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: `Bearer ${CONFIG.GROQ_API_KEY}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (statusCode === 200) {
      const json = JSON.parse(responseText);
      const rawContent = json.choices[0].message.content;
      return JSON.parse(rawContent);
    }

    lastError = `HTTP ${statusCode}: ${responseText}`;
    if (statusCode === 404 && responseText.includes("model_not_found")) {
      Logger.log(`Aviso: Modelo "${modelToTry}" não disponível na conta Groq. Tentando próximo modelo...`);
      continue;
    }

    throw new Error(`Erro na API da Groq (${lastError})`);
  }

  throw new Error(`Nenhum modelo da Groq respondeu com sucesso. Último erro: ${lastError}`);
}

/**
 * Busca se já existe uma tarefa aberta para o mesmo cliente, pedido ou thread (Follow-up).
 */
function buscarTarefaAbertaExistente(params) {
  const cleanUrl = CONFIG.SUPABASE_URL.replace(/\/+$/, "");
  const headers = {
    apikey: CONFIG.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_ROLE_KEY}`
  };

  // 1. Busca pela mesma thread do Gmail
  if (params.threadId) {
    try {
      const res = UrlFetchApp.fetch(
        `${cleanUrl}/rest/v1/tasks?gmail_thread_id=eq.${encodeURIComponent(params.threadId)}&status=not.eq.done&select=id,title,priority,status,email_remetente`,
        { method: "get", headers: headers, muteHttpExceptions: true }
      );
      if (res.getResponseCode() === 200) {
        const list = JSON.parse(res.getContentText());
        if (list.length > 0) return list[0];
      }
    } catch (e) {
      Logger.log(`Erro ao buscar por threadId: ${e.message}`);
    }
  }

  // 2. Busca pelo código de pedido se informado
  if (params.analise.codigo_pedido) {
    try {
      const res = UrlFetchApp.fetch(
        `${cleanUrl}/rest/v1/tasks?codigo_pedido=eq.${encodeURIComponent(params.analise.codigo_pedido)}&status=not.eq.done&select=id,title,priority,status,email_remetente`,
        { method: "get", headers: headers, muteHttpExceptions: true }
      );
      if (res.getResponseCode() === 200) {
        const list = JSON.parse(res.getContentText());
        if (list.length > 0) return list[0];
      }
    } catch (e) {
      Logger.log(`Erro ao buscar por codigo_pedido: ${e.message}`);
    }
  }

  // 3. Busca pelo e-mail do remetente (últimas tarefas em aberto)
  if (params.remetenteEmail && params.remetenteEmail.includes("@") && !params.remetenteEmail.includes("contato@luznegra")) {
    try {
      const res = UrlFetchApp.fetch(
        `${cleanUrl}/rest/v1/tasks?email_remetente=ilike.*${encodeURIComponent(params.remetenteEmail)}*&status=not.eq.done&select=id,title,priority,status,email_remetente&order=created_at.desc&limit=1`,
        { method: "get", headers: headers, muteHttpExceptions: true }
      );
      if (res.getResponseCode() === 200) {
        const list = JSON.parse(res.getContentText());
        if (list.length > 0) return list[0];
      }
    } catch (e) {
      Logger.log(`Erro ao buscar por email_remetente: ${e.message}`);
    }
  }

  return null;
}

/**
 * Eleva a prioridade de uma tarefa existente e insere comentário com o follow-up.
 */
function elevarPrioridadeTarefa(tarefaExistente, params) {
  const cleanUrl = CONFIG.SUPABASE_URL.replace(/\/+$/, "");
  const headers = {
    apikey: CONFIG.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_ROLE_KEY}`
  };

  // Eleva prioridade: low -> medium -> high -> urgent
  const escadaPrioridade = {
    low: "medium",
    medium: "high",
    high: "urgent",
    urgent: "urgent"
  };
  const prioridadeAtual = tarefaExistente.priority || "medium";
  const novaPrioridade = escadaPrioridade[prioridadeAtual] || "high";

  // 1. Atualizar prioridade no Supabase
  UrlFetchApp.fetch(`${cleanUrl}/rest/v1/tasks?id=eq.${tarefaExistente.id}`, {
    method: "patch",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify({
      priority: novaPrioridade,
      updated_at: new Date().toISOString()
    }),
    muteHttpExceptions: true
  });

  // 2. Inserir comentário na tarefa com o follow-up
  const comentarioConteudo = `[NOVA MENSAGEM / FOLLOW-UP DO CLIENTE]
Recebido em: ${new Date().toLocaleString("pt-BR")}
Assunto: ${params.assunto}
Resumo da IA: ${params.analise.resumo_ia}
Prioridade elevada para: ${novaPrioridade.toUpperCase()}

Mensagem:
${params.corpo.slice(0, 1200)}`;

  UrlFetchApp.fetch(`${cleanUrl}/rest/v1/task_comments`, {
    method: "post",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify({
      task_id: tarefaExistente.id,
      author_id: CONFIG.RPGRAUL_USER_ID,
      content: comentarioConteudo
    }),
    muteHttpExceptions: true
  });

  Logger.log(`FOLLOW-UP PROCESSADO: Tarefa existente "${tarefaExistente.title}" (ID: ${tarefaExistente.id}) teve a prioridade elevada de ${prioridadeAtual} para ${novaPrioridade}.`);
}

/**
 * Cria a tarefa via REST API do Supabase (/rest/v1/tasks).
 */
function criarTarefaNoSupabase(tarefaPayload) {
  const cleanUrl = CONFIG.SUPABASE_URL.replace(/\/+$/, "");
  const url = `${cleanUrl}/rest/v1/tasks`;

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: CONFIG.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation"
    },
    payload: JSON.stringify(tarefaPayload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode === 201 || statusCode === 200) {
    return true;
  }

  // Idempotência por gmail_thread_id
  if (responseText.includes("idx_tasks_gmail_thread_id_unique") || responseText.includes("duplicate key")) {
    Logger.log(`Tarefa para thread ${tarefaPayload.gmail_thread_id} já existia no banco (idempotente).`);
    return true;
  }

  Logger.log(`Falha ao criar tarefa no Supabase (HTTP ${statusCode}): ${responseText}`);
  return false;
}

/**
 * Monta o payload completo da tarefa compatível com o schema do HUB.
 */
function montarPayloadTarefa(params) {
  const analise = params.analise;

  // 1. Determinar prioridade nativa
  let priority = "medium";
  if (analise.urgencia === "alta") {
    priority = (analise.precisa_abrir_pi_correios || analise.categoria === "desenvolvimento") ? "urgent" : "high";
  } else if (analise.urgencia === "baixa") {
    priority = "low";
  }

  // 2. Calcular prazo (due_date) entre 3 e 10 dias
  let diasPrazo = 5;
  if (priority === "urgent" || priority === "high") {
    diasPrazo = 3;
  } else if (priority === "low") {
    diasPrazo = 10;
  }
  const dataPrazo = new Date();
  dataPrazo.setDate(dataPrazo.getDate() + diasPrazo);
  const dueDateIso = dataPrazo.toISOString().split("T")[0];

  // 3. Roteamento: se for desenvolvimento/técnico/site, atribui para @rpgraul
  let assignedTo = null;
  let assignees = null;
  const tags = ["pos-venda"];
  const categories = ["Pós-Venda"];

  if (analise.categoria === "desenvolvimento") {
    assignedTo = CONFIG.RPGRAUL_USER_ID;
    assignees = [CONFIG.RPGRAUL_USER_ID];
    tags.push("dev");
    categories.push("Desenvolvimento");
  }

  // 4. Descrição Lexical formatada
  const lexicalDesc = construirDescricaoLexical({
    resumo: analise.resumo_ia,
    remetente: params.remetente,
    assunto: params.assunto,
    codigoRastreio: analise.codigo_rastreio,
    codigoPedido: analise.codigo_pedido,
    piCorreios: analise.precisa_abrir_pi_correios,
    corpoOriginal: params.corpo
  });

  return {
    title: analise.titulo_tarefa || `Atendimento: ${params.assunto.slice(0, 80)}`,
    project_id: CONFIG.PROJETO_ID || "00000000-0000-4000-a000-000000000501",
    status: "todo",
    priority: priority,
    assigned_to: assignedTo,
    assignees: assignees,
    start_date: new Date().toISOString().split("T")[0],
    due_date: dueDateIso,
    email_remetente: params.remetente,
    assunto_email: params.assunto,
    categoria: analise.categoria || "outro",
    codigo_rastreio: analise.codigo_rastreio || null,
    codigo_pedido: analise.codigo_pedido || null,
    urgencia: analise.urgencia || "media",
    precisa_abrir_pi_correios: Boolean(analise.precisa_abrir_pi_correios),
    status_correios: "pendente",
    resumo_ia: analise.resumo_ia || null,
    gmail_thread_id: params.threadId,
    tags: tags,
    categories: categories,
    description: lexicalDesc
  };
}

/**
 * Constrói o estado serializado Lexical JSON para exibição no HUB.
 */
function construirDescricaoLexical(dados) {
  const paragrafos = [];

  // Parágrafo 1: Resumo da IA
  paragrafos.push({
    type: "paragraph",
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "text",
        text: `RESUMO DA IA: ${dados.resumo}`,
        format: 1,
        detail: 0,
        mode: "normal",
        style: "color: #0284c7;",
        version: 1
      }
    ],
    direction: "ltr"
  });

  // Parágrafo 2: Metadados
  const metaTextos = [
    `Remetente: ${dados.remetente}`,
    dados.codigoPedido ? `Pedido/Apoio: #${dados.codigoPedido}` : null,
    dados.codigoRastreio ? `Rastreamento: ${dados.codigoRastreio}` : null,
    dados.piCorreios ? "Atenção: Abertura de PI nos Correios requerida!" : null
  ].filter(Boolean).join(" | ");

  paragrafos.push({
    type: "paragraph",
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "text",
        text: metaTextos,
        format: 0,
        detail: 0,
        mode: "normal",
        style: "",
        version: 1
      }
    ],
    direction: "ltr"
  });

  // Parágrafo 3: Conteúdo original
  paragrafos.push({
    type: "paragraph",
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "text",
        text: "--- CONTEÚDO ORIGINAL DO E-MAIL ---",
        format: 1,
        detail: 0,
        mode: "normal",
        style: "",
        version: 1
      }
    ],
    direction: "ltr"
  });

  paragrafos.push({
    type: "paragraph",
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "text",
        text: dados.corpoOriginal.slice(0, 1500),
        format: 0,
        detail: 0,
        mode: "normal",
        style: "",
        version: 1
      }
    ],
    direction: "ltr"
  });

  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      children: paragrafos,
      direction: "ltr"
    }
  };
}

/**
 * Extrai apenas o endereço de e-mail puro de uma string "Nome <email@dominio.com>".
 */
function extrairEmailPuro(remetenteRaw) {
  if (!remetenteRaw) return "";
  const match = remetenteRaw.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  return remetenteRaw.toLowerCase().trim();
}

/**
 * Extrai e limpa o texto das mensagens de uma thread para passar à IA.
 */
function extrairCorpoMensagens(messages) {
  const partes = [];
  const ultimas = messages.slice(-3);

  for (let m = 0; m < ultimas.length; m++) {
    const msg = ultimas[m];
    const de = msg.getFrom();
    const data = msg.getDate().toLocaleString("pt-BR");
    let corpo = msg.getPlainBody() || "";

    corpo = corpo
      .replace(/Em .+ escreveu:.+/gs, "")
      .replace(/On .+ wrote:.+/gs, "")
      .replace(/---+ Original Message ---.+/gs, "")
      .trim();

    if (corpo.length > 2000) {
      corpo = corpo.slice(0, 2000) + "... [truncado]";
    }

    partes.push(`[${data}] De: ${de}\n${corpo}`);
  }

  return partes.join("\n\n");
}

/**
 * Obtém ou cria a label no Gmail.
 */
function obterOuCriarLabel(nomeLabel) {
  let label = GmailApp.getUserLabelByName(nomeLabel);
  if (!label) {
    label = GmailApp.createLabel(nomeLabel);
    Logger.log(`Label "${nomeLabel}" criada no Gmail.`);
  }
  return label;
}

// ============================================================================
// FUNÇÕES UTILITÁRIAS PARA O USUÁRIO (EXECUÇÃO MANUAL NO APPS SCRIPT)
// ============================================================================

/**
 * Instala o gatilho automático de tempo para rodar a cada 15 minutos.
 */
function instalarGatilhoAutomatico() {
  removerGatilhos();

  ScriptApp.newTrigger("triagemEmailsPosVenda")
    .timeBased()
    .everyMinutes(CONFIG.INTERVALO_MINUTOS_GATILHO || 15)
    .create();

  Logger.log(`Gatilho automático configurado com sucesso! O script rodará a cada ${CONFIG.INTERVALO_MINUTOS_GATILHO} minutos.`);
}

/**
 * Remove gatilhos existentes para evitar duplicações.
 */
function removerGatilhos() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "triagemEmailsPosVenda") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  Logger.log("Gatilhos anteriores removidos.");
}

/**
 * Utilitário: marca todos os e-mails antigos na Inbox com a label "Processado-IA".
 * Execute esta função UMA VEZ se você quiser zerar o passado e processar apenas
 * os novos e-mails que chegarem a partir de agora.
 */
function marcarHistoricoComoProcessado() {
  const label = obterOuCriarLabel(CONFIG.LABEL_PROCESSADO);
  Logger.log("Marcando backlog antigo da Inbox como processado...");
  let totalMarcadas = 0;
  let batch;

  do {
    batch = GmailApp.search(`label:inbox -label:${CONFIG.LABEL_PROCESSADO}`, 0, 50);
    for (let i = 0; i < batch.length; i++) {
      batch[i].addLabel(label);
      totalMarcadas++;
    }
    Logger.log(`Progresso: ${totalMarcadas} threads marcadas...`);
    Utilities.sleep(1000);
  } while (batch.length === 50 && totalMarcadas < 300);

  Logger.log(`Concluído! ${totalMarcadas} thread(s) antigas foram marcadas com "${CONFIG.LABEL_PROCESSADO}".`);
}

/**
 * Testa as conexões com a Groq e com o Supabase antes de rodar o lote.
 */
function testarConexoes() {
  Logger.log("--- TESTANDO CONEXÃO COM A GROQ (TESTE TÉCNICO / DEV) ---");
  const testeGroq = analisarComGroq({
    remetente: "Equipe Mercado Pago Developers <developers@mercadopago.com.br>",
    assunto: "AÇÃO NECESSÁRIA: Verifique a versão de PHP de seu servidor e aplique as correções",
    corpo: "O PHP recebeu correções para duas vulnerabilidades críticas que afetam lojas WooCommerce. Peça à hospedagem que aplique as correções.",
    data: new Date().toISOString()
  });
  Logger.log("Resultado Groq: " + JSON.stringify(testeGroq, null, 2));

  Logger.log("\n--- TESTANDO CONEXÃO COM O SUPABASE ---");
  const cleanUrl = CONFIG.SUPABASE_URL.replace(/\/+$/, "");
  const res = UrlFetchApp.fetch(`${cleanUrl}/rest/v1/projects?select=id,name&id=eq.${CONFIG.PROJETO_ID}`, {
    method: "get",
    headers: {
      apikey: CONFIG.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_ROLE_KEY}`
    },
    muteHttpExceptions: true
  });
  Logger.log(`Supabase Status: ${res.getResponseCode()}`);
  Logger.log(`Supabase Body: ${res.getContentText()}`);
  Logger.log("\nConexões testadas com sucesso!");
}
