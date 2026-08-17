import { useEffect, useRef, useState } from 'react'
import {
  toast,
  Button,
  TextField,
  Label,
  Input,
  TextArea,
  Checkbox,
  Separator,
  Drawer,
  Select,
  ListBox,
  AlertDialog,
} from '@heroui/react'
import LexicalEditor from '@/components/tasks/LexicalEditor'
import { useTaskComments } from '@/hooks/useTaskComments'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { formatDateTime, todayIso } from '@/utils/format'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/utils/status'
import type { SerializedEditorState } from 'lexical'
import type { Project, Task, TaskPriority, TaskStatus } from '@/types/database'

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
      status?: TaskStatus
      start_date?: string | null
      due_date?: string | null
      tags?: string[] | null
    }) => Promise<Task>
    updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
    deleteTask: (id: string) => Promise<unknown>
    moveTaskStatus: (args: { id: string; status: TaskStatus }) => Promise<unknown>
    childrenOf: (id: string) => Task[]
    refreshTasks?: () => void
  }
}

const NO_ASSIGNEE = '__none__'
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

export default function TaskDrawer({
  open,
  onOpenChange,
  task,
  projectId,
  projects,
  creator,
}: TaskDrawerProps) {
  const [titleDraft, setTitleDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] =
    useState<SerializedEditorState>(EMPTY_DESCRIPTION)
  const [lastSavedDescription, setLastSavedDescription] = useState<string>('')
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [createProjectId, setCreateProjectId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isNew = !task?.id

  const commentScrollRef = useRef<HTMLDivElement>(null)
  const comments = useTaskComments(task?.id ?? null)
  const { members } = useProjectMembers(projectId)

  const titleTimer = useRef<number | undefined>(undefined)
  const descriptionTimer = useRef<number | undefined>(undefined)
  const lastTaskId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (lastTaskId.current === task?.id) return
    lastTaskId.current = task?.id ?? null
    if (!task) {
      setTitleDraft('')
      setDescriptionDraft({ ...EMPTY_DESCRIPTION })
      setLastSavedDescription('')
      setNewSubtask('')
      setNewComment('')
      setTagInput('')
      setCreateProjectId(projectId ?? projects[0]?.id ?? null)
      return
    }
    setTitleDraft(task.title)
    const json = task.description as unknown as SerializedEditorState | null
    const parsed = json ?? { ...EMPTY_DESCRIPTION }
    setDescriptionDraft(parsed)
    setLastSavedDescription(JSON.stringify(parsed))
  }, [task, projectId, projects])

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
    if (!task) return
    void creator
      .updateTask({ id: task.id, patch })
      .catch(() => toast.danger('Não foi possível salvar as alterações.'))
  }

  function handleTitleChange(value: string) {
    setTitleDraft(value)
    if (!task) return
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

  function handleStartDate(value: string) {
    if (!task) return
    const next = value || null
    if (next && task.due_date && next > task.due_date) {
      toast.danger('A data de início deve ser anterior à data de conclusão.')
      return
    }
    commitTaskPatch({ start_date: next })
  }

  function handleDueDate(value: string) {
    if (!task) return
    const next = value || null
    if (next && task.start_date && task.start_date > next) {
      toast.danger('A data de conclusão deve ser posterior à data de início.')
      return
    }
    commitTaskPatch({ due_date: next })
  }

  function handleAssignee(value: string | null) {
    if (!task) return
    const next = value === NO_ASSIGNEE ? null : value
    if (next !== task.assigned_to) {
      commitTaskPatch({ assigned_to: next })
      if (next !== creator.currentUserId) {
        toast.info('Tarefa transferida: ela sai da sua lista "Minhas Tarefas".')
      }
    }
  }

  function handleAddTag() {
    if (!task) return
    const cleanTag = tagInput.trim().replace(/^#/, '').toLowerCase()
    if (!cleanTag) return
    const currentTags = task.tags ?? []
    if (currentTags.includes(cleanTag)) {
      setTagInput('')
      return
    }
    const nextTags = [...currentTags, cleanTag]
    commitTaskPatch({ tags: nextTags })
    setTagInput('')
  }

  function handleRemoveTag(tagToRemove: string) {
    if (!task) return
    const currentTags = task.tags ?? []
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
      toast.success('Tarefa criada.')
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível criar a tarefa.',
      )
    }
  }

  async function handleCreateSubtask() {
    const title = newSubtask.trim()
    if (!title || !task) return
    try {
      await creator.createTask({
        title,
        project_id: task.project_id!,
        parent_id: task.id,
        status: task.status,
        assigned_to: task.assigned_to,
      })
      setNewSubtask('')
      creator.refreshTasks?.()
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível criar a subtarefa.',
      )
    }
  }

  async function handleAddComment() {
    const content = newComment.trim()
    if (!content || !task) return
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
    if (!task) return
    try {
      await creator.deleteTask(task.id)
      setConfirmDelete(false)
      onOpenChange(false)
      toast.success('Tarefa excluída.')
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível excluir a tarefa.',
      )
    }
  }

  const subtasks = task ? creator.childrenOf(task.id) : []

  return (
    <>
      <Drawer.Root isOpen={open} onOpenChange={onOpenChange}>
        <Drawer.Backdrop
          isDismissable={false}
          className="bg-black/30 backdrop-blur-xs transition-opacity"
        />
        {/* Placed on the LEFT side as requested */}
        <Drawer.Content
          placement="left"
          className="fixed inset-y-0 left-0 z-50 flex h-full w-full flex-col border-r border-border bg-card shadow-2xl sm:max-w-[55%] animate-in slide-in-from-left duration-300"
        >
          <Drawer.Dialog className="flex h-full w-full flex-col">
            {/* Header with clear title on the left and Close X button on the top right */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-3.5">
              <div className="flex items-center gap-2">
                <i className="fa-regular fa-rectangle-list text-[#7b68ee] text-sm" />
                <h2 className="text-sm font-bold text-foreground">
                  {isNew ? 'Nova Tarefa' : 'Detalhes da Tarefa'}
                </h2>
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

            <Drawer.Body className="flex-1 overflow-y-auto p-5">
              <div className="space-y-4">
                {isNew ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Projeto</Label>
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
                      <Label className="text-xs font-semibold text-foreground">Título da Tarefa</Label>
                      <TextField.Root
                        value={titleDraft}
                        onChange={setTitleDraft}
                        isRequired
                      >
                        <Input
                          placeholder="Digite o título da tarefa..."
                          className="rounded-md border border-border bg-background"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleCreate()
                          }}
                        />
                      </TextField.Root>
                    </div>

                    <Button
                      variant="primary"
                      className="w-full rounded-md bg-[#7b68ee] font-semibold text-white hover:bg-[#6c5ce7]"
                      onPress={() => void handleCreate()}
                      isDisabled={!titleDraft.trim() || !createProjectId}
                    >
                      <i className="fa-solid fa-plus mr-1.5" />
                      Criar Tarefa
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Title Input with crisp border */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Título</Label>
                      <TextField.Root
                        value={titleDraft}
                        onChange={handleTitleChange}
                        className="w-full"
                      >
                        <Input
                          className="rounded-md border border-border bg-background px-3 py-2 text-sm font-bold tracking-tight text-foreground shadow-2xs focus:border-[#7b68ee]"
                          placeholder="Título da tarefa"
                        />
                      </TextField.Root>
                    </div>

                    {/* Description Editor with crisp border */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Descrição</Label>
                      <div className="rounded-md border border-border bg-background p-1.5 shadow-2xs">
                        <LexicalEditor
                          key={task.id}
                          initialValue={descriptionDraft}
                          onChange={handleDescriptionChange}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {task && !isNew && (
                  <>
                    <Separator className="my-2" />

                    {/* Tags / Etiquetas Section */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Etiquetas / Tags</Label>
                      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-2 shadow-2xs">
                        {(task.tags ?? []).map((tag) => (
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

                    {/* Grid of Attributes with uniform rounded-md & distinct borders */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground">Status</Label>
                        <Select.Root
                          selectedKey={task.status}
                          onSelectionChange={(value) =>
                            void creator
                              .moveTaskStatus({
                                id: task.id,
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
                          selectedKey={task.priority}
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

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground">Responsável</Label>
                        <Select.Root
                          selectedKey={task.assigned_to ?? NO_ASSIGNEE}
                          onSelectionChange={(value) =>
                            handleAssignee(typeof value === 'string' ? value : null)
                          }
                          aria-label="Alterar responsável"
                          className="w-full"
                        >
                          <Select.Trigger className="rounded-md border border-border bg-background shadow-2xs">
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox.Root className="rounded-md border border-border bg-card">
                              <ListBox.Item id={NO_ASSIGNEE} textValue="sem responsável">
                                — sem responsável —
                              </ListBox.Item>
                              {members.map((member) => (
                                <ListBox.Item
                                  key={member.id}
                                  id={member.id}
                                  textValue={member.full_name ?? member.username}
                                >
                                  {member.full_name ?? member.username}
                                </ListBox.Item>
                              ))}
                            </ListBox.Root>
                          </Select.Popover>
                        </Select.Root>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground">Horas Estimadas</Label>
                        <TextField.Root
                          type="number"
                          value={
                            task.estimated_hours != null
                              ? String(task.estimated_hours)
                              : ''
                          }
                          onChange={(raw) => {
                            const value = raw === '' ? null : Number.parseFloat(raw)
                            if (value !== null && !Number.isNaN(value)) {
                              commitTaskPatch({ estimated_hours: Math.max(0, value) })
                            }
                          }}
                        >
                          <Input
                            placeholder="0"
                            className="rounded-md border border-border bg-background shadow-2xs"
                          />
                        </TextField.Root>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground">Início</Label>
                        <TextField.Root
                          type="date"
                          value={task.start_date ?? ''}
                          onChange={handleStartDate}
                        >
                          <Input className="rounded-md border border-border bg-background shadow-2xs" />
                        </TextField.Root>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground">Conclusão</Label>
                        <TextField.Root
                          type="date"
                          value={task.due_date ?? ''}
                          onChange={handleDueDate}
                        >
                          <Input
                            className={`rounded-md border border-border bg-background shadow-2xs ${
                              task.due_date &&
                              task.due_date < todayIso() &&
                              task.status !== 'done'
                                ? 'border-red-500'
                                : ''
                            }`}
                          />
                        </TextField.Root>
                      </div>
                    </div>

                    <Separator className="my-2" />

                    {/* Subtasks Section */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-foreground">
                        Subtarefas{' '}
                        <span className="font-normal text-muted-foreground">
                          ({subtasks.length})
                        </span>
                      </Label>
                      <ul className="space-y-1.5">
                        {subtasks.length === 0 && (
                          <li className="text-xs text-muted-foreground">
                            Nenhuma subtarefa adicionada.
                          </li>
                        )}
                        {subtasks.map((subtask) => (
                          <li
                            key={subtask.id}
                            onClick={() =>
                              void creator
                                .moveTaskStatus({
                                  id: subtask.id,
                                  status: subtask.status === 'done' ? 'todo' : 'done',
                                })
                                .catch(() =>
                                  toast.danger('Não foi possível atualizar a subtarefa.'),
                                )
                            }
                            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-2xs transition hover:bg-muted/40"
                          >
                            <Checkbox
                              isSelected={subtask.status === 'done'}
                              onChange={() => {}}
                            />
                            <span
                              className={`flex-1 truncate ${
                                subtask.status === 'done'
                                  ? 'text-muted-foreground line-through'
                                  : 'font-medium text-foreground'
                              }`}
                            >
                              {subtask.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2">
                        <TextField.Root value={newSubtask} onChange={setNewSubtask} className="flex-1">
                          <Input
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleCreateSubtask()
                            }}
                            placeholder="Adicionar subtarefa..."
                            className="rounded-md border border-border bg-background text-xs shadow-2xs"
                          />
                        </TextField.Root>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-md border border-border"
                          onPress={() => void handleCreateSubtask()}
                          isDisabled={!newSubtask.trim()}
                        >
                          <i className="fa-solid fa-plus mr-1" />
                          Adicionar
                        </Button>
                      </div>
                    </div>

                    <Separator className="my-2" />

                    {/* Comments Section */}
                    <div className="space-y-2.5">
                      <Label className="text-xs font-semibold text-foreground">Comentários e Atividades</Label>
                      <div
                        ref={commentScrollRef}
                        className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-2.5 text-xs shadow-2xs"
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

                      <TextField.Root value={newComment} onChange={setNewComment}>
                        <TextArea
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              void handleAddComment()
                            }
                          }}
                          placeholder="Escreva um comentário..."
                          className="rounded-md border border-border bg-background text-xs shadow-2xs resize-none"
                          rows={2}
                        />
                      </TextField.Root>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-md border border-border"
                          onPress={() => void handleAddComment()}
                          isDisabled={!newComment.trim()}
                        >
                          <i className="fa-regular fa-paper-plane mr-1" />
                          Comentar
                        </Button>
                      </div>
                    </div>

                    <Separator className="my-2" />

                    <div className="flex justify-between pt-1">
                      <Button
                        variant="danger"
                        size="sm"
                        className="rounded-md"
                        onPress={() => setConfirmDelete(true)}
                      >
                        <i className="fa-solid fa-trash mr-1" />
                        Excluir Tarefa
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Root>

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