import { useEffect, useState, type FormEvent } from 'react'
import {
  Button,
  Modal,
  TextField,
  Label,
  Input,
  Select,
  ListBox,
} from '@heroui/react'
import LexicalEditor from '@/components/tasks/LexicalEditor'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { userColor } from '@/utils/colors'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/utils/status'
import type { SerializedEditorState } from 'lexical'
import type {
  Project,
  TaskPriority,
  TaskStatus,
} from '@/types/database'

const NO_ASSIGNEE = '__none__'

export interface NewTaskInput {
  title: string
  project_id: string
  status: TaskStatus
  priority: TaskPriority
  assigned_to: string | null
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  description: SerializedEditorState | null
  subtasks: string[]
}

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  initialProjectId: string | null
  initialStartDate?: string | null
  currentUserId: string
  onCreate: (input: NewTaskInput) => Promise<void>
}

export default function NewTaskModal({
  open,
  onOpenChange,
  projects,
  initialProjectId,
  initialStartDate,
  currentUserId,
  onCreate,
}: NewTaskModalProps) {
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignedTo, setAssignedTo] = useState<string>(NO_ASSIGNEE)
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [hours, setHours] = useState('')
  const [description, setDescription] =
    useState<SerializedEditorState | null>(null)
  const [subtasks, setSubtasks] = useState<string[]>([])
  const [subtaskInput, setSubtaskInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { members } = useProjectMembers(projectId || null)

  useEffect(() => {
    if (!open) return
    setProjectId(initialProjectId ?? projects[0]?.id ?? '')
    setTitle('')
    setStatus('todo')
    setPriority('medium')
    setAssignedTo(currentUserId)
    const initDate = initialStartDate ? initialStartDate.slice(0, 10) : ''
    setStartDate(initDate)
    setDueDate(initDate)
    setHours('')
    setDescription(null)
    setSubtasks([])
    setSubtaskInput('')
    setError(null)
    setSubmitting(false)
  }, [open, initialProjectId, initialStartDate, projects, currentUserId])

  function addSubtask() {
    const value = subtaskInput.trim()
    if (!value) return
    setSubtasks((prev) => [...prev, value])
    setSubtaskInput('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !projectId) {
      setError('Preencha o título e selecione um projeto.')
      return
    }
    setSubmitting(true)
    setError(null)
    const parsedHours = Number.parseFloat(hours)
    const estimated_hours =
      hours.trim() === '' || Number.isNaN(parsedHours) ? null : parsedHours
    try {
      await onCreate({
        title: title.trim(),
        project_id: projectId,
        status,
        priority,
        assigned_to: assignedTo === NO_ASSIGNEE ? null : assignedTo,
        start_date: startDate || null,
        due_date: dueDate || null,
        estimated_hours,
        description,
        subtasks,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar tarefa.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !submitting && title.trim() !== '' && projectId !== ''

  return (
    <Modal.Root isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-2xl">
          <Modal.Header>
            <Modal.Heading>Nova tarefa</Modal.Heading>
          </Modal.Header>
          <form onSubmit={handleSubmit}>
            <Modal.Body className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField.Root
                    value={title}
                    onChange={setTitle}
                    autoFocus
                    isRequired
                  >
                    <Label>Título</Label>
                    <Input placeholder="O que precisa ser feito?" />
                  </TextField.Root>
                </div>

                <Select.Root
                  selectedKey={projectId || null}
                  onSelectionChange={(value) =>
                    setProjectId(typeof value === 'string' ? value : '')
                  }
                  placeholder="Selecione o projeto"
                >
                  <Label>Projeto</Label>
                  <Select.Trigger className="w-full">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox.Root>
                      {projects.map((project) => (
                        <ListBox.Item
                          key={project.id}
                          id={project.id}
                          textValue={project.name}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            {project.name}
                          </span>
                        </ListBox.Item>
                      ))}
                    </ListBox.Root>
                  </Select.Popover>
                </Select.Root>

                <Select.Root
                  selectedKey={status}
                  onSelectionChange={(value) =>
                    setStatus((value as TaskStatus) ?? 'todo')
                  }
                >
                  <Label>Status</Label>
                  <Select.Trigger className="w-full">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox.Root>
                      {TASK_STATUSES.map((s) => (
                        <ListBox.Item key={s} id={s} textValue={STATUS_LABELS[s]}>
                          {STATUS_LABELS[s]}
                        </ListBox.Item>
                      ))}
                    </ListBox.Root>
                  </Select.Popover>
                </Select.Root>

                <Select.Root
                  selectedKey={priority}
                  onSelectionChange={(value) =>
                    setPriority((value as TaskPriority) ?? 'medium')
                  }
                >
                  <Label>Prioridade</Label>
                  <Select.Trigger className="w-full">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox.Root>
                      {TASK_PRIORITIES.map((p) => (
                        <ListBox.Item key={p} id={p} textValue={PRIORITY_LABELS[p]}>
                          {PRIORITY_LABELS[p]}
                        </ListBox.Item>
                      ))}
                    </ListBox.Root>
                  </Select.Popover>
                </Select.Root>

                <Select.Root
                  selectedKey={assignedTo}
                  onSelectionChange={(value) =>
                    setAssignedTo(typeof value === 'string' ? value : NO_ASSIGNEE)
                  }
                >
                  <Label>Responsável</Label>
                  <Select.Trigger className="w-full">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox.Root>
                      <ListBox.Item id={NO_ASSIGNEE} textValue="Sem responsável">
                        Sem responsável
                      </ListBox.Item>
                      {members.map((member) => (
                        <ListBox.Item
                          key={member.id}
                          id={member.id}
                          textValue={member.username}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                              style={{ backgroundColor: userColor(member.id) }}
                            >
                              {(member.full_name ?? member.username)
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                            {member.full_name ?? member.username}
                          </span>
                        </ListBox.Item>
                      ))}
                    </ListBox.Root>
                  </Select.Popover>
                </Select.Root>

                <TextField.Root value={hours} onChange={setHours} type="number">
                  <Label>Horas estimadas</Label>
                  <Input placeholder="Ex.: 4" />
                </TextField.Root>

                <TextField.Root
                  value={startDate}
                  onChange={setStartDate}
                  type="date"
                >
                  <Label>Início</Label>
                  <Input />
                </TextField.Root>

                <TextField.Root value={dueDate} onChange={setDueDate} type="date">
                  <Label>Conclusão</Label>
                  <Input />
                </TextField.Root>

                <div className="sm:col-span-2">
                  <Label htmlFor="new-task-description">Descrição</Label>
                  <LexicalEditor
                    initialValue={null}
                    onChange={setDescription}
                    placeholder="Descreva a tarefa…"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label>Subtarefas</Label>
                  <div className="flex gap-2">
                    <TextField.Root
                      value={subtaskInput}
                      onChange={setSubtaskInput}
                      className="flex-1"
                    >
                      <Input
                        placeholder="Nova subtarefa… (Enter para adicionar)"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addSubtask()
                          }
                        }}
                      />
                    </TextField.Root>
                    <Button
                      isIconOnly
                      onPress={addSubtask}
                      aria-label="Adicionar subtarefa"
                    >
                      <i className="fa-solid fa-plus" />
                    </Button>
                  </div>
                  {subtasks.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {subtasks.map((subtask, index) => (
                        <div
                          key={`${index}-${subtask}`}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5 text-sm"
                        >
                          <span className="min-w-0 truncate">{subtask}</span>
                          <button
                            type="button"
                            aria-label={`Remover ${subtask}`}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setSubtasks((prev) =>
                                prev.filter((_, j) => j !== index),
                              )
                            }
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="outline"
                type="button"
                onPress={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" isDisabled={!canSubmit}>
                <i className="fa-solid fa-plus mr-2" />
                {submitting ? 'Criando…' : 'Criar tarefa'}
              </Button>
            </Modal.Footer>
          </form>
          <Modal.CloseTrigger />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Root>
  )
}