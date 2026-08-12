import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import type { Task, TaskPriority, TaskStatus } from '@/types/database'

interface TaskDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
  projectId: string | null
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
  creator,
}: TaskDrawerProps) {
  const [titleDraft, setTitleDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] =
    useState<SerializedEditorState>(EMPTY_DESCRIPTION)
  const [lastSavedDescription, setLastSavedDescription] =
    useState<string>('')
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
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
      .catch(() => toast.error('Não foi possível salvar as alterações.'))
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
      toast.error('A data de início deve ser anterior à data de conclusão.')
      return
    }
    commitTaskPatch({ start_date: next })
  }

  function handleDueDate(value: string) {
    if (!task) return
    const next = value || null
    if (next && task.start_date && task.start_date > next) {
      toast.error('A data de conclusão deve ser posterior à data de início.')
      return
    }
    commitTaskPatch({ due_date: next })
  }

  function handleAssignee(value: string) {
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
    if (!title || !projectId) return
    try {
      await creator.createTask({
        title,
        project_id: projectId,
        status: 'backlog',
        assigned_to: creator.currentUserId,
      })
      setTitleDraft('')
      toast.success('Tarefa criada.')
    } catch (error) {
      toast.error(
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
      toast.error(
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
      toast.error(
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
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível excluir a tarefa.',
      )
    }
  }

  const subtasks = task ? creator.childrenOf(task.id) : []

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent
          side="right"
          showOverlay={false}
          className="w-full overflow-hidden p-0 sm:max-w-[60%]"
        >
          <SheetHeader className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="text-base">
                {isNew ? 'Nova tarefa' : 'Detalhes da tarefa'}
              </SheetTitle>
              <SheetClose className="rounded-md p-1 hover:bg-accent sm:hidden">
                <i className="fa-solid fa-xmark" />
                <span className="sr-only">Fechar</span>
              </SheetClose>
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-4.5rem)]">
            <div className="space-y-5 p-4">
              {isNew ? (
                <div className="space-y-2">
                  <Label htmlFor="new-task-title">Título</Label>
                  <Input
                    id="new-task-title"
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCreate()
                    }}
                    placeholder="O que precisa ser feito?"
                  />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => void handleCreate()}>
                      <i className="fa-solid fa-plus mr-1" />
                      Criar tarefa
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="task-title">Título</Label>
                  <Input
                    id="task-title"
                    value={titleDraft}
                    onChange={(e) => handleTitleChange(e.target.value)}
                  />
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
                      <Select
                        value={task.status}
                        onValueChange={(value) =>
                          void creator
                            .moveTaskStatus({
                              id: task.id,
                              status: value as TaskStatus,
                            })
                            .catch(() =>
                              toast.error('Não foi possível alterar o status.'),
                            )
                        }
                      >
                        <SelectTrigger aria-label="Alterar status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Prioridade</Label>
                      <Select
                        value={task.priority}
                        onValueChange={(value) =>
                          commitTaskPatch({ priority: value as TaskPriority })
                        }
                      >
                        <SelectTrigger aria-label="Alterar prioridade">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_PRIORITIES.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              {PRIORITY_LABELS[priority]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Responsável</Label>
                      <Select
                        value={task.assigned_to ?? NO_ASSIGNEE}
                        onValueChange={handleAssignee}
                      >
                        <SelectTrigger aria-label="Alterar responsável">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ASSIGNEE}>— sem responsável —</SelectItem>
                          {members.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.full_name ?? member.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Horas estimadas</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={task.estimated_hours ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value
                          const value =
                            raw === ''
                              ? null
                              : Math.max(0, Number.parseFloat(raw))
                          commitTaskPatch({ estimated_hours: value })
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Início</Label>
                      <Input
                        type="date"
                        value={task.start_date ?? ''}
                        onChange={(e) => handleStartDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Conclusão</Label>
                      <Input
                        type="date"
                        value={task.due_date ?? ''}
                        className={
                          task.due_date &&
                          task.due_date < todayIso() &&
                          task.status !== 'done'
                            ? 'border-red-500'
                            : ''
                        }
                        onChange={(e) => handleDueDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Subtarefas</Label>
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
                            checked={subtask.status === 'done'}
                            onCheckedChange={(checked) =>
                              void creator
                                .moveTaskStatus({
                                  id: subtask.id,
                                  status: checked ? 'done' : 'todo',
                                })
                                .catch(() =>
                                  toast.error(
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
                      <Input
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleCreateSubtask()
                        }}
                        placeholder="Nova subtarefa..."
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => void handleCreateSubtask()}
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
                    <ScrollArea
                      ref={commentScrollRef}
                      className="max-h-64 rounded-lg border"
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
                                        toast.error(
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
                    </ScrollArea>
                    <div className="flex gap-2">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
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
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleAddComment()}
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
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <i className="fa-solid fa-trash mr-1" />
                      Excluir tarefa
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir tarefa?</DialogTitle>
            <DialogDescription>
              Esta ação é definitiva. As subtarefas desta tarefa também serão
              excluídas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
            >
              <i className="fa-solid fa-trash mr-1" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}