import { useEffect, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { toast, Button } from '@heroui/react'
import { createProject, updateProject, archiveProject } from '@/lib/api/projects'
import type { Project } from '@/types/database'

const PROJECT_COLORS = [
  '#7b68ee',
  '#3b82f6',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
]

interface ProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
  onSaved: (project: Project) => void
  onDeleted?: (projectId: string) => void
}

export default function ProjectModal({
  open,
  onOpenChange,
  project,
  onSaved,
  onDeleted,
}: ProjectModalProps) {
  const isEditing = !!project
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [submitting, setSubmitting] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (open) {
      if (project) {
        setName(project.name)
        setDescription(project.description ?? '')
        setColor(project.color || PROJECT_COLORS[0])
      } else {
        setName('')
        setDescription('')
        setColor(PROJECT_COLORS[0])
      }
      setConfirmArchive(false)
    }
  }, [open, project])

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      if (isEditing && project) {
        const updated = await updateProject({
          id: project.id,
          name: name.trim(),
          description: description.trim() || null,
          color,
        })
        toast.success('Projeto atualizado com sucesso!')
        onOpenChange(false)
        onSaved(updated)
      } else {
        const created = await createProject({
          name: name.trim(),
          description: description.trim() || null,
          color,
        })
        toast.success('Projeto criado com sucesso!')
        onOpenChange(false)
        onSaved(created)
      }
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível salvar o projeto.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleArchive() {
    if (!project) return
    setArchiving(true)
    try {
      await archiveProject(project.id)
      toast.success('Projeto arquivado com sucesso.')
      setConfirmArchive(false)
      onOpenChange(false)
      onDeleted?.(project.id)
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível arquivar o projeto.',
      )
    } finally {
      setArchiving(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
        onClick={() => onOpenChange(false)}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card">
            <div className="flex items-center gap-2">
              <div
                className="flex size-7 items-center justify-center rounded-lg shadow-2xs"
                style={{ backgroundColor: `${color}20`, color }}
              >
                <i className={`fa-solid ${isEditing ? 'fa-folder-open' : 'fa-folder-plus'} text-xs`} />
              </div>
              <h2 className="text-sm font-bold text-foreground">
                {isEditing ? 'Editar Espaço / Projeto' : 'Novo Espaço / Projeto'}
              </h2>
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

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nome do Projeto *</label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Catálogo 2026, Marketing, Editorial..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="O que este projeto abrange?"
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Cor do Projeto</label>
              <div className="flex flex-wrap items-center gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Cor ${c}`}
                    className={`flex size-7 cursor-pointer items-center justify-center rounded-full transition-transform ${
                      color === c ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {color === c && <Check className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              {isEditing ? (
                <button
                  type="button"
                  onClick={() => setConfirmArchive(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
                >
                  <i className="fa-solid fa-box-archive text-xs" />
                  <span>Arquivar</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg border border-border text-xs cursor-pointer shadow-2xs"
                  onPress={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-lg bg-primary text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 cursor-pointer"
                  isDisabled={submitting || !name.trim()}
                >
                  {submitting ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Projeto'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmação de Arquivamento */}
      {confirmArchive && project && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => !archiving && setConfirmArchive(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-500">
              <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10">
                <i className="fa-solid fa-box-archive text-lg" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Arquivar Projeto?</h3>
                <p className="text-xs text-muted-foreground">{project.name}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              O projeto deixará de aparecer na lista lateral. Suas tarefas permanecerão salvas no histórico.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={archiving}
                onClick={() => setConfirmArchive(false)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={() => void handleArchive()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition shadow-xs disabled:opacity-60 cursor-pointer"
              >
                {archiving ? 'Arquivando...' : 'Sim, Arquivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}