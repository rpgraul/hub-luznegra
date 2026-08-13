import { useEffect, useRef, useState } from 'react'
import { toast, Button, TextField, Label, Input, TextArea, Checkbox, Separator, Drawer, Select, ListBox, AlertDialog } from '@heroui/react'
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
    }) => Promise<Task>
    updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
    deleteTask: (id: string) => Promise<unknown>
    moveTaskStatus: (args: { id: string; status: TaskStatus }) => Promise<unknown>
    childrenOf: (id: string) => Task[]
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
  const [lastSavedDescription, setLastSavedDescription] =
    useState<string>('')
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [createProjectId, setCreateProjectId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isNew = !task?.id

  const commentScrollRef = useRef<HTMLDivElement>(null)
  const comments = useTaskComments(task?.id ?? null)
  const { members, memberOf } = useProjectMembers(projectId)

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
      setCreateProjectId(projectId ?? projects[0]?.id ?? null)
      return
    }
    setTitleDraft(task.title)
    const json = task.description as SerializedEditorState | null
    const parsed = json ?? { ...EMPTY_DESCRIPTION }
    setDescriptionDraft(parsed)
    setLastSavedDescription(JSON.stringify(parsed))
  })

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
          className="bg-transparent"
          style={{ pointerEvents: 'none' }}
        />
        <Drawer.Content placement="right" className="w-full overflow-hidden sm:max-w-[60%]">
          <Drawer.Dialog className="w-full">
            <Drawer.Header className="border-b px-4 py-3">
              <div className="flex w-full items-center justify-between gap-2">
                <Drawer.Heading className="text-base">
                  {isNew ? 'Nova tarefa' : 'Detalhes da tarefa'}
                </Drawer.Heading>
                <Drawer.CloseTrigger className="rounded-md p-1 sm:hidden" aria-label="Fechar" />
              </div>
            </Drawer.Header>

            <Drawer.Body className="h-[calc(100vh-4.5rem)] overflow-y-auto">
              <div className="space-y-5 p-4">
                {isNew ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Projeto</Label>
                      <Select.Root
                        selectedKey={createProjectId}
                        onSelectionChange={(value) =>
                          setCreateProjectId(typeof value === 'string' ? value : null)
                        }
                        aria-label="Projeto da tarefa"
                        className="w-full"
                        placeholder="Selecione um projeto"
                      >
                        <Select.Trigger>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox.Root>
                            {projects.length === 0 ? (
                              <ListBox.Item id="__none" isDisabled textValue="Crie um projeto primeiro">
                                Crie um projeto primeiro
                              </ListBox.Item>
                            ) : (
                              projects.map((project) => (
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
                              ))
                            )}
                          </ListBox.Root>
                        </Select.Popover>
                      </Select.Root>
                    </div>
                    <div className="space-y-2">
                      <Label>Título</Label>
                      <TextField.Root autoFocus value={titleDraft} onChange={setTitleDraft}>
                        <Input
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleCreate()
                          }}
                          placeholder="O que precisa ser feito?"
                        />
                      </TextField.Root>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        isDisabled={!createProjectId}
                        onPress={() => void handleCreate()}
                      >
                        <i className="fa-solid fa-plus mr-1" />
                        Criar tarefa
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <TextField.Root value={titleDraft} onChange={handleTitleChange}>
                      <Input />
                    </TextField.Root>
                  </div>
                )}

                {task && !isNew && (
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <div className="rounded-lg border">
                      <LexicalEditor
                        key={task.id}
                        initialValue={descriptionDraft}
                        onChange={handleDescriptionChange}
                      />
                    </div>
                  </div>
                )}

                {task && !isNew && (
                  <>
                    <Separator />

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Status</Label>
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
                          <Select.Trigger>
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox.Root>
                              {TASK_STATUSES.map((status) => (
                                <ListBox.Item key={status} id={status} textValue={STATUS_LABELS[status]}>
                                  {STATUS_LABELS[status]}
                                </ListBox.Item>
                              ))}
                            </ListBox.Root>
                          </Select.Popover>
                        </Select.Root>
                      </div>

                      <div className="space-y-2">
                        <Label>Prioridade</Label>
                        <Select.Root
                          selectedKey={task.priority}
                          onSelectionChange={(value) =>
                            commitTaskPatch({ priority: value as TaskPriority })
                          }
                          aria-label="Alterar prioridade"
                          className="w-full"
                        >
                          <Select.Trigger>
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox.Root>
                              {TASK_PRIORITIES.map((priority) => (
                                <ListBox.Item key={priority} id={priority} textValue={PRIORITY_LABELS[priority]}>
                                  {PRIORITY_LABELS[priority]}
                                </ListBox.Item>
                              ))}
                            </ListBox.Root>
                          </Select.Popover>
                        </Select.Root>
                      </div>

                      <div className="space-y-2">
                        <Label>Responsável</Label>
                        <Select.Root
                          selectedKey={task.assigned_to ?? NO_ASSIGNEE}
                          onSelectionChange={(value) =>
                            handleAssignee(typeof value === 'string' ? value : null)
                          }
                          aria-label="Alterar responsável"
                          className="w-full"
                        >
                          <Select.Trigger>
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox.Root>
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

                      <div className="space-y-2">
                        <Label>Horas estimadas</Label>
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
                          <Input />
                        </TextField.Root>
                      </div>

                      <div className="space-y-2">
                        <Label>Início</Label>
                        <TextField.Root
                          type="date"
                          value={task.start_date ?? ''}
                          onChange={handleStartDate}
                        >
                          <Input />
                        </TextField.Root>
                      </div>

                      <div className="space-y-2">
                        <Label>Conclusão</Label>
                        <TextField.Root
                          type="date"
                          value={task.due_date ?? ''}
                          onChange={handleDueDate}
                        >
                          <Input
                            className={
                              task.due_date &&
                              task.due_date < todayIso() &&
                              task.status !== 'done'
                                ? 'border-red-500'
                                : ''
                            }
                          />
                        </TextField.Root>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>
                        Subtarefas{' '}
                        <span className="font-normal text-muted-foreground">
                          ({subtasks.length})
                        </span>
                      </Label>
                      <ul className="space-y-1.5">
                        {subtasks.length === 0 && (
                          <li className="text-sm text-muted-foreground">
                            Nenhuma subtarefa ainda.
                          </li>
                        )}
                        {subtasks.map((subtask) => (
                          <li
                            key={subtask.id}
                            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                          >
                            <Checkbox
                              isSelected={subtask.status === 'done'}
                              onChange={(checked) =>
                                void creator
                                  .moveTaskStatus({
                                    id: subtask.id,
                                    status: checked ? 'done' : 'todo',
                                  })
                                  .catch(() =>
                                    toast.danger(
                                      'Não foi possível atualizar a subtarefa.',
                                    ),
                                  )
                              }
                            />
                            <span
                              className={
                                subtask.status === 'done'
                                  ? 'text-muted-foreground line-through'
                                  : ''
                              }
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
                            placeholder="Nova subtarefa..."
                          />
                        </TextField.Root>
                        <Button
                          variant="outline"
                          onPress={() => void handleCreateSubtask()}
                          aria-label="Adicionar subtarefa"
                        >
                          <i className="fa-solid fa-plus" />
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>
                        Comentários{' '}
                        <span className="font-normal text-muted-foreground">
                          ({comments.comments.length})
                        </span>
                      </Label>
                      <div
                        ref={commentScrollRef}
                        className="max-h-64 overflow-y-auto rounded-lg border"
                      >
                        <div className="space-y-3 p-3">
                          {comments.comments.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              Sem comentários. Inicie a conversa abaixo.
                            </p>
                          )}
                          {comments.comments.map((comment) => {
                            const isMine = comment.author_id === creator.currentUserId
                            const author = isMine
                              ? 'Você'
                              : (memberOf(comment.author_id)?.full_name ??
                                memberOf(comment.author_id)?.username ??
                                'Membro da equipe')
                            return (
                              <div key={comment.id}>
                                <div
                                  className={`rounded-lg px-3 py-2 text-sm ${
                                    isMine
                                      ? 'ml-8 bg-primary/10'
                                      : 'mr-8 bg-accent'
                                  }`}
                                >
                                  <div className="mb-0.5 flex items-center justify-between text-xs">
                                    <span className="font-medium">{author}</span>
                                    <span className="text-muted-foreground">
                                      {formatDateTime(comment.created_at)}
                                    </span>
                                  </div>
                                  <p className="whitespace-pre-wrap">{comment.content}</p>
                                </div>
                                {isMine && (
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
                                    className="mt-0.5 ml-1 text-xs text-muted-foreground hover:text-red-600"
                                  >
                                    Excluir
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
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
                          className="resize-none text-sm"
                          rows={2}
                        />
                      </TextField.Root>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onPress={() => void handleAddComment()}
                        >
                          Comentar
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {task && !isNew && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <Button
                        variant="danger"
                        size="sm"
                        onPress={() => setConfirmDelete(true)}
                      >
                        <i className="fa-solid fa-trash mr-1" />
                        Excluir tarefa
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
          <AlertDialog.Dialog className="sm:max-w-md">
            <AlertDialog.Header>
              <AlertDialog.Heading>Excluir tarefa?</AlertDialog.Heading>
              <p className="text-sm text-muted-foreground">
                Esta ação é definitiva. As subtarefas desta tarefa também serão
                excluídas.
              </p>
            </AlertDialog.Header>
            <AlertDialog.Body />
            <AlertDialog.Footer>
              <Button
                variant="outline"
                onPress={() => setConfirmDelete(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onPress={() => void handleDelete()}
              >
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