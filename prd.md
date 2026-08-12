# PRD DEFINITIVO – HUB (Editora Luz Negra)

**Subdomínio:** `hub.site-da-empresa.com.br`  
**Empresa:** Editora Luz Negra  
**Objetivo:** Substituir a experiência do ClickUp (Gantt, Kanban, Lista, Calendário + IA) com uma ferramenta auto-hospedada, ultrarrápida, com foco em usabilidade, zero custo de infraestrutura e gerenciamento de contas centralizado.

---

## 1. VISÃO GERAL

O **Hub** é uma ferramenta de gestão de tarefas para equipes pequenas (até 50 usuários), onde o administrador geral cria e gerencia todas as contas. A experiência é **centrada no usuário**:

- **Login**: aceita **username** (apelido) ou **e-mail** + senha, com opção "Manter logado" (refresh token).
- **Tela inicial**: ao entrar, o usuário vê imediatamente a visualização **Gantt** (padrão) com **suas tarefas** (atribuídas a ele), mas pode alternar para Kanban, Lista ou Calendário. O modo de visualização e o projeto ativo são **persistentes por usuário** (salvos em preferências).
- **Navegação**: barra superior fixa com logo, seletor de projeto, botões de visualização, sino de notificações e avatar do usuário (dropdown para perfil, férias, sair).
- **Detalhe da tarefa**: abre um **slide lateral (drawer) vindo da direita**, que **não cobre completamente a lista** – a lista fica visível atrás (com leve escurecimento) para que o usuário possa clicar em outra tarefa e trocar o conteúdo do slide instantaneamente (substituição sem fechar).
- **Auto-save**: qualquer alteração (título, datas, arrastar no Gantt/Kanban, edição de texto) é salva **automaticamente** no banco, sem necessidade de botão "Salvar". Apenas ações destrutivas (excluir tarefa, arquivar projeto) exigem confirmação em modal.
- **Mobile**: a interface se adapta com um layout simplificado; no celular, o slide ocupa 100% da largura com botão de fechar (X) no canto.

---

## 2. STACK TECNOLÓGICA (DEFINITIVA)

Camada

Tecnologia

Versão / Detalhe

**Frontend**

React 19 + Vite + TypeScript

Compilador React (novo) para UI reativa.

**UI/Estilização**

Tailwind CSS + shadcn/ui

Componentes acessíveis e customizáveis.

**Ícones**

FontAwesome (CDN)

Conjunto completo, sem emojis.

**Estado / Cache**

TanStack Query v5

Sincronização em background e atualizações otimistas.

**Backend / Auth / Banco**

Supabase (PostgreSQL)

Autenticação, RLS, Realtime.

**Edge Functions**

Supabase Edge Functions (Deno)

IA, e-mails e triggers programáticos.

**Hospedagem Frontend**

Cloudflare Pages

Deploy via Git, CDN global.

**Gantt Chart**

**Frappe Gantt** (v0.6.1+)

Leve, SVG, suporte a drag com callbacks.

**Kanban (Drag & Drop)**

**@hello-pangea/dnd**

Sucessor do react-beautiful-dnd, compatível com React 19.

**Calendário**

**react-big-calendar**

Com localização pt-BR, suporte a arrastar eventos.

**Editor de Texto**

**Lexical** (Meta)

Core leve, serialização JSON.

**Requisições HTTP**

**axios**

Interceptadores para tokens.

**E-mail**

**Resend** + Supabase Edge

Tier gratuito (100 emails/dia).

**IA**

API DeepSeek (via OpenAI SDK)

Edge Function centralizada.

---

## 3. ARQUITETURA DE BANCO DE DADOS (SUPABASE / POSTGRES)

### Tabelas

