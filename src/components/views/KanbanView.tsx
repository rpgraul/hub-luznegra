import { useState } from 'react'
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import TaskCard from '@/components/tasks/TaskCard'
import { STATUS_COLORS, STATUS_LABELS } from '@/utils/status'
import { TASK_STATUSES } from '@/hooks/useTasks'
import type { NewTaskInput } from '@/lib/api/tasks'
import type { Task, TaskStatus } from '@/types/database'

interface KanbanViewProps {
  tasks: Task[]
  projectId: string
  currentUserId: string
  onOpenTask: (task: Task) => void
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
  currentUserId,
  onOpenTask,
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

  const topLevel = tasks.filter((task) => !task.parent_id)

  async function addQuick(status: TaskStatus) {
    const title = quickAdd[status].trim()
    if (!title) return
    try {
      await createTask({
        title,
        project_id: projectId,
        status,
        assigned_to: currentUserId,
      })
      setQuickAdd((prev) => ({ ...prev, [status]: '' }))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível criar a tarefa.',
      )
    }
  }

  function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result
    if (!destination) return

    const fromStatus = source.droppableId as TaskStatus
    const toStatus = destination.droppableId as TaskStatus

    try {
      if (fromStatus === toStatus) {
        void reorderTask({ id: draggableId, orderIndex: destination.index })
        return
      }
      void moveTaskStatus({ id: draggableId, status: toStatus }).then(() => {
        void reorderTask({ id: draggableId, orderIndex: destination.index })
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível mover a tarefa.',
      )
    }
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {TASK_STATUSES.map((status) => {
          const columnTasks = topLevel
            .filter((task) => task.status === status)
            .sort((a, b) => a.order_index - b.order_index)

          return (
            <div
              key={status}
              className="flex h-full w-72 shrink-0 flex-col rounded-xl border bg-muted/40"
            >
              <div
                className="flex items-center gap-2 px-3 py-2.5"
                style={{ borderBottom: `3px solid ${STATUS_COLORS[status]}` }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <h2 className="text-sm font-semibold">{STATUS_LABELS[status]}</h2>
                <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  {columnTasks.length}
                </span>
              </div>

              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 space-y-2 overflow-y-auto p-2 transition-colors ${
                      snapshot.isDraggingOver ? 'bg-accent/60' : ''
                    }`}
                  >
                    {columnTasks.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                        Arraste tarefas para cá
                      </p>
                    )}
                    {columnTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={snapshot.isDragging ? 'opacity-80' : ''}
                          >
                            <TaskCard
                              task={task}
                              subtitleCount={tasks.filter(
                                (t) => t.parent_id === task.id,
                              ).length}
                              onOpen={onOpenTask}
                              compact
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              <div className="flex gap-1.5 border-t p-2">
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
                  placeholder="Nova tarefa..."
                  className="h-8 text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => void addQuick(status)}
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
  )
}