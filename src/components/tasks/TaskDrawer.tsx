import { useEffect, useRef, useState } from 'react'
import {
  toast,
  Button,
  Label,
  Checkbox,
  Separator,
  Select,
  ListBox,
  AlertDialog,
} from '@heroui/react'
import LexicalEditor from '@/components/tasks/LexicalEditor'
import { useTaskComments } from '@/hooks/useTaskComments'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { userColor } from '@/utils/colors'
import { formatDateTime, todayIso } from '@/utils/format'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/utils/status'
import type { SerializedEditorState } from 'lexical'
import type { Project, Task, TaskPriority, TaskStatus, Json } from '@/types/database'

interface TaskDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
  projectId: string | null
  projects: Project[]
  creator: {
    currentUserId: string
    createTask: (input: {
      title: string
      project_id: string
      parent_id?: string | null
      assigned_to?: string | null
      assignees?: string[] | null
      status?: TaskStatus
      start_date?: string | null
      due_date?: string | null
      description?: Json | null
      tags?: string[] | null
    }) => Promise<Task>
    updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
    deleteTask: (id: string) => Promise<unknown>
    moveTaskStatus: (args: { id: string; status: TaskStatus }) => Promise<unknown>
    childrenOf: (id: string) => Task[]
    refreshTasks?: () => void
  }
}

const EMPTY_DESCRIPTION: SerializedEditorState = {
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    children: [],
    direction: 'ltr',
  },
}

function extractDescriptionText(description: unknown): string {
  if (!description) return ''
  if (typeof description === 'string') return description
  try {
    const root = (description as { root?: { children?: unknown[] } })?.root
    if (!root) return ''
    const texts: string[] = []
    function traverse(node: unknown) {
      if (!node || typeof node !== 'object') return
      const n = node as { text?: string; children?: unknown[] }
      if (n.text) texts.push(n.text)
      if (Array.isArray(n.children)) {
        n.children.forEach(traverse)
      }
    }
    traverse(root)
    return texts.join(' ').trim()
  } catch {
    return ''
  }
}

function buildSimpleLexicalJson(text: string): Json {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'text',
              text,
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
          ],
          direction: 'ltr',
        },
      ],
      direction: 'ltr',
    },
  } as unknown as Json
}

