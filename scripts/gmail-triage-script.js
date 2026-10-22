/**
 * ============================================================================
 * HUB LUZ NEGRA — AUTOMAÇÃO DE TRIAGEM INTELIGENTE DE E-MAILS DE PÓS-VENDA
 * ============================================================================
 * Plataforma: Google Apps Script (Executado no Gmail / Google Workspace)
 * Modelo de IA: Groq (llama-3.3-70b-versatile) com JSON Mode
 * Destino: Supabase Database (REST API /rest/v1/tasks)
 *
 * INSTRUÇÕES DE INSTALAÇÃO:
 * 1. Acesse https://script.google.com/ e crie um "Novo projeto".
 * 2. Cole este código no arquivo `Código.gs` (ou `gmail-triage.js`).
 * 3. Preencha as credenciais nas variáveis de CONFIGURAÇÃO abaixo:
 *    - GROQ_API_KEY
 *    - SUPABASE_URL
 *    - SUPABASE_SERVICE_ROLE_KEY
 * 4. Execute a função `testarConexoes()` para validar as credenciais.
 * 5. Execute a função `instalarGatilhoAutomatico()` para rodar a cada 10 minutos.
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
  // Deixe como está ou informe outro UUID de projeto do seu HUB.
  PROJETO_ID: "00000000-0000-4000-a000-000000000501",

  // Nome do marcador do Gmail para controle de idempotência
  LABEL_PROCESSADO: "Processado-IA",

  // Limite de threads analisadas por execução (evita estourar timeout do GAS e rate limits)
  MAX_THREADS_POR_EXECUCAO: 15,

  // Modelo da Groq utilizado (openai/gpt-oss-120b ou qwen/qwen3.8-27b)
  GROQ_MODEL: "openai/gpt-oss-120b",

  // Modelos alternativos caso o modelo principal não esteja disponível na sua conta da Groq
  GROQ_FALLBACK_MODELS: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
};

/**
 * Função principal: busca e-mails novos na Inbox, filtra via Groq e gera tarefas no HUB.
 */
function triagemEmailsPosVenda() {
  Logger.log("=== INICIANDO TRIAGEM DE E-MAILS DE PÓS-VENDA ===");

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

  // 2. Buscar threads não processadas na caixa de entrada
  const query = `label:inbox -label:${CONFIG.LABEL_PROCESSADO}`;
  const threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_POR_EXECUCAO);

  Logger.log(`Encontradas ${threads.length} thread(s) pendente(s) de avaliação.`);
  if (threads.length === 0) {
    Logger.log("Nenhum e-mail novo para triagem.");
    return;
  }

  let tarefasCriadas = 0;
  let emailsIgnorados = 0;
  let erros = 0;

  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const threadId = thread.getId();

    try {
      const messages = thread.getMessages();
      const lastMessage = messages[messages.length - 1]; // Última mensagem da thread
      const firstMessage = messages[0];

      const remetente = lastMessage.getFrom();
      const assunto = thread.getFirstMessageSubject() || "(Sem assunto)";
      const dataMsg = lastMessage.getDate();

      // Monta corpo textual concatenado (últimas mensagens com limite de caracteres)
      const corpoTexto = extrairCorpoMensagens(messages);

      Logger.log(`\n[${i + 1}/${threads.length}] Analisando: "${assunto}" | De: ${remetente}`);

      // 3. Chamar a IA Groq para triagem
      const analise = analisarComGroq({
        remetente: remetente,
        assunto: assunto,
        corpo: corpoTexto,
        data: dataMsg.toISOString()
      });

      Logger.log(`Decisão da IA: ignorar=${analise.ignorar} | Categoria: ${analise.categoria || 'N/A'} | Motivo: ${analise.motivo_decisao}`);

      // 4. Se a IA indicar que exige ação humana, criar a tarefa no Supabase
      if (!analise.ignorar) {
        const tarefaPayload = montarPayloadTarefa({
          threadId: threadId,
          remetente: remetente,
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
      } else {
        emailsIgnorados++;
      }

      // 5. Idempotência: marcar a thread com a label Processado-IA
      thread.addLabel(labelProcessado);

    } catch (err) {
      erros++;
      Logger.log(`ERRO ao processar thread ${threadId}: ${err.message}`);
      // Marca a label mesmo em caso de erro semântico para não travar a fila em loop infinito
      try {
        thread.addLabel(labelProcessado);
      } catch (e) {
        Logger.log(`Não foi possível marcar label na thread com erro: ${e.message}`);
      }
    }
  }

  Logger.log("\n=== RESUMO DA EXECUÇÃO ===");
  Logger.log(`Total avaliado: ${threads.length}`);
  Logger.log(`Tarefas criadas no HUB: ${tarefasCriadas}`);
  Logger.log(`E-mails transacionais/ignorados: ${emailsIgnorados}`);
  Logger.log(`Erros: ${erros}`);
}

