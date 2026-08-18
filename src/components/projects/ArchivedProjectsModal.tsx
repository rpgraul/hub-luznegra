import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast, Button } from '@heroui/react'
import { listArchivedProjects, unarchiveProject } from '@/lib/api/projects'
import type { Project } from '@/types/database'

interface ArchivedProjectsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestored?: (project: Project) => void
}

export default function ArchivedProjectsModal({
  open,
  onOpenChange,
  onRestored,
}: ArchivedProjectsModalProps) {
  const queryClient = useQueryClient()
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const { data: archivedProjects = [], isLoading } = useQuery({
    queryKey: ['projects', 'archived'],
    queryFn: listArchivedProjects,
    enabled: open,
  })

  if (!open) return null

  async function handleUnarchive(p: Project) {
    setRestoringId(p.id)
    try {
      await unarchiveProject(p.id)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['projects', 'archived'] })
      toast.success(`Projeto "${p.name}" desarquivado com sucesso!`)
      onRestored?.(p)
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Erro ao desarquivar o projeto.',
      )
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <i className="fa-solid fa-box-archive text-xs" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Projetos Arquivados</h2>
              <p className="text-[11px] text-muted-foreground">Restaure projetos para voltarem ao painel</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[380px] overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
              <i className="fa-solid fa-circle-notch fa-spin text-lg mb-2 text-primary" />
              <span>Carregando projetos arquivados...</span>
            </div>
          ) : archivedProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted/60 mb-2">
                <i className="fa-solid fa-folder-open text-base text-muted-foreground/60" />
              </div>
              <span className="font-semibold text-foreground">Nenhum projeto arquivado</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Projetos arquivados aparecerão aqui para restauração.
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {archivedProjects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3.5 transition hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="size-3.5 shrink-0 rounded-full shadow-2xs"
                      style={{ backgroundColor: p.color || '#7b68ee' }}
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-xs text-foreground block truncate">
                        {p.name}
                      </span>
                      {p.description && (
                        <span className="text-[11px] text-muted-foreground block truncate">
                          {p.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={restoringId === p.id}
                    onClick={() => void handleUnarchive(p)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground shadow-2xs cursor-pointer disabled:opacity-60"
                  >
                    {restoringId === p.id ? (
                      <>
                        <i className="fa-solid fa-circle-notch fa-spin text-[10px]" />
                        <span>Restaurando...</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-arrow-rotate-left text-[10px]" />
                        <span>Desarquivar</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border bg-card px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border border-border text-xs cursor-pointer shadow-2xs"
            onPress={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  )
}
