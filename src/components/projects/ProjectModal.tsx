import { useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { toast, Button, Modal, TextField, Label, Input, TextArea } from '@heroui/react'
import { createProject } from '@/lib/api/projects'
import type { Project } from '@/types/database'

const PROJECT_COLORS = [
  '#6366F1',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
  '#F97316',
  '#64748B',
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
        name,
        description,
        color,
      })
      toast.success('Projeto criado.')
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
    <Modal.Root isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.Header>
            <Modal.Heading>Novo Projeto</Modal.Heading>
            <p className="text-sm text-muted-foreground">
              Crie um projeto para organizar as tarefas da equipe.
            </p>
          </Modal.Header>
          <Modal.Body>
            <form id="project-form" onSubmit={handleSubmit} className="space-y-4">
              <TextField.Root value={name} onChange={setName} isRequired>
                <Label>Nome</Label>
                <Input placeholder="ex: Catálogo 2026" />
              </TextField.Root>

              <TextField.Root value={description} onChange={setDescription}>
                <Label>Descrição</Label>
                <TextArea
                  placeholder="O que este projeto envolve?"
                  rows={3}
                />
              </TextField.Root>

              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Cor ${c}`}
                      aria-pressed={color === c}
                      className={`flex size-7 items-center justify-center rounded-full transition-transform ${
                        color === c ? 'scale-110 ring-2 ring-ring ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {color === c && <Check className="size-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline" onPress={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="project-form" isDisabled={submitting}>
              {submitting ? 'Criando...' : 'Criar projeto'}
            </Button>
          </Modal.Footer>
          <Modal.CloseTrigger />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Root>
  )
}