sql

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- 1. Perfis (estende auth.users)
CREATE TABLE public.profiles (
id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
username TEXT UNIQUE NOT NULL, -- apelido para login
full_name TEXT,
avatar_url TEXT,
role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
ferias_inicio DATE,
ferias_fim DATE,
created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 2. Preferências do usuário (persistência de visualização)
CREATE TABLE public.user_preferences (
user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
default_view TEXT DEFAULT 'gantt' CHECK (default_view IN ('gantt', 'kanban', 'lista', 'calendario')),
active_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 3. Projetos
CREATE TABLE public.projects (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
name TEXT NOT NULL,
description TEXT,
color TEXT DEFAULT '#3B82F6',
owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
archived BOOLEAN DEFAULT FALSE,
created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 4. Tarefas (hierárquica)
CREATE TABLE public.tasks (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
title TEXT NOT NULL,
description JSONB, -- estado serializado do Lexical
project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
parent_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE, -- NULL = raiz
status TEXT DEFAULT 'todo' CHECK (status IN ('backlog','todo','in_progress','review','done')),
priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
start_date DATE,
due_date DATE,
estimated_hours NUMERIC(5,2),
actual_hours NUMERIC(5,2),
order_index INTEGER DEFAULT 0, -- ordenação manual
assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 5. Comentários / Atividades
CREATE TABLE public.task_comments (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
content TEXT NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 6. Notificações (in-app)
CREATE TABLE public.notifications (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
type TEXT CHECK (type IN ('task_assigned', 'due_date_reminder', 'mention')),
content TEXT NOT NULL,
link TEXT, -- URL para a tarefa (ex: /task/{id})
read BOOLEAN DEFAULT FALSE,
created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Índices para performance
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_notifications_user_id_read ON notifications(user_id, read);
-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

### RLS (Políticas de Segurança)

- **Profiles**: cada usuário só pode ver/editar seu próprio perfil, exceto admin que pode ver todos e criar novos (via função).
- **Projects**: usuários podem ver apenas projetos onde são `owner_id` ou onde tenham pelo menos uma tarefa atribuída (ou todos se admin).
- **Tasks**: similar a projetos.
- **Notificações**: apenas o próprio usuário pode ver as suas.

**Política exemplo para tasks:**

sql

CREATE POLICY "Usuários podem ver tarefas dos projetos que participam"
ON tasks FOR SELECT USING (
project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid() OR auth.uid() IN (SELECT assigned_to FROM tasks WHERE project_id = projects.id))
);

---

## 4. ESTRUTURA DE TELAS E FLUXOS DE NAVEGAÇÃO

### 4.1. Tela de Login

- Campos: **Username ou E-mail** + **Senha**.
- Checkbox "Manter logado" (ativa refresh token com validade estendida).
- Botão "Entrar".
- Não há link para "Criar conta" – apenas o admin cria contas internamente.

### 4.2. Tela Principal (Dashboard)

**Layout fixo:**

- **Barra superior** (altura 64px):
  - **Esquerda**: Logo "Hub" (clique → tela inicial).
  - **Centro**: Seletor de projeto (dropdown com todos os projetos disponíveis). O projeto selecionado é salvo em `user_preferences.active_project_id`.
  - **Direita**: Botões de visualização (ícones: Gantt, Kanban, Lista, Calendário) – o selecionado persiste em `user_preferences.default_view`.
    - Sino de notificações (badge com contagem).
    - Avatar do usuário (clique → dropdown com: Perfil, Férias, Sair).

- **Área de conteúdo** (abaixo da barra):
  - **Lista/Gantt/Kanban/Calendário** ocupa 100% da largura.
  - As tarefas exibidas são **apenas as do projeto ativo** e **atribuídas ao usuário logado** (filtro "Minhas Tarefas"). O filtro é fixo no MVP (não há opção de ver todas as tarefas do projeto).

- **Drawer (slide lateral)**:
  - Ao clicar em uma tarefa (em qualquer visualização), abre-se um painel vindo da direita, ocupando **~60% da largura** em desktop (100% no mobile).
  - O fundo da lista atrás fica levemente escurecido (opacidade 70%), mas ainda visível.
  - O usuário pode clicar em outra tarefa na lista (atrás) e o drawer **troca instantaneamente** o conteúdo para a nova tarefa, sem fechar e reabrir.
  - No canto superior direito do drawer: botão "X" para fechar.
  - Conteúdo do drawer: título (editável inline), descrição (editor Lexical), campos: responsável (dropdown com membros do projeto), status (dropdown com pills coloridas), prioridade, datas (start/due), horas estimadas/realizadas, subtarefas (lista com checkboxes), comentários (feed).

### 4.3. Navegação entre visualizações

- **Gantt**: exibe as tarefas raiz (parent_id IS NULL) do projeto atual, com barras coloridas conforme o responsável. Arrastar barras atualiza start/due_date. Duplo clique abre o drawer.
- **Kanban**: colunas fixas (Backlog, A Fazer, Em Andamento, Revisão, Concluído). Arrastar cards entre colunas atualiza status. Clique no card abre drawer.
- **Lista**: tabela com colunas: Título, Responsável, Status (pill), Prioridade, Vencimento, Subtarefas (contagem). Clique na linha abre drawer. Checkbox para selecionar múltiplas tarefas (ações em lote via IA ou botão "Concluir selecionadas").
- **Calendário**: visão mensal/semanal com tarefas que têm start_date e due_date. Arrastar eventos recalcula datas. Clique abre drawer.

---

## 5. FUNCIONALIDADES DETALHADAS

### 5.1. Gerenciamento de Contas (Admin)

- Apenas usuários com `role = 'admin'` veem um item no dropdown "Gerenciar Usuários" (acesso a uma página/modal).
- Nessa tela, admin pode:
  - **Criar** novo usuário: informar username, e-mail, nome completo, senha temporária (o sistema envia e-mail de boas-vindas com link para definir senha? Ou o admin define e o usuário troca depois).
  - **Listar** todos os usuários com opções de editar (nome, foto, senha, papel) e **desativar** (revogar acesso).
  - **Atribuir projetos** diretamente (mas no MVP, o admin é owner de todos os projetos e pode designar tarefas).

- A criação de conta no Supabase é feita via Admin API (ou Edge Function com permissão de admin).

### 5.2. Perfil do Usuário

- Acessível pelo avatar (dropdown) → "Perfil".
- Modal com:
  - **Nome completo** (editável)
  - **Foto**: upload para Supabase Storage (bucket `avatars`) com política pública.
  - **Senha**: campos "Nova senha" e "Confirmar senha" (troca via Supabase Auth).
  - **Férias**: dois campos date (início e fim). Ao salvar, o sistema verifica se há tarefas atribuídas a esse usuário no período e exibe um alerta (não bloqueia, apenas avisa).

### 5.3. Cores e Identidade Visual

- **Cor do usuário**: gerada deterministicamente a partir do `user_id` (ex: HSL) e aplicada como **background da linha/task** com 15% de opacidade. A cor plena é usada no avatar e em badges.
- **Status (pills)**:
  - Backlog → cinza (`#6B7280`)
  - A Fazer → azul (`#3B82F6`)
  - Em Andamento → amarelo (`#F59E0B`)
  - Revisão → roxo (`#8B5CF6`)
  - Concluído → verde (`#10B981`)

- **Prioridade** (ícone pequeno): baixa (↓), média (–), alta (↑), urgente (‼️).

### 5.4. Editor de Texto (Lexical)

- Integrado no drawer, com barra de ferramentas minimalista: negrito, itálico, sublinhado, lista ordenada/não ordenada, link.
- O conteúdo é salvo como JSON no campo `tasks.description`.

### 5.5. Notificações (In-App + E-mail)

- **Gatilhos**:
  1.  Tarefa atribuída a você (assigned_to mudou para você).
  2.  Prazo de vencimento se aproxima (24h antes, via job agendado).
  3.  Menção em comentário (ex: "@joao" no conteúdo).

- **In-App**: ícone de sino na barra superior com badge de não lidas. Clicar abre um dropdown com as últimas 10 notificações (ordenadas por data). Cada notificação tem link que abre a tarefa correspondente (fecha o dropdown e abre o drawer).
- **E-mail**: enviado via Edge Function + Resend para os mesmos eventos, com modelo HTML simples (para não depender de rich text no e-mail). O e-mail contém link direto para a tarefa (via subdomínio).

### 5.6. Integração com IA (DeepSeek)

- **Acesso**: ícone de "Assistente IA" flutuante no canto inferior direito (estilo chat). Ao clicar, abre um modal com input de texto e histórico da conversa.
- **Comandos suportados** (processados pela Edge Function):
  - `Crie uma tarefa chamada "..." no projeto atual com prioridade alta e responsável @joao`
  - `Duplique a tarefa "Revisar contrato" mudando o responsável para @maria e vencimento para 2026-08-25`
  - `Quebre a tarefa X em subtarefas` (a IA sugere divisão e cria as subtarefas).
  - `Liste todas as minhas tarefas atrasadas` (consulta banco e retorna lista formatada).
  - `Escreva um e-mail para o cliente sobre o status do projeto Y` (gera rascunho com base nos dados).
  - `Marque como concluídas todas as tarefas com prioridade baixa do projeto atual` (ação em lote).

- **Prompt System** (já definido no PRD anterior) – será refinado para incluir contexto do projeto e usuário.
- **Resultado**: a IA retorna um JSON com a ação a ser executada, e a Edge Function a executa no banco, devolvendo o resultado para o frontend (que atualiza a UI via invalidação de queries).

### 5.7. Subtarefas

- No drawer, seção "Subtarefas" com lista de tasks cujo `parent_id` é a tarefa atual.
- Cada subtarefa tem checkbox (marcar concluída alterna status para 'done'), título editável e responsável (herdado da tarefa pai por padrão).
- Subtarefas podem ser criadas rapidamente com um campo "Adicionar subtarefa..." (ao pressionar Enter, cria-se uma nova task com parent_id).

---

## 6. REGRAS DE NEGÓCIO E VALIDAÇÕES

- **Username**: único, case-insensitive, sem espaços, mínimo 3 caracteres.
- **Datas**: start_date deve ser <= due_date (validação no frontend e backend).
- **Exclusão de tarefa**: só pode ser excluída se não tiver subtarefas (ou confirmação em cascata). Ao excluir, todas as subtarefas são excluídas (cascade).
- **Alteração de status**: ao mover uma tarefa para 'done', todas as subtarefas também são marcadas como 'done' (automaticamente).
- **Férias**: ao salvar férias, o sistema verifica se há tarefas atribuídas ao usuário no período e exibe modal de alerta com a lista, mas não impede o salvamento.
- **Cores de usuário**: calculadas via função hash (ex: `hsl(${hash(user_id) % 360}, 70%, 50%)`) para consistência.

---

## 7. SEGURANÇA E PERFORMANCE

- **Autenticação**: Supabase Auth com refresh token. Token JWT armazenado em cookie seguro (HttpOnly) ou localStorage (com cuidado). Preferência: cookie para maior segurança.
- **RLS**: todas as tabelas com políticas restritivas.
- **Otimismo**: todas as mutações usam `onMutate` do TanStack Query para atualização instantânea da UI, com rollback em caso de erro.
- **Cache**: as listas de tarefas são cacheadas por projeto e usuário, com invalidação automática após mutações.
- **Lazy loading**: o drawer só carrega os dados completos da tarefa quando aberto (evita overfetching na lista).
- **Mobile-first**: grid responsivo, com breakpoints Tailwind.

---

## 8. PLANO DE IMPLEMENTAÇÃO (MVP – 6 SEMANAS)

Semana

Entregas

**1**

Setup do projeto (React + Vite + Tailwind + shadcn), configuração do Supabase (auth, RLS, buckets), modelo de banco criado. Tela de login com autenticação.

**2**

CRUD de projetos e tarefas (apenas lista). Implementar seletor de projeto e persistência de preferências. Tela de perfil (edição de nome, foto, senha).

**3**

Kanban (com @hello-pangea/dnd) e Lista (tabela shadcn). Drawer lateral para edição de tarefa (com campos básicos e Lexical). Auto-save.

**4**

Gantt (Frappe Gantt) com drag na timeline e Calendário (react-big-calendar). Integrar cores de usuário e status.

**5**

Notificações in-app (sino) e e-mails (Resend). Gerenciamento de contas (admin). Férias e alertas.

**6**

Integração com IA (Edge Function + DeepSeek). Testes de performance, ajustes de mobile e deploy final em Cloudflare Pages.

---

## 9. CASOS DE USO (EXEMPLOS)

**Fluxo 1 – Criar tarefa via IA:**

- Usuário abre assistente IA e digita: "Crie uma tarefa 'Revisar capítulo 3' com prioridade alta, responsável @joao, vencimento 2026-09-01".
- A Edge Function interpreta, cria a task e retorna sucesso. A lista é atualizada automaticamente.

**Fluxo 2 – Gerenciar férias:**

- Admin abre perfil, define férias de 01/09 a 15/09. Ao salvar, o sistema alerta: "Você tem 3 tarefas atribuídas no período: Tarefa A, B, C. Deseja reassigná-las?" (apenas alerta, mas não bloqueia).

**Fluxo 3 – Trabalhar no Gantt:**

- Usuário arrasta a barra de uma tarefa para a direita, mudando a data de término. A callback `on_task_update` chama a mutation e a UI reflete instantaneamente. O drawer permanece aberto se estiver visualizando a tarefa
