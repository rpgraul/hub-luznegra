import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import TaskDrawer from '@/components/tasks/TaskDrawer'
import KanbanView from '@/components/views/KanbanView'
import ListView from '@/components/views/ListView'
import GanttView from '@/components/views/GanttView'
import CalendarView from '@/components/views/CalendarView'
import { useAuth } from '@/hooks/useAuth'
import { usePreferences } from '@/hooks/usePreferences'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { useTasks } from '@/hooks/useTasks'
import type { Task } from '@/types/database'

interface TaskWorkspaceProps {
  initialTaskId?: string
}

export default function TaskWorkspace({ initialTaskId }: TaskWorkspaceProps) {
  const { user } = useAuth()
  const { preferences } = usePreferences()
  const activeProjectId = preferences?.active_project_id ?? null

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [draftStart, setDraftStart] = useState<string | null>(null)
  const [draftDue, setDraftDue] = useState<string | null>(null)

  const tasksApi = useTasks(activeProjectId)
  const { tasks } = tasksApi
  const { memberOf } = useProjectMembers(activeProjectId)

  useEffect(() => {
    if (!initialTaskId || !tasks) return
    const task = tasks.find((t) => t.id === initialTaskId)
    if (!task) return
    setSelectedTask(task)
    setDrawerOpen(true)
  }, [initialTaskId, tasks])

  function openTask(task: Task) {
    setSelectedTask(task)
    setDrawerOpen(true)
  }

  function openNewTask(start?: Date) {
    setSelectedTask(null)
    setDraftStart(start ? start.toISOString().slice(0, 10) : null)
    setDraftDue(null)
    setDrawerOpen(true)
  }

  function closeDrawer(open: boolean) {
    setDrawerOpen(open)
    if (!open) {
      setSelectedTask(null)
      setDraftStart(null)
      setDraftDue(null)
    }
  }

  const view = preferences?.default_view ?? 'gantt'

  if (!activeProjectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <i className="fa-solid fa-folder-open mb-3 text-3xl text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Selecione um projeto no topo para ver suas tarefas.
          </p>
        </div>
      </div>
    )
  }

  const contentClassName = `h-full transition-opacity duration-200 ${
    drawerOpen ? 'opacity-70' : ''
  }`

  return (
    <div className="relative h-full">
      <div className={contentClassName}>
        {view === 'gantt' && (
          <GanttView
            tasks={tasks}
            onOpenTask={openTask}
            updateTask={tasksApi.updateTask}
          />
        )}
        {view === 'kanban' && (
          <KanbanView
            tasks={tasks}
            projectId={activeProjectId}
            currentUserId={user!.id}
            onOpenTask={openTask}
            moveTaskStatus={tasksApi.moveTaskStatus}
            reorderTask={tasksApi.reorderTask}
            createTask={tasksApi.createTask}
          />
        )}
        {view === 'lista' && (
          <ListView
            tasks={tasks}
            onOpenTask={openTask}
            memberOf={memberOf}
            moveTaskStatus={tasksApi.moveTaskStatus}
            deleteTask={tasksApi.deleteTask}
          />
        )}
        {view === 'calendario' && (
          <CalendarView
            tasks={tasks}
            onOpenTask={openTask}
            onSelectSlot={openNewTask}
            updateTask={tasksApi.updateTask}
          />
        )}
      </div>

      {!drawerOpen && (
        <Button
          className="absolute bottom-6 right-6 z-10 gap-2 shadow-lg"
          onClick={() => openNewTask()}
        >
          <i className="fa-solid fa-plus" />
          Nova tarefa
        </Button>
      )}

      <TaskDrawer
        open={drawerOpen}
        onOpenChange={closeDrawer}
        task={selectedTask}
        projectId={activeProjectId}
        creator={{
          currentUserId: user!.id,
          createTask: async (input) => {
            const task = await tasksApi.createTask({
              ...input,
              start_date: draftStart,
              due_date: draftDue,
            })
            setSelectedTask(task)
            setDraftStart(null)
            setDraftDue(null)
            return task
          },
          updateTask: tasksApi.updateTask,
          deleteTask: tasksApi.deleteTask,
          moveTaskStatus: tasksApi.moveTaskStatus,
          childrenOf: tasksApi.childrenOf,
        }}
      />
    </div>
  )
}