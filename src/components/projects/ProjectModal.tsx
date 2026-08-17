import { useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { toast, Button } from '@heroui/react'
import { createProject } from '@/lib/api/projects'
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
  onCreated: (project: Project) => void
}

export default function ProjectModal({
  open,
  onOpenChange,
  onCreated,
}: ProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  function reset() {
    setName('')
    setDescription('')
    setColor(PROJECT_COLORS[0])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || null,
        color,
      })
      toast.success('Projeto criado com sucesso!')
      reset()
      onOpenChange(false)
      onCreated(project)
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível criar o projeto.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-md border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-folder-plus text-[#7b68ee] text-sm" />
            <h2 className="text-sm font-bold text-foreground">Novo Projeto / Espaço</h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
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
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que este projeto abrange?"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
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
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-md border border-border text-xs"
              onPress={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-md bg-[#7b68ee] text-xs font-semibold text-white hover:bg-[#6c5ce7]"
              isDisabled={submitting || !name.trim()}
            >
              {submitting ? 'Criando...' : 'Criar Projeto'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}