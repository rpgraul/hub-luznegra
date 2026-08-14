import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast, Button } from '@heroui/react'
import TaskDrawer from '@/components/tasks/TaskDrawer'
import NewTaskModal, {
  type NewTaskInput,
} from '@/components/tasks/NewTaskModal'
import KanbanView from '@/components/views/KanbanView'
import ListView from '@/components/views/ListView'
import GanttView from '@/components/views/GanttView'
import CalendarView from '@/components/views/CalendarView'
import { useAuth } from '@/hooks/useAuth'
import { usePreferences } from '@/hooks/usePreferences'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { useTasks } from '@/hooks/useTasks'
import {
  equalizeRatios,
  shiftRatio,
  type LayoutState,
  type ViewLayout,
} from '@/lib/layout'
import type {
  DefaultView,
  Json,
  Project,
  Task,
} from '@/types/database'

interface TaskWorkspaceProps {
  initialTaskId?: string
  projects: Project[]
  showAllTasks: boolean
  layout: LayoutState
  onLayoutChange: (layout: LayoutState) => void
}

function ResizeHandle({
  orientation,
  containerRef,
  onShift,
  onReset,
}: {
  orientation: ViewLayout
  containerRef: RefObject<HTMLDivElement | null>
  onShift: (deltaPct: number) => void
  onReset: () => void
}) {
  const drag = useRef<{ start: number; total: number } | null>(null)

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    drag.current = {
      start: orientation === 'row' ? e.clientX : e.clientY,
      total: orientation === 'row' ? rect.width : rect.height,
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.total === 0) return
    const current = orientation === 'row' ? e.clientX : e.clientY
    const deltaPct =
      ((current - drag.current.start) / drag.current.total) * 100
    onShift(deltaPct)
  }

  function handlePointerUp() {
    drag.current = null
  }

  if (orientation === 'row') {
    return (
      <div
        className="group z-10 mt-2 flex w-1.5 shrink-0 cursor-col-resize items-stretch justify-center self-stretch hover:bg-primary/10 active:bg-primary/30"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={onReset}
        aria-hidden
      >
        <div className="w-0.5 bg-border group-hover:bg-primary/40" />
      </div>
    )
  }

  return (
    <div
      className="group z-10 ml-2 flex h-1.5 shrink-0 cursor-row-resize items-center justify-center self-stretch hover:bg-primary/10 active:bg-primary/30"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      aria-hidden
    >
      <div className="h-0.5 w-full bg-border group-hover:bg-primary/40" />
    </div>
  )
}

