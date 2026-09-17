import { useEffect, useRef, useState } from 'react'
import { Button, Modal, toast } from '@heroui/react'
import { useTaskComments } from '@/hooks/useTaskComments'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { userColor } from '@/utils/colors'
import { formatDateTime } from '@/utils/format'

interface TaskCommentsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string | null
  taskTitle: string
  projectId: string | null
  currentUserId: string
}

/**
 * Bate-papo de comentários da tarefa: ordem cronológica, foto + nome,
 * campo fixo embaixo para comentar (Enter envia, Shift+Enter quebra linha).
 */
export default function TaskCommentsModal({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  projectId,
  currentUserId,
}: TaskCommentsModalProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Só busca com o modal aberto.
  const comments = useTaskComments(open ? taskId : null)
  const { members } = useProjectMembers(projectId)

  useEffect(() => {
    if (!open) return
    setDraft('')
    setSending(false)
  }, [open, taskId ])

  // Sempre mostra a última mensagem (abriu ou chegou mensagem nova).
  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
    })
  }, [open, comments.comments.length])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [open])

  async function handleSend() {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    try {
      await comments.addComment(content)
      setDraft('')
      inputRef.current?.focus()
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível enviar o comentário.',
      )
    } finally {
      setSending(false)
    }
  }

  const total = comments.comments.length

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
          <Modal.Header className="shrink-0 border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#7b68ee]/10">
                <i className="fa-regular fa-comments text-sm text-[#7b68ee]" />
              </div>
              <div className="min-w-0">
                <Modal.Heading className="truncate text-base font-bold">
                  Conversa da tarefa
                </Modal.Heading>
                <p className="truncate text-xs text-muted-foreground">
                  {taskTitle}
                  {total > 0 && (
                    <span className="ml-1.5 font-semibold">
                      · {total} comentário{total !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </Modal.Header>

          <Modal.Body className="min-h-0 flex-1 overflow-hidden py-4">
            <div
              ref={scrollRef}
              className="max-h-[50vh] min-h-40 space-y-3 overflow-y-auto pr-1"
            >
              {comments.isLoading && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Carregando conversa…
                </p>
              )}
              {!comments.isLoading && total === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum comentário ainda. Comece a conversa abaixo.
                </p>
              )}
              {comments.comments.map((comment) => {
                const isMine = comment.author_id === currentUserId
                const member = members.find((m) => m.id === comment.author_id)
                const name =
                  member?.full_name ?? member?.username ?? 'Usuário'
                const initials = name.slice(0, 2).toUpperCase()
                return (
                  <div
                    key={comment.id}
                    className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}
                  >
                    {member?.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={name}
                        title={name}
                        className="size-7 shrink-0 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <span
                        title={name}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: userColor(comment.author_id) }}
                      >
                        {initials}
                      </span>
                    )}
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 shadow-2xs ${
                        isMine
                          ? 'rounded-tr-sm bg-[#7b68ee]/15'
                          : 'rounded-tl-sm border border-border bg-muted/40'
                      }`}
                    >
                      <div className="mb-0.5 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[11px] font-bold text-foreground">
                          {isMine ? 'Você' : name}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatDateTime(comment.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                        {comment.content}
                      </p>
                      {isMine && (
                        <div className="mt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              void comments
                                .deleteComment(comment.id)
                                .catch(() =>
                                  toast.danger(
                                    'Não foi possível excluir o comentário.',
                                  ),
                                )
                            }
                            className="cursor-pointer text-[10px] text-muted-foreground transition hover:text-red-600"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Modal.Body>

          <Modal.Footer className="shrink-0 border-t border-border pt-3">
            <div className="flex w-full items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
                placeholder="Escreva um comentário… (Enter envia)"
                rows={2}
                className="max-h-28 min-h-10 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none"
              />
              <Button
                size="sm"
                variant="primary"
                className="shrink-0 rounded-xl bg-[#7b68ee] px-4 text-xs font-semibold text-white hover:bg-[#6c5ce7]"
                onPress={() => void handleSend()}
                isDisabled={!draft.trim() || sending}
              >
                <i className={`fa-solid ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'} mr-1.5`} />
                {sending ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
          </Modal.Footer>
          <Modal.CloseTrigger />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
