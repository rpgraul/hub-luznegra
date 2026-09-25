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
import { toast } from '@heroui/react'
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
  hideDoneTasks?: boolean
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
  hideDoneTasks = false,
  layout,
  onLayoutChange,
}: TaskWorkspaceProps) {
  const { user } = useAuth()
  const { preferences } = usePreferences()
  const queryClient = useQueryClient()
  const activeProjectId = preferences?.active_project_id ?? null

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  // Sinal para abrir o chat de comentários direto do badge nas listagens.
  const [chatKey, setChatKey] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createStartDate, setCreateStartDate] = useState<string | null>(null)
  // Modo foco: exibe apenas a tarefa escolhida + todas as suas subtarefas.
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)

  const tasksApi = useTasks(showAllTasks)
  const { tasks } = tasksApi
  const { memberOf } = useProjectMembers(activeProjectId)

  // Conjunto exibido: base (projeto + concluídas) ∩ modo foco.
  // No foco valem as duas regras abaixo:
  //  - a tarefa focada e TODOS os descendentes aparecem, inclusive concluídos
  //    (o foco serve justamente para ver a árvore inteira da tarefa);
  //  - o filtro de projeto deixa de valer, senão trocar/excluir o projeto
  //    esconderia a tarefa que o usuário está tentando focar.
  const visibleTasks = useMemo(() => {
    if (focusedTaskId) {
      const byParent = new Map<string | null, Task[]>()
      for (const task of tasks) {
        const list = byParent.get(task.parent_id) ?? []
        list.push(task)
        byParent.set(task.parent_id, list)
      }
      const focused: Task[] = []
      let level = byParent.get(focusedTaskId) ?? []
      let guard = 0
      while (level.length > 0 && guard < 20) {
        focused.push(...level)
        const next: Task[] = []
        for (const parent of level) {
          next.push(...(byParent.get(parent.id) ?? []))
        }
        level = next
        guard += 1
      }
      return focused
    }
    let list = tasks
    if (activeProjectId) {
      list = list.filter((task) => task.project_id === activeProjectId)
    }
    if (hideDoneTasks) {
      list = list.filter((task) => task.status !== 'done')
    }
    return list
  }, [tasks, activeProjectId, hideDoneTasks, focusedTaskId])

  const focusedTask = useMemo(
    () => (focusedTaskId ? tasks.find((t) => t.id === focusedTaskId) ?? null : null),
    [tasks, focusedTaskId],
  )
  const focusedSubtaskCount = useMemo(
    () => (focusedTaskId ? visibleTasks.length - 1 : 0),
    [focusedTaskId, visibleTasks],
  )

  // A tarefa focada sumiu (excluída ou removida do cache): encerra o foco.
  useEffect(() => {
    if (focusedTaskId && !focusedTask) {
      setFocusedTaskId(null)
    }
  }, [focusedTaskId, focusedTask])

  // Trocar de projeto descarta o foco (o contexto do foco era outro).
  const prevProjectRef = useRef<string | null>(activeProjectId)
  useEffect(() => {
    if (prevProjectRef.current !== activeProjectId) {
      prevProjectRef.current = activeProjectId
      setFocusedTaskId(null)
    }
  }, [activeProjectId])

  function toggleFocus(task: Task) {
    setFocusedTaskId((prev) => (prev === task.id ? null : task.id))
  }

  function exitFocus() {
    setFocusedTaskId(null)
  }

  // Esc encerra o modo foco.
  useEffect(() => {
    if (!focusedTaskId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const el = document.activeElement
        const tag = el?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement | null)?.isContentEditable) {
          return
        }
        setFocusedTaskId(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [focusedTaskId])

  useEffect(() => {
    if (!initialTaskId || !visibleTasks) return
    const task = visibleTasks.find((t) => t.id === initialTaskId)
    if (!task) return
    setSelectedTask(task)
    setDrawerOpen(true)
  }, [initialTaskId, visibleTasks])

  useEffect(() => {
    async function handleCustomOpenTask(e: Event) {
      const customEvent = e as CustomEvent<{ taskId: string }>
      const targetId = customEvent.detail?.taskId
      if (!targetId) return

      const found = tasks.find((t) => t.id === targetId)
      if (found) {
        setSelectedTask(found)
        setDrawerOpen(true)
        return
      }

      // Se não estiver na lista visível (ex: outro projeto ou filtro), busca via API
      try {
        const fetched = await tasksApi.getTask(targetId)
        if (fetched) {
          setSelectedTask(fetched)
          setDrawerOpen(true)
        }
      } catch {
        // ignora se não encontrar
      }
    }

    window.addEventListener('hub:open-task-drawer', handleCustomOpenTask)
    return () => {
      window.removeEventListener('hub:open-task-drawer', handleCustomOpenTask)
    }
  }, [tasks, tasksApi])

  // Badge de comentários nas listagens: abre o drawer já com o chat aberto.
  useEffect(() => {
    function handleCustomOpenChat(e: Event) {
      const targetId = (e as CustomEvent<{ taskId: string }>).detail?.taskId
      if (!targetId) return
      const found = tasks.find((t) => t.id === targetId)
      if (found) {
        setSelectedTask(found)
        setDrawerOpen(true)
        setChatKey(`${targetId}:${Date.now()}`)
      }
    }

    window.addEventListener('hub:open-task-chat', handleCustomOpenChat)
    return () => {
      window.removeEventListener('hub:open-task-chat', handleCustomOpenChat)
    }
  }, [tasks])

  function openTask(task: Task) {
    setSelectedTask(task)
    setDrawerOpen(true)
  }

  function openNewTask(start?: Date) {
    if (start) {
      const year = start.getFullYear()
      const month = String(start.getMonth() + 1).padStart(2, '0')
      const day = String(start.getDate()).padStart(2, '0')
      setCreateStartDate(`${year}-${month}-${day}`)
    } else {
      setCreateStartDate(null)
    }
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
        assignees: input.assignees.length > 0 ? input.assignees : null,
        start_date: input.start_date,
        due_date: input.due_date,
        estimated_hours: input.estimated_hours,
        description: input.description as unknown as Json,
        categories: input.categories.length > 0 ? input.categories : null,
      })

      for (const subtask of input.subtasks) {
        const subtaskTitle =
          typeof subtask === 'string' ? subtask : subtask.title
        const subtaskDueDate =
          typeof subtask === 'string' ? null : (subtask.due_date ?? null)
        await tasksApi.createTask({
          title: subtaskTitle,
          project_id: input.project_id,
          parent_id: parent.id,
          status: input.status,
          assigned_to: input.assigned_to,
          assignees: input.assignees.length > 0 ? input.assignees : null,
          due_date: subtaskDueDate,
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
            projects={projects}
            activeProjectId={activeProjectId}
            onOpenTask={openTask}
            updateTask={tasksApi.updateTask}
            moveTaskStatus={tasksApi.moveTaskStatus}
            createTask={tasksApi.createTask}
            deleteTask={tasksApi.deleteTask}
            reorderMany={tasksApi.reorderMany}
            currentUserId={user!.id}
            onFocusTask={toggleFocus}
            focusedTaskId={focusedTaskId}
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
            reorderMany={tasksApi.reorderMany}
            createTask={tasksApi.createTask}
            memberOf={memberOf}
          />
        )
      case 'lista':
        return (
          <ListView
            tasks={visibleTasks}
            projects={projects}
            grouped={!activeProjectId && !focusedTaskId}
            onOpenTask={openTask}
            memberOf={memberOf}
            moveTaskStatus={tasksApi.moveTaskStatus}
            updateTask={tasksApi.updateTask}
            deleteTask={tasksApi.deleteTask}
          />
        )
      case 'calendario':
        return (
          <CalendarView
            tasks={visibleTasks}
            projects={projects}
            memberOf={memberOf}
            onOpenTask={openTask}
            onSelectSlot={openNewTask}
            updateTask={tasksApi.updateTask}
          />
        )
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      {focusedTask && (
        <div className="flex shrink-0 items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-1.5 text-xs">
          <i className="fa-solid fa-bullseye shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-foreground">
              Focado em: {focusedTask.title}
            </span>
            {focusedSubtaskCount > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · {focusedSubtaskCount} subtarefa
                {focusedSubtaskCount !== 1 ? 's' : ''}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={exitFocus}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-primary/40 bg-background/70 px-2 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary/10"
          >
            <i className="fa-solid fa-xmark text-[10px]" />
            Sair do foco
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 overflow-hidden"
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

      {selectedTask && (
        <TaskDrawer
          open={drawerOpen}
          onOpenChange={closeDrawer}
          task={selectedTask}
          autoOpenChatKey={chatKey}
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