export default function TaskDrawer({
  open,
  onOpenChange,
  task: initialTask,
  projectId,
  projects,
  creator,
}: TaskDrawerProps) {
  const [currentTask, setCurrentTask] = useState<Task | null>(initialTask)
  const [titleDraft, setTitleDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] =
    useState<SerializedEditorState>(EMPTY_DESCRIPTION)
  const [lastSavedDescription, setLastSavedDescription] = useState<string>('')
  
  // New subtask inputs
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskDesc, setNewSubtaskDesc] = useState('')
  const [newSubtaskDue, setNewSubtaskDue] = useState('')

  const [newComment, setNewComment] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [createProjectId, setCreateProjectId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const isNew = !currentTask?.id

  const commentScrollRef = useRef<HTMLDivElement>(null)
  const comments = useTaskComments(currentTask?.id ?? null)
  const { members } = useProjectMembers(projectId)

  const titleTimer = useRef<number | undefined>(undefined)
  const descriptionTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setCurrentTask(initialTask)
  }, [initialTask])

  useEffect(() => {
    if (!currentTask) {
      setTitleDraft('')
      setDescriptionDraft({ ...EMPTY_DESCRIPTION })
      setLastSavedDescription('')
      setNewSubtaskTitle('')
      setNewSubtaskDesc('')
      setNewSubtaskDue('')
      setNewComment('')
      setTagInput('')
      setCreateProjectId(projectId ?? projects[0]?.id ?? null)
      return
    }
    setTitleDraft(currentTask.title)
    const json = currentTask.description as unknown as SerializedEditorState | null
    const parsed = json ?? { ...EMPTY_DESCRIPTION }
    setDescriptionDraft(parsed)
    setLastSavedDescription(JSON.stringify(parsed))
  }, [currentTask, projectId, projects])

  useEffect(() => {
    if (!comments.comments.length) return
    commentScrollRef.current?.scrollTo({
      top: commentScrollRef.current.scrollHeight,
    })
  }, [comments.comments.length])

  useEffect(
    () => () => {
      window.clearTimeout(titleTimer.current)
      window.clearTimeout(descriptionTimer.current)
    },
    [],
  )

  function commitTaskPatch(patch: Partial<Task>) {
    if (!currentTask) return
    setSaving(true)
    setCurrentTask((prev) => (prev ? { ...prev, ...patch } : null))
    void creator
      .updateTask({ id: currentTask.id, patch })
      .then(() => {
        setSaving(false)
        creator.refreshTasks?.()
      })
      .catch(() => {
        setSaving(false)
        toast.danger('Não foi possível salvar as alterações.')
      })
  }

  function handleTitleChange(value: string) {
    setTitleDraft(value)
    if (!currentTask) return
    window.clearTimeout(titleTimer.current)
    titleTimer.current = window.setTimeout(() => {
      if (value.trim()) commitTaskPatch({ title: value.trim() })
    }, 500)
  }

  function handleDescriptionChange(json: SerializedEditorState) {
    setDescriptionDraft(json)
    const serialized = JSON.stringify(json)
    if (serialized === lastSavedDescription) return
    setLastSavedDescription(serialized)
    window.clearTimeout(descriptionTimer.current)
    descriptionTimer.current = window.setTimeout(() => {
      commitTaskPatch({ description: json as unknown as Task['description'] })
    }, 800)
  }

  function handleManualSave() {
    if (!currentTask) return
    commitTaskPatch({
      title: titleDraft.trim(),
      description: descriptionDraft as unknown as Task['description'],
    })
    toast.success('Todas as alterações foram salvas!')
    onOpenChange(false)
  }

  function handleStartDate(value: string) {
    if (!currentTask) return
    const next = value || null
    if (next && currentTask.due_date && next > currentTask.due_date) {
      toast.danger('A data de início deve ser anterior à data de conclusão.')
      return
    }
    commitTaskPatch({ start_date: next })
  }

  function handleDueDate(value: string) {
    if (!currentTask) return
    const next = value || null
    if (next && currentTask.start_date && currentTask.start_date > next) {
      toast.danger('A data de conclusão deve ser posterior à data de início.')
      return
    }
    commitTaskPatch({ due_date: next })
  }

  function handleToggleAssignee(userId: string) {
    if (!currentTask) return
    const currentAssignees =
      currentTask.assignees && currentTask.assignees.length > 0
        ? currentTask.assignees
        : currentTask.assigned_to
          ? [currentTask.assigned_to]
          : []

    let nextAssignees: string[]
    if (currentAssignees.includes(userId)) {
      nextAssignees = currentAssignees.filter((id) => id !== userId)
    } else {
      nextAssignees = [...currentAssignees, userId]
    }

    commitTaskPatch({
      assignees: nextAssignees,
      assigned_to: nextAssignees[0] ?? null,
    })
  }

  function handleAddTag() {
    if (!currentTask) return
    const cleanTag = tagInput.trim().replace(/^#/, '').toLowerCase()
    if (!cleanTag) return
    const currentTags = currentTask.tags ?? []
    if (currentTags.includes(cleanTag)) {
      setTagInput('')
      return
    }
    const nextTags = [...currentTags, cleanTag]
    commitTaskPatch({ tags: nextTags })
    setTagInput('')
  }

  function handleRemoveTag(tagToRemove: string) {
    if (!currentTask) return
    const currentTags = currentTask.tags ?? []
    const nextTags = currentTags.filter((t) => t !== tagToRemove)
    commitTaskPatch({ tags: nextTags })
  }

  async function handleCreate() {
    const title = titleDraft.trim()
    if (!title || !createProjectId) return
    try {
      await creator.createTask({
        title,
        project_id: createProjectId,
        status: 'backlog',
        assigned_to: creator.currentUserId,
      })
      setTitleDraft('')
      toast.success('Tarefa criada com sucesso!')
      onOpenChange(false)
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível criar a tarefa.',
      )
    }
  }

  async function handleCreateSubtask() {
    const title = newSubtaskTitle.trim()
    if (!title || !currentTask) return
    try {
      await creator.createTask({
        title,
        project_id: currentTask.project_id!,
        parent_id: currentTask.id,
        status: 'todo',
        assigned_to: currentTask.assigned_to,
        due_date: newSubtaskDue || null,
        description: newSubtaskDesc.trim() ? buildSimpleLexicalJson(newSubtaskDesc.trim()) : null,
      })
      setNewSubtaskTitle('')
      setNewSubtaskDesc('')
      setNewSubtaskDue('')
      creator.refreshTasks?.()
      toast.success('Subtarefa criada com sucesso!')
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível criar a subtarefa.',
      )
    }
  }

  function handleUpdateSubtask(subtaskId: string, patch: Partial<Task>) {
    void creator.updateTask({ id: subtaskId, patch })
      .then(() => creator.refreshTasks?.())
      .catch(() => toast.danger('Erro ao atualizar subtarefa.'))
  }

  function handleToggleSubtask(subtaskId: string, isDone: boolean) {
    const nextStatus: TaskStatus = isDone ? 'done' : 'todo'
    void creator.moveTaskStatus({ id: subtaskId, status: nextStatus })
      .then(() => {
        creator.refreshTasks?.()
        toast.success(isDone ? 'Subtarefa concluída!' : 'Subtarefa reaberta.')
      })
      .catch(() => toast.danger('Erro ao alterar subtarefa.'))
  }

  function handleDeleteSubtask(subtaskId: string) {
    void creator.deleteTask(subtaskId)
      .then(() => {
        creator.refreshTasks?.()
        toast.success('Subtarefa excluída.')
      })
      .catch(() => toast.danger('Erro ao excluir subtarefa.'))
  }

  async function handleAddComment() {
    const content = newComment.trim()
    if (!content || !currentTask) return
    try {
      await comments.addComment(content)
      setNewComment('')
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível enviar o comentário.',
      )
    }
  }

  async function handleDelete() {
    if (!currentTask) return
    try {
      await creator.deleteTask(currentTask.id)
      setConfirmDelete(false)
      onOpenChange(false)
      toast.success('Tarefa excluída.')
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível excluir a tarefa.',
      )
    }
  }

  const subtasks = currentTask ? creator.childrenOf(currentTask.id) : []

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-over Drawer strictly on the RIGHT side */}
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[620px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-250 select-text">
        {/* Drawer Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-5 backdrop-blur">
          <div className="flex items-center gap-2">
            <i className="fa-regular fa-rectangle-list text-[#7b68ee] text-sm" />
            <h2 className="text-sm font-bold text-foreground">
              {isNew ? 'Nova Tarefa' : 'Detalhes da Tarefa'}
            </h2>
            {saving && (
              <span className="text-[10px] text-muted-foreground animate-pulse font-medium">
                Salvando...
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar painel"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isNew ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Projeto *</Label>
                <Select.Root
                  selectedKey={createProjectId}
                  onSelectionChange={(value) =>
                    setCreateProjectId(typeof value === 'string' ? value : null)
                  }
                  aria-label="Projeto da tarefa"
                  className="w-full"
                  placeholder="Selecione um projeto"
                >
                  <Select.Trigger className="rounded-md border border-border bg-background">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox.Root className="rounded-md border border-border bg-card">
                      {projects.length === 0 ? (
                        <ListBox.Item id="__none" isDisabled textValue="Crie um projeto primeiro">
                          Crie um projeto primeiro
                        </ListBox.Item>
                      ) : (
                        projects.map((project) => (
                          <ListBox.Item key={project.id} id={project.id} textValue={project.name}>
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              {project.name}
                            </span>
                          </ListBox.Item>
                        ))
                      )}
                    </ListBox.Root>
                  </Select.Popover>
                </Select.Root>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Título da Tarefa *</Label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder="Digite o título da tarefa..."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate()
                  }}
                />
              </div>

              <Button
                variant="primary"
                className="w-full rounded-md bg-[#7b68ee] text-xs font-semibold text-white hover:bg-[#6c5ce7]"
                onPress={() => void handleCreate()}
                isDisabled={!titleDraft.trim() || !createProjectId}
              >
                <i className="fa-solid fa-plus mr-1.5" />
                Criar Tarefa
              </Button>
            </div>
          ) : currentTask && (
            <div className="space-y-4">
              {/* Title Input with highlighted border */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Título da Tarefa</Label>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Título da tarefa..."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                />
              </div>

              {/* Description Editor with highlighted border */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Descrição</Label>
                <div className="rounded-md border border-border bg-background p-1.5 shadow-2xs">
                  <LexicalEditor
                    key={currentTask.id}
                    initialValue={descriptionDraft}
                    onChange={handleDescriptionChange}
                  />
                </div>
              </div>

              <Separator className="my-2" />

              {/* Tags / Etiquetas */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Etiquetas / Tags</Label>
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-2 shadow-2xs">
                  {(currentTask.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md border border-[#7b68ee]/30 bg-[#7b68ee]/15 px-2 py-0.5 text-xs font-semibold text-[#7b68ee]"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="cursor-pointer text-[#7b68ee]/70 transition hover:text-red-500"
                        title="Remover tag"
                      >
                        <i className="fa-solid fa-xmark text-[10px]" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder="Adicionar tag (Enter)..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        handleAddTag()
                      }
                    }}
                    className="min-w-[130px] flex-1 bg-transparent px-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </div>

              {/* Attributes Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Status</Label>
                  <Select.Root
                    selectedKey={currentTask.status}
                    onSelectionChange={(value) =>
                      void creator
                        .moveTaskStatus({
                          id: currentTask.id,
                          status: value as TaskStatus,
                        })
                        .catch(() =>
                          toast.danger('Não foi possível alterar o status.'),
                        )
                    }
                    aria-label="Alterar status"
                    className="w-full"
                  >
                    <Select.Trigger className="rounded-md border border-border bg-background shadow-2xs">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox.Root className="rounded-md border border-border bg-card">
                        {TASK_STATUSES.map((status) => (
                          <ListBox.Item key={status} id={status} textValue={STATUS_LABELS[status]}>
                            {STATUS_LABELS[status]}
                          </ListBox.Item>
                        ))}
                      </ListBox.Root>
                    </Select.Popover>
                  </Select.Root>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Prioridade</Label>
                  <Select.Root
                    selectedKey={currentTask.priority}
                    onSelectionChange={(value) =>
                      commitTaskPatch({ priority: value as TaskPriority })
                    }
                    aria-label="Alterar prioridade"
                    className="w-full"
                  >
                    <Select.Trigger className="rounded-md border border-border bg-background shadow-2xs">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox.Root className="rounded-md border border-border bg-card">
                        {TASK_PRIORITIES.map((priority) => (
                          <ListBox.Item key={priority} id={priority} textValue={PRIORITY_LABELS[priority]}>
                            {PRIORITY_LABELS[priority]}
                          </ListBox.Item>
                        ))}
                      </ListBox.Root>
                    </Select.Popover>
                  </Select.Root>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold text-foreground">Responsáveis</Label>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-2 shadow-2xs">
                    {(() => {
                      const currentAssignees =
                        currentTask.assignees && currentTask.assignees.length > 0
                          ? currentTask.assignees
                          : currentTask.assigned_to
                            ? [currentTask.assigned_to]
                            : []

                      return (
                        <>
                          {currentAssignees.length === 0 && (
                            <span className="text-xs text-muted-foreground italic mr-2">
                              — nenhum responsável —
                            </span>
                          )}
                          {currentAssignees.map((userId) => {
                            const member = members.find((m) => m.id === userId)
                            const name =
                              member?.full_name ?? member?.username ?? 'Usuário'
                            const initials = name.slice(0, 2).toUpperCase()
                            return (
                              <span
                                key={userId}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground"
                              >
                                <span
                                  className="flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-2xs"
                                  style={{ backgroundColor: userColor(userId) }}
                                >
                                  {initials}
                                </span>
                                <span>{name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAssignee(userId)}
                                  className="cursor-pointer text-muted-foreground hover:text-red-500"
                                  title="Remover responsável"
                                >
                                  <i className="fa-solid fa-xmark text-[10px]" />
                                </button>
                              </span>
                            )
                          })}
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleToggleAssignee(e.target.value)
                                e.target.value = ''
                              }
                            }}
                            aria-label="Adicionar responsável"
                            className="cursor-pointer rounded-md border border-border/80 bg-background px-2 py-1 text-xs font-semibold text-[#7b68ee] hover:bg-muted/50"
                          >
                            <option value="" disabled>
                              + Adicionar responsável...
                            </option>
                            {members.map((member) => (
                              <option
                                key={member.id}
                                value={member.id}
                                disabled={currentAssignees.includes(member.id)}
                              >
                                {member.full_name ?? member.username}{' '}
                                {currentAssignees.includes(member.id) ? '✓' : ''}
                              </option>
                            ))}
                          </select>
                        </>
                      )
                    })()}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Horas Estimadas</Label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={currentTask.estimated_hours != null ? String(currentTask.estimated_hours) : ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      const value = raw === '' ? null : Number.parseFloat(raw)
                      if (value !== null && !Number.isNaN(value)) {
                        commitTaskPatch({ estimated_hours: Math.max(0, value) })
                      }
                    }}
                    placeholder="0"
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Início</Label>
                  <input
                    type="date"
                    value={currentTask.start_date ?? ''}
                    onChange={(e) => handleStartDate(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Conclusão</Label>
                  <input
                    type="date"
                    value={currentTask.due_date ?? ''}
                    onChange={(e) => handleDueDate(e.target.value)}
                    className={`w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs ${
                      currentTask.due_date &&
                      currentTask.due_date < todayIso() &&
                      currentTask.status !== 'done'
                        ? 'border-red-500 font-semibold text-red-600'
                        : ''
                    }`}
                  />
                </div>
              </div>

              <Separator className="my-2" />

              {/* Enhanced Subtasks Section: Checkbox, Title, Description & Due Date */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">
                    Subtarefas{' '}
                    <span className="font-normal text-muted-foreground">
                      ({subtasks.length})
                    </span>
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {subtasks.filter((s) => s.status === 'done').length}/{subtasks.length} concluída(s)
                  </span>
                </div>

                {/* Subtask list */}
                <div className="space-y-2">
                  {subtasks.length === 0 && (
                    <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                      Nenhuma subtarefa adicionada.
                    </p>
                  )}
                  {subtasks.map((subtask) => {
                    const subtaskDescText = extractDescriptionText(subtask.description)
                    const isSubtaskDone = subtask.status === 'done'
                    return (
                      <div
                        key={subtask.id}
                        className={`rounded-md border border-border p-2.5 shadow-2xs transition space-y-2 ${
                          isSubtaskDone ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-background'
                        }`}
                      >
                        {/* Subtask Header Row: Checkbox, Title, Actions */}
                        <div className="flex items-center gap-2">
                          <Checkbox
                            isSelected={isSubtaskDone}
                            onChange={(checked) => handleToggleSubtask(subtask.id, checked)}
                            aria-label={`Concluir subtarefa ${subtask.title}`}
                          />
                          <input
                            type="text"
                            defaultValue={subtask.title}
                            onBlur={(e) => {
                              const val = e.target.value.trim()
                              if (val && val !== subtask.title) {
                                handleUpdateSubtask(subtask.id, { title: val })
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                            placeholder="Título da subtarefa..."
                            className={`flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs font-semibold focus:border-[#7b68ee] focus:bg-background focus:outline-none ${
                              isSubtaskDone ? 'text-muted-foreground line-through' : 'text-foreground'
                            }`}
                          />

                          {/* Open Subtask Details in Drawer */}
                          <button
                            type="button"
                            onClick={() => setCurrentTask(subtask)}
                            title="Editar detalhes completos desta subtarefa"
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-[#7b68ee]"
                          >
                            <i className="fa-solid fa-arrow-up-right-from-square text-[11px]" />
                          </button>

                          {/* Delete Subtask */}
                          <button
                            type="button"
                            onClick={() => handleDeleteSubtask(subtask.id)}
                            title="Excluir subtarefa"
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-red-500"
                          >
                            <i className="fa-solid fa-trash text-[11px]" />
                          </button>
                        </div>

                        {/* Subtask Details Row: Description & Due Date */}
                        <div className="flex flex-wrap items-center gap-2 pl-6">
                          <input
                            type="text"
                            defaultValue={subtaskDescText}
                            onBlur={(e) => {
                              const val = e.target.value.trim()
                              if (val !== subtaskDescText) {
                                handleUpdateSubtask(subtask.id, {
                                  description: val ? buildSimpleLexicalJson(val) : null,
                                })
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                            placeholder="+ Descrição da subtarefa (Enter)..."
                            className="flex-1 min-w-[140px] rounded border border-border/60 bg-muted/20 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-[#7b68ee] focus:bg-background focus:outline-none"
                          />

                          <div className="flex items-center gap-1">
                            <i className="fa-regular fa-calendar text-[10px] text-muted-foreground" />
                            <input
                              type="date"
                              defaultValue={subtask.due_date ?? ''}
                              onChange={(e) => {
                                handleUpdateSubtask(subtask.id, {
                                  due_date: e.target.value || null,
                                })
                              }}
                              className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[11px] text-foreground focus:border-[#7b68ee] focus:bg-background focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add New Subtask Form */}
                <div className="rounded-md border border-border bg-card p-3 space-y-2 shadow-2xs">
                  <span className="text-xs font-semibold text-foreground">
                    Nova Subtarefa
                  </span>
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Título da nova subtarefa..."
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newSubtaskDesc}
                      onChange={(e) => setNewSubtaskDesc(e.target.value)}
                      placeholder="Descrição (opcional)..."
                      className="flex-1 min-w-[140px] rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                    />
                    <input
                      type="date"
                      value={newSubtaskDue}
                      onChange={(e) => setNewSubtaskDue(e.target.value)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                    />
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      className="rounded-md bg-[#7b68ee] text-xs font-semibold text-white hover:bg-[#6c5ce7]"
                      onPress={() => void handleCreateSubtask()}
                      isDisabled={!newSubtaskTitle.trim()}
                    >
                      <i className="fa-solid fa-plus mr-1" />
                      Adicionar Subtarefa
                    </Button>
                  </div>
                </div>
              </div>

              <Separator className="my-2" />

              {/* Comments Section */}
              <div className="space-y-2.5">
                <Label className="text-xs font-semibold text-foreground">Comentários e Atividades</Label>
                <div
                  ref={commentScrollRef}
                  className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-2.5 text-xs shadow-2xs"
                >
                  {comments.comments.length === 0 && (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      Nenhum comentário ainda.
                    </p>
                  )}
                  {comments.comments.map((comment) => {
                    const isMine = comment.author_id === creator.currentUserId
                    const authorMember = members.find((m) => m.id === comment.author_id)
                    const authorName = authorMember?.full_name ?? authorMember?.username ?? 'Usuário'
                    return (
                      <div
                        key={comment.id}
                        className="rounded-md border border-border bg-background p-2.5 shadow-2xs"
                      >
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {authorName}
                          </span>
                          <span>{formatDateTime(comment.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs text-foreground">{comment.content}</p>
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
                    )
                  })}
                </div>

                <div className="space-y-1.5">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleAddComment()
                      }
                    }}
                    placeholder="Escreva um comentário (Enter para enviar)..."
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-md border border-border text-xs"
                      onPress={() => void handleAddComment()}
                      isDisabled={!newComment.trim()}
                    >
                      <i className="fa-regular fa-paper-plane mr-1" />
                      Comentar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Sticky Footer with explicit Salvar button */}
        {currentTask && !isNew && (
          <div className="flex shrink-0 items-center justify-between border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
            <Button
              variant="danger"
              size="sm"
              className="rounded-md text-xs"
              onPress={() => setConfirmDelete(true)}
            >
              <i className="fa-solid fa-trash mr-1" />
              Excluir
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-md border border-border text-xs"
                onPress={() => onOpenChange(false)}
              >
                Fechar
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="rounded-md bg-[#7b68ee] text-xs font-semibold text-white hover:bg-[#6c5ce7]"
                onPress={handleManualSave}
                isDisabled={saving}
              >
                <i className="fa-solid fa-floppy-disk mr-1" />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Alert */}
      <AlertDialog.Root isOpen={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialog.Backdrop />
        <AlertDialog.Container>
          <AlertDialog.Dialog className="rounded-md border border-border bg-card sm:max-w-md">
            <AlertDialog.Header>
              <AlertDialog.Heading>Excluir tarefa?</AlertDialog.Heading>
              <p className="text-sm text-muted-foreground">
                Esta ação é definitiva. As subtarefas desta tarefa também serão
                excluídas.
              </p>
            </AlertDialog.Header>
            <AlertDialog.Body />
            <AlertDialog.Footer>
              <Button variant="outline" className="rounded-md" onPress={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" className="rounded-md" onPress={() => void handleDelete()}>
                <i className="fa-solid fa-trash mr-1" />
                Excluir
              </Button>
            </AlertDialog.Footer>
            <AlertDialog.CloseTrigger />
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Root>
    </>
  )
}