export default function TaskWorkspace({
  initialTaskId,
  projects,
  showAllTasks,
  layout,
  onLayoutChange,
}: TaskWorkspaceProps) {
  const { user } = useAuth()
  const { preferences } = usePreferences()
  const queryClient = useQueryClient()
  const activeProjectId = preferences?.active_project_id ?? null

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createStartDate, setCreateStartDate] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)

  const tasksApi = useTasks(showAllTasks)
  const { tasks } = tasksApi
  const { memberOf } = useProjectMembers(activeProjectId)

  const visibleTasks = useMemo(() => {
    if (!activeProjectId) return tasks
    return tasks.filter((task) => task.project_id === activeProjectId)
  }, [tasks, activeProjectId])

  useEffect(() => {
    if (!initialTaskId || !visibleTasks) return
    const task = visibleTasks.find((t) => t.id === initialTaskId)
    if (!task) return
    setSelectedTask(task)
    setDrawerOpen(true)
  }, [initialTaskId, visibleTasks])

  function openTask(task: Task) {
    setSelectedTask(task)
    setDrawerOpen(true)
  }

  function openNewTask(start?: Date) {
    setCreateStartDate(start ? start.toISOString() : null)
    setCreateOpen(true)
  }

  function closeDrawer(open: boolean) {
    setDrawerOpen(open)
    if (!open) {
      setSelectedTask(null)
    }
  }

  function refreshTasks() {
    void queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }

  async function handleCreateNewTask(input: NewTaskInput) {
    try {
      const parent = await tasksApi.createTask({
        title: input.title,
        project_id: input.project_id,
        status: input.status,
        priority: input.priority,
        assigned_to: input.assigned_to,
        start_date: input.start_date,
        due_date: input.due_date,
        estimated_hours: input.estimated_hours,
        description: input.description as unknown as Json,
      })

      for (const subtaskTitle of input.subtasks) {
        await tasksApi.createTask({
          title: subtaskTitle,
          project_id: input.project_id,
          parent_id: parent.id,
          status: input.status,
          assigned_to: input.assigned_to,
        })
      }

      toast.success(
        input.subtasks.length > 0
          ? `Tarefa e ${input.subtasks.length} subtarefa(s) criadas.`
          : 'Tarefa criada.',
      )
      setCreateOpen(false)
      setCreateStartDate(null)
    } catch (err) {
      toast.danger(
        err instanceof Error ? err.message : 'Erro ao criar tarefa.',
      )
    }
  }

  function renderView(v: DefaultView) {
    switch (v) {
      case 'gantt':
        return (
          <GanttView
            tasks={visibleTasks}
            onOpenTask={openTask}
            updateTask={tasksApi.updateTask}
          />
        )
      case 'kanban':
        return (
          <KanbanView
            tasks={visibleTasks}
            projectId={activeProjectId}
            projects={projects}
            currentUserId={user!.id}
            onOpenTask={openTask}
            onOpenNewTask={() => openNewTask()}
            moveTaskStatus={tasksApi.moveTaskStatus}
            reorderTask={tasksApi.reorderTask}
            createTask={tasksApi.createTask}
          />
        )
      case 'lista':
        return (
          <ListView
            tasks={visibleTasks}
            projects={projects}
            grouped={!activeProjectId}
            onOpenTask={openTask}
            memberOf={memberOf}
            moveTaskStatus={tasksApi.moveTaskStatus}
            deleteTask={tasksApi.deleteTask}
          />
        )
      case 'calendario':
        return (
          <CalendarView
            tasks={visibleTasks}
            onOpenTask={openTask}
            onSelectSlot={openNewTask}
            updateTask={tasksApi.updateTask}
          />
        )
    }
  }

  if (showAllTasks === true && activeProjectId === null) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Selecione um projeto para começar.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className="flex h-full overflow-hidden"
        style={{
          flexDirection: layout.layout === 'column' ? 'column' : 'row',
        }}
      >
        {layout.views.map((v, index) => (
          <Fragment key={v}>
            <div
              className="h-full min-h-0 min-w-0 overflow-hidden"
              style={{
                flexBasis: `${layout.ratios[index] ?? 0}%`,
                flexGrow: 0,
                flexShrink: 1,
              }}
            >
              {renderView(v)}
            </div>
            {index < layout.views.length - 1 && (
              <ResizeHandle
                orientation={layout.layout}
                containerRef={containerRef}
                onShift={(deltaPct) =>
                  onLayoutChange(shiftRatio(layout, index, deltaPct))
                }
                onReset={() => onLayoutChange(equalizeRatios(layout))}
              />
            )}
          </Fragment>
        ))}
      </div>

      {!drawerOpen && (
        <Button
          className="absolute bottom-6 right-6 z-10 gap-2 shadow-lg"
          onPress={() => openNewTask()}
        >
          <i className="fa-solid fa-plus" />
          Nova tarefa
        </Button>
      )}

      {selectedTask && (
        <TaskDrawer
          open={drawerOpen}
          onOpenChange={closeDrawer}
          task={selectedTask}
          projectId={activeProjectId}
          projects={projects}
          creator={{
            currentUserId: user!.id,
            createTask: tasksApi.createTask,
            updateTask: tasksApi.updateTask,
            deleteTask: tasksApi.deleteTask,
            moveTaskStatus: tasksApi.moveTaskStatus,
            childrenOf: tasksApi.childrenOf,
            refreshTasks,
          }}
        />
      )}

      <NewTaskModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={projects}
        initialProjectId={activeProjectId}
        initialStartDate={createStartDate}
        currentUserId={user!.id}
        onCreate={handleCreateNewTask}
      />
    </div>
  )
}