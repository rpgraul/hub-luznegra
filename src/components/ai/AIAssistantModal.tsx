import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, toast } from '@heroui/react'
import { sendAIMessage, type AIMessage } from '@/lib/api/ai'
import { supabase } from '@/lib/supabaseClient'
import type { HubDocument } from '@/types/database'
import DocumentDetailDrawer from '@/components/documents/DocumentDetailDrawer'

interface AIAssistantModalProps {
  open: boolean
  onClose: () => void
  projectId: string | null
  projectName?: string
}

const DEFAULT_SUGGESTIONS = [
  'Envie um e-mail para o Raul sobre a tarefa Revisão da LP',
  'Notificar Diego sobre o prazo da tarefa',
  'Criar tarefa "Revisar texto" com prioridade alta',
  'Listar tarefas atrasadas',
]

function MarkdownMessage({
  content,
  onOpenDoc,
}: {
  content?: string | null
  onOpenDoc?: (docId: string) => void
}) {
  if (!content || typeof content !== 'string') {
    return <div className="text-xs text-muted-foreground">Nenhuma mensagem disponível.</div>
  }

  const lines = content.split('\n')

  return (
    <div className="space-y-1.5 leading-relaxed text-xs">
      {lines.map((line, idx) => {
        const trimmed = (line || '').trim()
        if (!trimmed) {
          return <div key={idx} className="h-1" />
        }

        // Bullet list item
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-[#7b68ee] font-bold">•</span>
              <span className="flex-1">{formatInlineMarkdown(trimmed.slice(2), onOpenDoc)}</span>
            </div>
          )
        }

        // Numbered list item
        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="font-semibold text-[#7b68ee]">{numberedMatch[1]}.</span>
              <span className="flex-1">{formatInlineMarkdown(numberedMatch[2], onOpenDoc)}</span>
            </div>
          )
        }

        return <div key={idx}>{formatInlineMarkdown(line, onOpenDoc)}</div>
      })}
    </div>
  )
}

