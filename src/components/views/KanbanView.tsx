import { useState } from 'react'
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd'
import { toast, Button, Input } from '@heroui/react'
import TaskCard from '@/components/tasks/TaskCard'
import { STATUS_COLORS, STATUS_LABELS } from '@/utils/status'
import { TASK_STATUSES } from '@/hooks/useTasks'
import type { NewTaskInput } from '@/lib/api/tasks'
import type { Project, Task, TaskStatus } from '@/types/database'

interface KanbanViewProps {
  tasks: Task[]
  projectId: string | null
  projects: Project[]
  currentUserId: string
  onOpenTask: (task: Task) => void
  onOpenNewTask: () => void
  moveTaskStatus: (args: { id: string; status: TaskStatus }) => Promise<unknown>
  reorderTask: (args: {
    id: string
    status?: TaskStatus
    orderIndex?: number
  }) => Promise<unknown>
  createTask: (input: NewTaskInput) => Promise<Task>
}

export default function KanbanView({
  tasks,
  projectId,
  projects,
  currentUserId,
  onOpenTask,
  onOpenNewTask,
  moveTaskStatus,
  reorderTask,
  createTask,
}: KanbanViewProps) {
  const [quickAdd, setQuickAdd] = useState<Record<TaskStatus, string>>({
    backlog: '',
    todo: '',
    in_progress: '',
    review: '',
    done: '',
  })
  const [showSubtasksAsCards, setShowSubtasksAsCards] = useState(false)

  const projectById = new Map(projects.map((project) => [project.id, project]))
  const taskById = new Map(tasks.map((task) => [task.id, task]))

  // Partition top-level and subtasks
  const topLevelTasks = tasks.filter((task) => !task.parent_id)
  const displayTasks = showSubtasksAsCards ? tasks : topLevelTasks

  async function addQuick(status: TaskStatus) {
    const title = quickAdd[status].trim()
    if (!title) return
    const targetProject = projectId || projects[0]?.id
    if (!targetProject) {
      toast.danger('Selecione ou crie um projeto primeiro.')
      return
    }
    try {
      await createTask({
        title,
        project_id: targetProject,
        status,
        assigned_to: currentUserId,
      })
      setQuickAdd((prev) => ({ ...prev, [status]: '' }))
      toast.success('Tarefa criada!')
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível criar a tarefa.',
      )
    }
  }

  function handleToggleDone(task: Task) {
    const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    void moveTaskStatus({ id: task.id, status: nextStatus })
      .then(() =>
        toast.success(
          task.status === 'done' ? 'Tarefa reaberta.' : 'Tarefa concluída!',
        ),
      )
      .catch(() => toast.danger('Erro ao alterar status.'))
  }

  function handleToggleSubtask(subtask: Task, done: boolean) {
    const nextStatus: TaskStatus = done ? 'done' : 'todo'
    void moveTaskStatus({ id: subtask.id, status: nextStatus })
      .then(() => toast.success(done ? 'Subtarefa concluída!' : 'Subtarefa reaberta.'))
      .catch(() => toast.danger('Erro ao alterar subtarefa.'))
  }

  async function handleCreateSubtask(parentId: string, title: string) {
    const parent = taskById.get(parentId)
    if (!parent || !parent.project_id) return
    try {
      await createTask({
        title,
        project_id: parent.project_id,
        parent_id: parentId,
        status: 'todo',
        assigned_to: parent.assigned_to,
      })
      toast.success('Subtarefa adicionada!')
    } catch (error) {
      toast.danger('Erro ao criar subtarefa.')
    }
  }

  function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result
    if (!destination) return

    const fromStatus = source.droppableId as TaskStatus
    const toStatus = destination.droppableId as TaskStatus

    if (fromStatus === toStatus && source.index === destination.index) return

    try {
      if (fromStatus === toStatus) {
        void reorderTask({ id: draggableId, orderIndex: destination.index })
      } else {
        void moveTaskStatus({ id: draggableId, status: toStatus }).then(() => {
          void reorderTask({ id: draggableId, orderIndex: destination.index })
        })
      }
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível mover a tarefa.',
      )
    }
  }

  return (
    <div className="flex h-full flex-col bg-background select-none">
      {/* Top Toolbar in Kanban */}
      <div className="flex items-center justify-between border-b border-border bg-card/40 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showSubtasksAsCards ? 'secondary' : 'outline'}
            className="h-7 gap-1.5 px-2.5 text-xs font-medium"
            onPress={() => setShowSubtasksAsCards(!showSubtasksAsCards)}
          >
            <i className="fa-solid fa-diagram-project text-xs" />
            <span>
              {showSubtasksAsCards
                ? 'Subtarefas Separadas'
                : 'Subtarefas Agrupadas'}
            </span>
          </Button>

          <Button
            size="sm"
            variant="primary"
            className="h-7 gap-1.5 px-2.5 text-xs font-semibold bg-[#7b68ee] text-white hover:bg-[#6c5ce7]"
            onPress={onOpenNewTask}
          >
            <i className="fa-solid fa-plus text-xs" />
            <span>Nova Tarefa</span>
          </Button>

          <span className="text-[11px] text-muted-foreground">
            {displayTasks.length} cartão(ões)
          </span>
        </div>

        <div>
          <span className="text-[11px] text-muted-foreground">
            Arraste os cartões entre as colunas
          </span>
        </div>
      </div>

      {/* Board Columns Area */}
      <div className="min-h-0 flex-1 overflow-x-auto p-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex h-full gap-3.5">
            {TASK_STATUSES.map((status) => {
              const columnTasks = displayTasks
                .filter((task) => task.status === status)
                .sort((a, b) => a.order_index - b.order_index)

              return (
                <div
                  key={status}
                  className="flex h-full w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30 shadow-2xs"
                >
                  {/* Column Header */}
                  <div
                    className="flex items-center gap-2 border-b border-border/80 bg-card/70 px-3 py-2.5 rounded-t-xl"
                    style={{ borderTop: `3px solid ${STATUS_COLORS[status]}` }}
                  >
                    <span
                      className="size-2 rounded-full shadow-2xs"
                      style={{ backgroundColor: STATUS_COLORS[status] }}
                    />
                    <h2 className="text-xs font-bold text-foreground">
                      {STATUS_LABELS[status]}
                    </h2>
                    <span className="ml-auto rounded-full bg-background border border-border px-2 py-0.2 text-[10px] font-bold text-muted-foreground">
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Column Droppable Area */}
                  <Droppable droppableId={status}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 space-y-2.5 overflow-y-auto p-2.5 transition-colors ${
                          snapshot.isDraggingOver ? 'bg-primary/5 rounded-lg' : ''
                        }`}
                      >
                        {columnTasks.length === 0 && (
                          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border/60 text-[11px] text-muted-foreground/70">
                            Arraste tarefas aqui
                          </div>
                        )}
                        {columnTasks.map((task, index) => {
                          const directSubtasks = tasks.filter(
                            (t) => t.parent_id === task.id,
                          )
                          const parent = task.parent_id
                            ? taskById.get(task.parent_id)
                            : null

                          return (
                            <Draggable
                              key={task.id}
                              draggableId={task.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={snapshot.isDragging ? 'opacity-90 scale-[1.02] shadow-lg' : ''}
                                >
                                  <TaskCard
                                    task={task}
                                    subtasks={directSubtasks}
                                    onOpen={onOpenTask}
                                    onToggleDone={handleToggleDone}
                                    onToggleSubtask={handleToggleSubtask}
                                    onCreateSubtask={handleCreateSubtask}
                                    compact={false}
                                    parentTaskTitle={parent?.title}
                                    project={
                                      task.project_id
                                        ? projectById.get(task.project_id)
                                        : null
                                    }
                                  />
                                </div>
                              )}
                            </Draggable>
                          )
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>

                  {/* Quick Add at bottom of column */}
                  <div className="flex gap-1.5 border-t border-border/80 bg-card/40 p-2 rounded-b-xl">
                    <Input
                      value={quickAdd[status]}
                      onChange={(e) =>
                        setQuickAdd((prev) => ({
                          ...prev,
                          [status]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addQuick(status)
                      }}
                      placeholder="+ Nova tarefa..."
                      className="h-7 text-xs"
                    />
                    <Button
                      variant="outline"
                      isIconOnly
                      size="sm"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      onPress={() => void addQuick(status)}
                      aria-label={`Adicionar tarefa em ${STATUS_LABELS[status]}`}
                    >
                      <i className="fa-solid fa-plus text-xs" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>
    </div>
  )
}