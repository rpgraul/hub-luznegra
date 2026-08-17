import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, toast } from '@heroui/react'
import { sendAIMessage, type AIMessage } from '@/lib/api/ai'

interface AIAssistantModalProps {
  open: boolean
  onClose: () => void
  projectId: string | null
  projectName?: string
}

const DEFAULT_SUGGESTIONS = [
  'Criar tarefa "Revisar texto" com prioridade alta',
  'Listar tarefas atrasadas',
  'Concluir tarefas de baixa prioridade',
  'Escreva um resumo do status do projeto',
]

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split('\n')

  return (
    <div className="space-y-1.5 leading-relaxed text-xs">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={idx} className="h-1" />
        }

        // Bullet list item
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-[#7b68ee] font-bold">•</span>
              <span>{formatInlineMarkdown(trimmed.slice(2))}</span>
            </div>
          )
        }

        // Numbered list item
        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="font-semibold text-[#7b68ee]">{numberedMatch[1]}.</span>
              <span>{formatInlineMarkdown(numberedMatch[2])}</span>
            </div>
          )
        }

        return <div key={idx}>{formatInlineMarkdown(line)}</div>
      })}
    </div>
  )
}

function formatInlineMarkdown(text: string) {
  // Regex splitting by bold, italic, code
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g)

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="italic text-foreground/90">
          {part.slice(1, -1)}
        </em>
      )
    }
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

export default function AIAssistantModal({
  open,
  onClose,
  projectId,
  projectName,
}: AIAssistantModalProps) {
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Olá! Sou o **Lord Camarão**, assistente do Hub da Editora Luz Negra. Posso criar tarefas, quebrar em subtarefas, mudar prioridades ou gerar relatórios rápidos. Como posso ajudar?`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  if (!open) return null

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
        .map((m) => ({ role: m.role, content: m.content }))

      const response = await sendAIMessage({
        message: query,
        history: historyPayload,
        projectId,
      })

      const assistantMsg: AIMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        action: response.action,
        actionResult: response.actionResult,
      }

      setMessages((prev) => [...prev, assistantMsg])

      // Invalida dados se alguma mutação ocorreu
      if (response.action && response.action.type !== 'none') {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] })
        void queryClient.invalidateQueries({ queryKey: ['projects'] })
        toast.success('Ação executada com sucesso pelo Lord Camarão!')
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

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function handleClear() {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Histórico limpo. Como posso ajudar agora?`,
      },
    ])
  }

  return (
    <div className="fixed bottom-20 right-6 z-50 flex h-[540px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-xs">
            <i className="fa-solid fa-wand-magic-sparkles text-xs" />
          </div>
          <div>
            <h2 className="flex items-center gap-1.5 text-xs font-semibold leading-none">
              <span>Lord Camarão</span>
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
              <MarkdownMessage content={msg.content} />

              {/* Action Result Badge */}
              {msg.action && msg.action.type !== 'none' && (
                <div className="mt-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <div className="flex items-center gap-1.5 font-medium">
                    <i className="fa-solid fa-circle-check text-xs" />
                    <span>Ação realizada: {msg.action.type}</span>
                  </div>
                </div>
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
  )
}