function formatInlineMarkdown(text?: string | null, onOpenDoc?: (docId: string) => void) {
  if (!text || typeof text !== 'string') return ''

  // Suporte a: Links [texto](url_ou_doc:id), Negrito **texto**, Itálico *texto*, Código `texto` e Tags #doc:...
  const regex = /(\[[^\]]+\]\([^)]+\)|\*\*.*?\*\*|\*.*?\*|`.*?`|#doc:[a-zA-Z0-9_-]+)/g
  const parts = text.split(regex)

  return parts.map((part, i) => {
    if (!part) return null

    // Markdown Link: [Label](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      const label = linkMatch[1]
      const url = linkMatch[2].trim()

      // Link para abrir documento no modal (ex: doc:UUID ou doc:slug)
      if (url.startsWith('doc:') || url.startsWith('document:')) {
        const docId = url.replace(/^(doc:|document:)/, '')
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpenDoc?.(docId)}
            title="Clique para abrir o documento e conferir os dados no modal"
            className="inline-flex items-center gap-1 mx-1 rounded-md bg-primary/10 border border-primary/25 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20 hover:border-primary/40 transition cursor-pointer shadow-2xs my-0.5 align-middle select-none"
          >
            <i className="fa-solid fa-file-lines text-[10px]" />
            <span>{label}</span>
            <i className="fa-solid fa-arrow-up-right-from-square text-[9px] opacity-75" />
          </button>
        )
      }

      // Link Web Externo/Interno
      return (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Abrir link: ${url}`}
          className="inline-flex items-center gap-1 mx-0.5 rounded px-1.5 py-0.5 text-primary hover:underline font-semibold bg-primary/5 hover:bg-primary/10 border border-primary/15 transition my-0.5 align-middle select-none"
        >
          <i className="fa-solid fa-link text-[9px]" />
          <span>{label}</span>
          <i className="fa-solid fa-arrow-up-right-from-square text-[8px] opacity-75" />
        </a>
      )
    }

    // Atalho #doc:slug
    if (part.startsWith('#doc:')) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onOpenDoc?.(part)}
          title="Clique para abrir o documento correspondente"
          className="inline-flex items-center gap-1 mx-0.5 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.2 font-mono text-[10px] font-medium text-primary hover:bg-primary/20 transition cursor-pointer my-0.5 align-middle"
        >
          <i className="fa-solid fa-folder-open text-[9px]" />
          <span>{part}</span>
        </button>
      )
    }

    // Negrito
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }

    // Itálico
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="italic text-foreground/90">
          {part.slice(1, -1)}
        </em>
      )
    }

    // Código Inline
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded border border-border bg-muted/80 px-1 py-0.5 font-mono text-[11px] font-semibold text-[#7b68ee]"
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    return part
  })
}

function createdTaskIds(result: AIMessage['actionResult']): Array<{ id: string; title?: string }> {
  if (!result || typeof result !== 'object') return []
  const out: Array<{ id: string; title?: string }> = []
  const push = (t: unknown) => {
    if (t && typeof t === 'object' && typeof (t as { id?: unknown }).id === 'string') {
      out.push({
        id: (t as { id: string }).id,
        title: typeof (t as { title?: unknown }).title === 'string'
          ? (t as { title: string }).title
          : undefined,
      })
    }
  }
  const r = result as Record<string, unknown>
  if (Array.isArray(r.tasks)) r.tasks.forEach(push)
  if (r.task) push(r.task)
  if (r.duplicatedTask) push(r.duplicatedTask)
  if (typeof r.parentTaskId === 'string') push({ id: r.parentTaskId })
  return out
}

interface ActionAssessment {
  ok: boolean
  /** Motivo legível quando `ok === false`. */
  reason?: string
}

function assessAction(response: { action?: { type: string }; actionResult?: Record<string, unknown> | null }): ActionAssessment {
  if (!response?.action || response.action.type === 'none') return { ok: false }
  const r = response.actionResult as Record<string, unknown> | null | undefined
  if (!r || typeof r !== 'object') return { ok: true }
  if (r.success === false) {
    const err = typeof r.error === 'string' && r.error ? r.error : 'falha na execução'
    return { ok: false, reason: err }
  }
  // Sucesso parcial (truncado ou com falhas) também merece aviso, não festa.
  const failed = typeof r.subtasksFailed === 'number' ? r.subtasksFailed : 0
  if (r.truncated === true) {
    return {
      ok: false,
      reason: `resposta da IA cortada pelo limite de saída${failed > 0 ? ` (${failed} subtarefa(s) não salvas)` : ' (pode estar faltando item)'}`,
    }
  }
  if (failed > 0) return { ok: false, reason: `${failed} subtarefa(s) não foram salvas` }
  if (Array.isArray(r.errors) && r.errors.length > 0) {
    const first = typeof r.errors[0] === 'string' ? r.errors[0] : 'erro ao salvar'
    return { ok: false, reason: first.slice(0, 160) }
  }
  for (const k of ['count', 'updatedCount', 'subtasksCreated']) {
    if (typeof r[k] === 'number') {
      return (r[k] as number) > 0
        ? { ok: true }
        : { ok: false, reason: 'nada foi criado/atualizado no banco de dados' }
    }
  }
  return { ok: true }
}

const CHAT_STORAGE_KEY = 'hub_ai_chat_messages_v1'

function ActionBadge({
  msg,
  onOpenTask,
}: {
  msg: AIMessage
  onOpenTask: (taskId: string) => void
}) {
  if (!msg.action || msg.action.type === 'none') return null
  const assessment = assessAction({ action: msg.action, actionResult: msg.actionResult })
  const failed = !assessment.ok
  return (
    <div
      className={`mt-2.5 rounded-lg border p-2 text-[11px] ${
        failed
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      }`}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <i className={`fa-solid text-xs ${failed ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} />
        <span>
          {failed ? 'Ação parcial/falhou' : 'Ação realizada'}: {msg.action.type}
        </span>
      </div>
      {failed && assessment.reason && (
        <p className="mt-1 leading-snug opacity-90">{assessment.reason}</p>
      )}
      {createdTaskIds(msg.actionResult).slice(0, 5).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpenTask(t.id)}
          title={t.title || 'Abrir tarefa'}
          className="mt-1.5 flex w-full items-center gap-1.5 rounded-md border border-current/20 bg-background/60 px-2 py-1 text-left text-[11px] font-semibold text-foreground transition hover:brightness-95 cursor-pointer"
        >
          <i className="fa-solid fa-arrow-up-right-from-square text-[10px] opacity-70" />
          <span className="flex-1 truncate">
            Ver: {t.title || 'tarefa criada'}
          </span>
        </button>
      ))}
    </div>
  )
}

const WELCOME_MSG: AIMessage = {
  id: 'welcome',
  role: 'assistant',
  content: `Olá! Sou o **Lorde Camarão**, assistente do Hub da Editora Luz Negra. Posso criar tarefas, quebrar em subtarefas, mudar prioridades ou gerar relatórios rápidos. Como posso ajudar?`,
}

