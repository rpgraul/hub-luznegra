import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@heroui/react'
import {
  listTrashTasks,
  restoreTask,
  hardDeleteTask,
  emptyTrash,
} from '@/lib/api/tasks'
import type { Project, Task } from '@/types/database'

interface TrashModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects?: Project[]
}

export default function TrashModal({
  open,
  onOpenChange,
  projects = [],
}: TrashModalProps) {
  const queryClient = useQueryClient()
  const [actingId, setActingId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const { data: trashTasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'trash'],
    queryFn: listTrashTasks,
    enabled: open,
  })

  if (!open) return null

  const projectMap = new Map((projects ?? []).map((p) => [p.id, p]))

  async function handleRestore(t: Task) {
    setActingId(t.id)
    try {
      const res = await restoreTask(t.id)
      if (res.error) throw new Error(res.error)

      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'trash'] })
      toast.success(`Tarefa "${t.title}" restaurada com sucesso!`)
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Erro ao restaurar a tarefa.',
      )
    } finally {
      setActingId(null)
    }
  }

  async function handleHardDelete(t: Task) {
    setActingId(t.id)
    try {
      const res = await hardDeleteTask(t.id)
      if (res.error) throw new Error(res.error)

      void queryClient.invalidateQueries({ queryKey: ['tasks', 'trash'] })
      toast.success('Tarefa excluída definitivamente.')
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Erro ao excluir a tarefa.',
      )
    } finally {
      setActingId(null)
    }
  }

  async function handleEmptyTrash() {
    setClearing(true)
    try {
      const res = await emptyTrash()
      if (res.error) throw new Error(res.error)

      void queryClient.invalidateQueries({ queryKey: ['tasks', 'trash'] })
      toast.success('Lixeira esvaziada com sucesso.')
      setConfirmEmpty(false)
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Erro ao esvaziar a lixeira.',
      )
    } finally {
      setClearing(false)
    }
  }

  function formatDeletedDate(dateStr?: string | null) {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600">
              <i className="fa-solid fa-trash-can text-xs" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Lixeira de Tarefas</h2>
              <p className="text-[11px] text-muted-foreground">
                Recupere tarefas excluídas ou apague-as permanentemente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {trashTasks.length > 0 && (
              <>
                {confirmEmpty ? (
                  <div className="flex items-center gap-1.5 animate-in fade-in">
                    <span className="text-[11px] font-semibold text-rose-500">
                      Confirmar?
                    </span>
                    <button
                      type="button"
                      disabled={clearing}
                      onClick={() => void handleEmptyTrash()}
                      className="flex h-7 items-center justify-center rounded-md bg-rose-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-rose-700 cursor-pointer disabled:opacity-60"
                    >
                      {clearing ? (
                        <>
                          <i className="fa-solid fa-circle-notch fa-spin mr-1 text-[10px]" />
                          Esvaziando...
                        </>
                      ) : (
                        'Sim, esvaziar'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmEmpty(false)}
                      className="flex h-7 items-center justify-center rounded-md border border-border px-2 text-[11px] font-medium text-foreground transition hover:bg-muted cursor-pointer"
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmEmpty(true)}
                    className="flex h-7 items-center gap-1 rounded-md border border-rose-500/30 px-2 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-500/10 cursor-pointer shadow-2xs"
                  >
                    <i className="fa-solid fa-trash-can text-[10px]" />
                    <span>Esvaziar lixeira</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
              <i className="fa-solid fa-circle-notch fa-spin text-lg mb-2 text-primary" />
              <span>Carregando lixeira...</span>
            </div>
          ) : trashTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted/60 mb-2">
                <i className="fa-solid fa-trash-can text-base text-muted-foreground/60" />
              </div>
              <span className="font-semibold text-foreground">A lixeira está vazia</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Tarefas apagadas aparecerão aqui e podem ser recuperadas a qualquer momento.
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {trashTasks.map((t) => {
                const proj = t.project_id ? projectMap.get(t.project_id) : null
                const isOperating = actingId === t.id
                const deletedDate = formatDeletedDate(t.deleted_at)

                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3 transition hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background border border-border text-muted-foreground">
                        <i className="fa-solid fa-check text-xs" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-foreground truncate">
                          {t.title}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {proj ? (
                            <span className="flex items-center gap-1 font-medium">
                              <span
                                className="size-1.5 rounded-full"
                                style={{ backgroundColor: proj.color || '#3b82f6' }}
                              />
                              <span className="truncate max-w-[120px]">{proj.name}</span>
                            </span>
                          ) : (
                            <span>Sem projeto</span>
                          )}
                          {deletedDate && (
                            <>
                              <span>•</span>
                              <span>Apagada em {deletedDate}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isOperating}
                        onClick={() => void handleRestore(t)}
                        className="flex h-7 items-center gap-1 rounded-md border border-emerald-500/30 px-2.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500/10 cursor-pointer shadow-2xs disabled:opacity-60"
                      >
                        {isOperating && actingId === t.id ? (
                          <i className="fa-solid fa-circle-notch fa-spin text-[10px]" />
                        ) : (
                          <i className="fa-solid fa-rotate-left text-[10px]" />
                        )}
                        <span>Restaurar</span>
                      </button>
                      <button
                        type="button"
                        disabled={isOperating}
                        onClick={() => void handleHardDelete(t)}
                        aria-label="Excluir permanentemente"
                        title="Excluir permanentemente"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-600 cursor-pointer disabled:opacity-60"
                      >
                        <i className="fa-solid fa-xmark text-xs" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