/**
 * Consulta o modelo LLaMA na Groq com response_format: json_object.
 */
function analisarComGroq(dadosEmail) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const systemPrompt = `Você é o Agente de Triagem e Suporte Pós-Venda da Editora Luz Negra (editora de livros, RPG e quadrinhos).
Sua missão é triar e-mails da caixa de entrada e identificar se exigem ação humana da equipe de atendimento ou se devem ser ignorados.

REGRAS DE CLASSIFICAÇÃO:

1. DEFINIR "ignorar: true" (NÃO CRIAR TAREFA) OBRIGATORIAMENTE PARA:
- E-mails transacionais automáticos (redefinição de senha, confirmação de criação de conta, login em novo dispositivo, alertas de segurança, códigos 2FA).
- Notificações automáticas de sistemas (GitHub, HostGator, Cloudflare, Supabase, bancos, boletos, gateways de pagamento, notas fiscais eletrônicas automáticas).
- Confirmações de entrega ou avisos de rastreio automáticos SEM reclamação explícita de cliente.
- Mensagens automáticas de plataformas (Catarse/Apoia.se automáticos informando novo apoio, sem mensagem de suporte do apoiador).
- Newsletters, marketing, propagandas, propostas comerciais, spam e auto-respostas de férias.

2. DEFINIR "ignorar: false" (CRIAR TAREFA) EXCLUSIVAMENTE PARA:
- Extravio: pacote sumido, roubado, devolvido indevidamente ou parado nos Correios há muito tempo.
- Avaria: livro ou recompensa que chegou amassada, rasgada, com defeito gráfico, faltando itens ou produto trocado.
- Atraso: cliente reclamando de prazo expirado ou solicitando código de rastreamento.
- Dúvida / Suporte: cliente/apoiador com dúvida sobre endereço, entrega, recompensa ou precisando de suporte real da equipe.

EXTRAÇÃO DE DADOS:
- categoria: 'extravio' | 'avaria' | 'atraso' | 'duvida' | 'outro'
- urgencia: 'alta' (extravio/danos graves), 'media' (atraso/dúvida de entrega), 'baixa' (dúvida geral)
- precisa_abrir_pi_correios: true APENAS se houver extravio, roubo ou atraso crítico onde cabe abertura de Pedido de Informação (PI) nos Correios.
- codigo_rastreio: código no padrão Correios (ex: BR123456789BR, AA123456789BR) ou transportadora se citado no texto (ou null se não houver).
- codigo_pedido: número do pedido, ID do apoio no Catarse/Apoia.se ou referência da compra se citado (ou null se não houver).
- titulo_tarefa: Título descritivo e objetivo para o card do gestor de tarefas.
- resumo_ia: Síntese direta de 1 a 2 linhas explicando o problema do cliente para o atendente.
- motivo_decisao: Breve justificativa do porquê foi ignorado ou aprovado.

Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "ignorar": boolean,
  "motivo_decisao": string,
  "titulo_tarefa": string,
  "categoria": "extravio" | "avaria" | "atraso" | "duvida" | "outro",
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
    // Se o modelo não foi encontrado (404), tenta o próximo modelo da lista
    if (statusCode === 404 && responseText.includes("model_not_found")) {
      Logger.log(`Aviso: Modelo "${modelToTry}" não disponível na conta Groq. Tentando próximo modelo...`);
      continue;
    }

    // Se for outro erro (ex: 401 autenticação ou 429 quota), interrompe
    throw new Error(`Erro na API da Groq (${lastError})`);
  }

  throw new Error(`Nenhum modelo da Groq respondeu com sucesso. Último erro: ${lastError}`);
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

  // Se der erro de chave única (tarefa já existia para esse gmail_thread_id)
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

  // Mapear urgência para priority nativa do HUB
  let priority = "medium";
  if (analise.urgencia === "alta") {
    priority = analise.precisa_abrir_pi_correios ? "urgent" : "high";
  } else if (analise.urgencia === "baixa") {
    priority = "low";
  }

  // Gera estrutura Lexical JSON para exibição nativa no editor do TaskDrawer
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
    tags: ["pos-venda"],
    categories: ["Pós-Venda"],
    description: lexicalDesc,
    start_date: new Date().toISOString().split("T")[0]
  };
}

/**
 * Constrói o estado serializado Lexical JSON para que a descrição
 * apareça estilizada no editor rico do HUB.
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
        format: 1, // Bold
        detail: 0,
        mode: "normal",
        style: "color: #0284c7;",
        version: 1
      }
    ],
    direction: "ltr"
  });

  // Parágrafo 2: Dados do Cliente
  const metaTextos = [
    `Cliente: ${dados.remetente}`,
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

  // Parágrafo 3: Divisor e Conteúdo Original
  paragrafos.push({
    type: "paragraph",
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "text",
        text: "--- MENSAGEM ORIGINAL DO CLIENTE ---",
        format: 1,
        detail: 0,
        mode: "normal",
        style: "",
        version: 1
      }
    ],
    direction: "ltr"
  });

  // Parágrafo 4: Trecho do e-mail
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
 * Extrai e limpa o texto das mensagens de uma thread para passar à IA.
 */
function extrairCorpoMensagens(messages) {
  const partes = [];
  // Pega até as últimas 3 mensagens para entender o contexto de réplicas
  const ultimas = messages.slice(-3);

  for (let m = 0; m < ultimas.length; m++) {
    const msg = ultimas[m];
    const de = msg.getFrom();
    const data = msg.getDate().toLocaleString("pt-BR");
    let corpo = msg.getPlainBody() || "";

    // Remove citações repetidas e assinaturas comuns
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
// FUNÇÕES UTILITÁRIAS PARA O USUÁRIO (EXECUÇÃO DIRETA NO APPS SCRIPT)
// ============================================================================

/**
 * Instala o gatilho automático de tempo para rodar a cada 15 minutos.
 * Execute esta função uma vez no editor do Apps Script.
 */
function instalarGatilhoAutomatico() {
  removerGatilhos();

  ScriptApp.newTrigger("triagemEmailsPosVenda")
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log("Gatilho automático configurado com sucesso! O script rodará a cada 15 minutos.");
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
 * Testa as conexões com a Groq e com o Supabase antes de rodar o lote.
 */
function testarConexoes() {
  Logger.log("--- TESTANDO CONEXÃO COM A GROQ ---");
  const testeGroq = analisarComGroq({
    remetente: "cliente.teste@exemplo.com.br",
    assunto: "Meu livro do Catarse veio com a lombada rasgada",
    corpo: "Olá, recebi o pacote hoje pelo rastreio BR123456789BR do apoio #45892, mas o livro veio com a lombada totalmente rasgada na entrega dos Correios.",
    data: new Date().toISOString()
  });
  Logger.log("Resposta Groq: " + JSON.stringify(testeGroq, null, 2));

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