export default function AIAssistantModal({
  open,
  onClose,
  projectId,
  projectName,
}: AIAssistantModalProps) {
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<AIMessage[]>(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {
      // ignore
    }
    return [WELCOME_MSG]
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<HubDocument | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
      } catch {
        // ignore
      }
    }
  }, [messages])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  if (!open && !drawerOpen) return null

  async function handleSend(textToSend?: string) {
    const query = (textToSend ?? input).trim()
    if (!query || loading) return

    const userMsg: AIMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: query,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-3)
        .map((m) => ({ role: m.role, content: m.content || '' }))

      const response = await sendAIMessage({
        message: query,
        history: historyPayload,
        projectId,
      })

      const replyContent =
        typeof response?.reply === 'string' && response.reply.trim()
          ? response.reply
          : response?.action?.type === 'create_project'
            ? 'Projeto criado com sucesso.'
            : response?.action?.type === 'create_task'
              ? 'Tarefa criada com sucesso.'
              : response?.action?.type === 'update_task' || response?.action?.type === 'update_tasks'
                ? 'Prazos/tarefas atualizados com sucesso.'
                : response?.action?.type === 'delete_task'
                  ? 'Tarefa excluída com sucesso.'
                  : response?.action?.type === 'create_user'
                    ? 'Usuário criado com sucesso.'
                    : 'Não foi possível encontrar as tarefas ou parâmetros informados para executar a ação.'

      const assistantMsg: AIMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: replyContent,
        action: response?.action,
        actionResult: response?.actionResult,
      }

      setMessages((prev) => [...prev, assistantMsg])

      // Invalida dados se alguma mutação ocorreu — mas só comemora sucesso real.
      if (response?.action && response.action.type !== 'none') {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] })
        void queryClient.invalidateQueries({ queryKey: ['projects'] })
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        const assessment = assessAction(response)
        // Log estruturado para diagnosticar falsos positivos/negativos.
        console.debug('[ai-assistant] action:', response.action.type, 'result:', response.actionResult)
        if (assessment.ok) {
          toast.success('Ação executada com sucesso pelo Lorde Camarão!')
        } else {
          toast.warning(
            assessment.reason
              ? `A IA não concluiu tudo: ${assessment.reason}. Veja os detalhes no chat.`
              : 'A IA não conseguiu concluir a ação — veja os detalhes no chat.',
          )
        }
      }
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Erro ao processar mensagem.',
      )
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            'Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleOpenTask(taskId: string) {
    onClose()
    // Dá tempo do modal fechar antes de abrir o drawer da tarefa
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('hub:open-task-drawer', { detail: { taskId } }),
      )
    }, 150)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function handleClear() {
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY)
    } catch {
      // ignore
    }
    setMessages([WELCOME_MSG])
  }

  async function handleOpenDoc(docIdentifier: string) {
    const cleanId = docIdentifier.replace(/^(doc:|document:)/, '').trim()
    try {
      let query = supabase.from('hub_documents').select('*')

      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)) {
        query = query.eq('id', cleanId)
      } else {
        const searchName = cleanId.replace(/^#doc:/, '').replace(/[-_]/g, ' ')
        query = query.ilike('title', `%${searchName}%`)
      }

      const { data, error } = await query.limit(1).maybeSingle()
      if (error || !data) {
        toast.danger('Documento não encontrado no Hub.')
        return
      }

      setSelectedDoc(data as HubDocument)
      setDrawerOpen(true)
    } catch {
      toast.danger('Erro ao carregar documento.')
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[540px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl transition-all duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-card/70 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-background border border-border/70 text-sm shadow-xs">
                🦐
              </div>
              <div>
                <h2 className="flex items-center gap-1.5 text-xs font-semibold leading-none">
                  <span>Lorde Camarão</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground border border-border/60">
                    Assistente IA
                  </span>
                </h2>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {projectName ? `Projeto: ${projectName}` : 'Todos os projetos'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Limpar histórico"
                onClick={handleClear}
                className="flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <i className="fa-solid fa-rotate-left text-[11px]" />
              </button>
              <button
                type="button"
                aria-label="Fechar"
                onClick={onClose}
                className="flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-muted/50 text-foreground shadow-2xs'
                  }`}
                >
                  <MarkdownMessage content={msg.content} onOpenDoc={handleOpenDoc} />

                  {/* Action Result Badge */}
                  {msg.action && msg.action.type !== 'none' && (
                    <ActionBadge msg={msg} onOpenTask={handleOpenTask} />
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex size-6 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                  <i className="fa-solid fa-sparkles animate-spin text-xs" />
                </div>
                <span className="text-[11px] animate-pulse">Pensando...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions Chips */}
          {messages.length <= 2 && (
            <div className="border-t border-border/50 bg-muted/20 px-3 py-2">
              <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                Sugestões rápidas:
              </p>
              <div className="flex flex-wrap gap-1">
                {DEFAULT_SUGGESTIONS.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => void handleSend(sug)}
                    className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Form */}
          <div className="border-t border-border bg-card/60 p-3 backdrop-blur">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSend()
              }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite uma instrução ou comando..."
                className="max-h-24 min-h-[36px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none transition focus:border-primary"
              />
              <Button
                type="submit"
                size="sm"
                isIconOnly
                isDisabled={!input.trim() || loading}
                aria-label="Enviar mensagem"
                className="size-9 rounded-xl bg-primary text-primary-foreground shadow-sm disabled:opacity-40"
              >
                <i className="fa-solid fa-arrow-up text-xs" />
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Drawer para visualização de documentos aberto diretamente a partir da IA */}
      <DocumentDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        document={selectedDoc}
      />
    </>
  )
}
