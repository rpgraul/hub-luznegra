import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Gantt from 'frappe-gantt'
import '@/assets/frappe-gantt.css'
import { toast, Button } from '@heroui/react'
import { userColor } from '@/utils/colors'
import { todayIso, formatDate } from '@/utils/format'
import type { Project, Task, TaskPriority, TaskStatus } from '@/types/database'

interface GanttViewProps {
  tasks: Task[]
  projects?: Project[]
  onOpenTask: (task: Task) => void
  updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
  moveTaskStatus?: (args: { id: string; status: TaskStatus }) => Promise<unknown>
}

const BAR_HEIGHT = 24
const PADDING = 12
const ROW_HEIGHT = BAR_HEIGHT + PADDING // 36px
const UPPER_HEADER_HEIGHT = 28
const LOWER_HEADER_HEIGHT = 28
const HEADER_HEIGHT = UPPER_HEADER_HEIGHT + LOWER_HEADER_HEIGHT // 56px

interface ZoomConfig {
  name: string
  label: string
  shortLabel: string
  view_mode: Gantt.viewMode
  column_width: number
  snap_at: string
}

const ZOOM_CONFIGS: ZoomConfig[] = [
  {
    name: 'Day-Detail',
    label: 'Dia (Detalhado)',
    shortLabel: 'Dia +',
    view_mode: 'Day',
    column_width: 44,
    snap_at: '1d',
  },
  {
    name: 'Day',
    label: 'Dia',
    shortLabel: 'Dia',
    view_mode: 'Day',
    column_width: 34,
    snap_at: '1d',
  },
  {
    name: 'Week',
    label: 'Semana',
    shortLabel: 'Semana',
    view_mode: 'Week',
    column_width: 56,
    snap_at: '1d',
  },
  {
    name: 'Month',
    label: 'Mês',
    shortLabel: 'Mês',
    view_mode: 'Month',
    column_width: 86,
    snap_at: '1d',
  },
  {
    name: 'Year',
    label: 'Ano',
    shortLabel: 'Ano',
    view_mode: 'Year',
    column_width: 110,
    snap_at: '1d',
  },
]

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'A Fazer',
  in_progress: 'Em Andamento',
  review: 'Revisão',
  done: 'Concluído',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: '#64748b',
  todo: '#0284c7',
  in_progress: '#7c3aed',
  review: '#a855f7',
  done: '#10b981',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(isoStr: string): Date {
  const [year, month, day] = isoStr.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function addDaysLocal(isoStr: string, days: number): string {
  const d = parseLocalDate(isoStr)
  d.setDate(d.getDate() + days)
  return formatLocalDate(d)
}

function diffDaysLocal(startIso: string, endIso: string): number {
  const d1 = parseLocalDate(startIso).getTime()
  const d2 = parseLocalDate(endIso).getTime()
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}

export default function GanttView({
  tasks,
  projects = [],
  onOpenTask,
  updateTask,
  moveTaskStatus,
}: GanttViewProps) {
  const [zoomIndex, setZoomIndex] = useState(2) // Default: Week
  const [showTable, setShowTable] = useState(true)

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )
  const wrapperRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const ganttInstanceRef = useRef<Gantt | null>(null)
  const lastZoomRef = useRef<string | null>(null)
  const isSyncingScroll = useRef(false)
  const isInteractingRef = useRef(false)
  const pendingChangeRef = useRef<{
    taskId: string
    start: string
    due: string
  } | null>(null)

  const currentZoom = ZOOM_CONFIGS[zoomIndex]
  const today = todayIso()

  const rows = useMemo(() => {
    const byParent = new Map<string | null, Task[]>()
    const allIds = new Set(tasks.map((t) => t.id))

    // Group tasks by parent_id
    for (const t of tasks) {
      const pId = t.parent_id && allIds.has(t.parent_id) ? t.parent_id : null
      const list = byParent.get(pId) || []
      list.push(t)
      byParent.set(pId, list)
    }

    const result: Array<{
      task: Task
      undated: boolean
      depth: number
      hasChildren: boolean
      isSubtask: boolean
    }> = []

    function traverse(pId: string | null, depth: number) {
      const children = byParent.get(pId) || []
      for (const task of children) {
        const undated = !task.start_date && !task.due_date
        const childList = byParent.get(task.id) || []
        const hasChildren = childList.length > 0
        const isSubtask = depth > 0

        result.push({
          task,
          undated,
          depth,
          hasChildren,
          isSubtask,
        })

        traverse(task.id, depth + 1)
      }
    }

    traverse(null, 0)
    return result
  }, [tasks])

  const ganttTasks = useMemo(
    () =>
      rows.map(({ task, undated, isSubtask }) => {
        const start = task.start_date ?? today
        const end = task.due_date
          ? addDaysLocal(task.due_date, 1)
          : addDaysLocal(task.start_date ?? today, 1)

        let progress = 0
        let isOverdue = false

        if (task.status === 'done') {
          progress = 100
        } else if (task.due_date && today > task.due_date) {
          isOverdue = true
          progress = 100
        } else if (task.start_date && task.due_date) {
          const totalDays = Math.max(1, diffDaysLocal(task.start_date, task.due_date) + 1)
          if (today >= task.start_date) {
            const elapsedDays = diffDaysLocal(task.start_date, today) + 1
            progress = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)))
          }
        }

        let customClass = ''
        if (isSubtask) {
          if (task.status === 'done') {
            customClass = 'gantt-subtask-done'
          } else if (isOverdue) {
            customClass = 'gantt-subtask-overdue'
          } else if (undated) {
            customClass = 'gantt-subtask-undated'
          } else {
            customClass = 'gantt-subtask-bar'
          }
        } else {
          if (task.status === 'done') {
            customClass = 'gantt-done'
          } else if (isOverdue) {
            customClass = 'gantt-overdue'
          } else if (undated) {
            customClass = 'gantt-undated'
          }
        }

        const taskTitle = isSubtask
          ? `↳ ${task.title}`
          : task.status === 'done'
            ? `✓ ${task.title}`
            : task.title

        return {
          id: task.id,
          name: taskTitle.length > 35 ? `${taskTitle.slice(0, 34)}…` : taskTitle,
          start,
          end,
          progress,
          dependencies: task.parent_id ? [task.parent_id] : undefined,
          custom_class: customClass,
          color:
            task.status === 'done'
              ? '#10b981'
              : isOverdue
                ? '#f43f5e'
                : task.assigned_to
                  ? userColor(task.assigned_to)
                  : STATUS_COLORS[task.status] || '#7b68ee',
        }
      }),
    [rows, today],
  )

  // Commit pending date changes after user finishes dragging
  const commitPendingDateChange = useCallback(() => {
    if (!pendingChangeRef.current) return
    const { taskId, start: nextStart, due: nextDue } = pendingChangeRef.current
    pendingChangeRef.current = null

    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    if (task.start_date === nextStart && task.due_date === nextDue) return

    const oldStart = task.start_date ?? today
    const deltaDays = diffDaysLocal(oldStart, nextStart)

    const promises: Promise<unknown>[] = [
      updateTask({
        id: task.id,
        patch: { start_date: nextStart, due_date: nextDue },
      }),
    ]

    // Cascade Parent -> Children
    const directChildren = tasks.filter((t) => t.parent_id === task.id)
    if (directChildren.length > 0 && deltaDays !== 0) {
      for (const child of directChildren) {
        const childPatch: Partial<Task> = {}
        if (child.start_date) {
          childPatch.start_date = addDaysLocal(child.start_date, deltaDays)
        }
        if (child.due_date) {
          childPatch.due_date = addDaysLocal(child.due_date, deltaDays)
        }
        if (Object.keys(childPatch).length > 0) {
          promises.push(updateTask({ id: child.id, patch: childPatch }))
        }
      }
    }

    // Cascade Child -> Parent
    if (task.parent_id) {
      const parentTask = tasks.find((t) => t.id === task.parent_id)
      if (parentTask) {
        let parentStart = parentTask.start_date
        let parentDue = parentTask.due_date
        let parentChanged = false

        if (!parentStart || nextStart < parentStart) {
          parentStart = nextStart
          parentChanged = true
        }
        if (!parentDue || nextDue > parentDue) {
          parentDue = nextDue
          parentChanged = true
        }

        if (parentChanged) {
          promises.push(
            updateTask({
              id: parentTask.id,
              patch: { start_date: parentStart, due_date: parentDue },
            }),
          )
        }
      }
    }

    void Promise.all(promises)
      .then(() => {
        toast.success(
          directChildren.length > 0 && deltaDays !== 0
            ? `Tarefa e ${directChildren.length} subtarefa(s) atualizadas!`
            : 'Prazos atualizados!',
        )
      })
      .catch(() => toast.danger('Erro ao salvar as alterações de prazo.'))
  }, [tasks, today, updateTask])

  // Global mouse up listener on window
  useEffect(() => {
    function handleWindowMouseUp() {
      if (isInteractingRef.current) {
        isInteractingRef.current = false
        commitPendingDateChange()
      }
    }

    window.addEventListener('mouseup', handleWindowMouseUp)
    window.addEventListener('pointerup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp)
      window.removeEventListener('pointerup', handleWindowMouseUp)
    }
  }, [commitPendingDateChange])

  // Synchronize vertical scroll between table and timeline
  useEffect(() => {
    const tableEl = tableRef.current
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const ganttContainer = wrapper.querySelector('.gantt-container') as HTMLElement | null

    if (!tableEl || !ganttContainer) return

    function onTableScroll() {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      ganttContainer!.scrollTop = tableEl!.scrollTop
      requestAnimationFrame(() => {
        isSyncingScroll.current = false
      })
    }

    function onGanttScroll() {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      tableEl!.scrollTop = ganttContainer!.scrollTop
      requestAnimationFrame(() => {
        isSyncingScroll.current = false
      })
    }

    tableEl.addEventListener('scroll', onTableScroll, { passive: true })
    ganttContainer.addEventListener('scroll', onGanttScroll, { passive: true })

    return () => {
      tableEl.removeEventListener('scroll', onTableScroll)
      ganttContainer.removeEventListener('scroll', onGanttScroll)
    }
  }, [showTable])

  // Scroll timeline to today
  const scrollToToday = useCallback((smooth = true) => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const container = wrapper.querySelector('.gantt-container') as HTMLElement | null
    if (!container) return

    const todayEl = container.querySelector(
      '.current-highlight, .current-ball-highlight',
    ) as HTMLElement | null

    if (todayEl) {
      const targetLeft = Math.max(0, todayEl.offsetLeft - 120)
      container.scrollTo({
        left: targetLeft,
        behavior: smooth ? 'smooth' : 'auto',
      })
      return
    }

    if (ganttInstanceRef.current) {
      try {
        const instance = ganttInstanceRef.current as unknown as {
          scroll_current?: () => void
        }
        instance.scroll_current?.()
      } catch {
        // ignore
      }
    }
  }, [])

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.max(0, prev - 1))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomIndex((prev) => Math.min(ZOOM_CONFIGS.length - 1, prev + 1))
  }, [])

  // Toggle Done status
  const handleToggleDone = useCallback(
    (task: Task) => {
      const isDone = task.status === 'done'
      const nextStatus: TaskStatus = isDone ? 'todo' : 'done'

      if (moveTaskStatus) {
        void moveTaskStatus({ id: task.id, status: nextStatus })
          .then(() =>
            toast.success(
              isDone ? 'Tarefa reaberta.' : 'Tarefa concluída com sucesso!',
            ),
          )
          .catch(() => toast.danger('Erro ao alterar status da tarefa.'))
      } else {
        void updateTask({ id: task.id, patch: { status: nextStatus } })
          .then(() =>
            toast.success(
              isDone ? 'Tarefa reaberta.' : 'Tarefa concluída com sucesso!',
            ),
          )
          .catch(() => toast.danger('Erro ao alterar status da tarefa.'))
      }
    },
    [moveTaskStatus, updateTask],
  )

  // Initialize and update Gantt smoothly
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    if (ganttTasks.length === 0) {
      wrapper.innerHTML = ''
      ganttInstanceRef.current = null
      lastZoomRef.current = null
      return
    }

    // If user is actively dragging, do not refresh or destroy Gantt
    if (isInteractingRef.current) return

    const tasksById = new Map(rows.map(({ task }) => [task.id, task]))
    const undatedById = new Map(
      rows.map(({ task, undated }) => [task.id, undated]),
    )

    const isZoomChange = lastZoomRef.current !== currentZoom.name

    // If instance exists and zoom didn't change, perform in-place refresh without destroying DOM
    if (ganttInstanceRef.current && !isZoomChange) {
      try {
        ganttInstanceRef.current.refresh(ganttTasks)
        return
      } catch {
        // fallback to full recreate if refresh fails
      }
    }

    lastZoomRef.current = currentZoom.name
    wrapper.innerHTML = ''

    const gantt = new Gantt(wrapper, ganttTasks, {
      view_mode: currentZoom.view_mode,
      column_width: currentZoom.column_width,
      snap_at: '1d',
      language: 'pt',
      date_format: 'YYYY-MM-DD',
      bar_height: BAR_HEIGHT,
      padding: PADDING,
      upper_header_height: UPPER_HEADER_HEIGHT,
      lower_header_height: LOWER_HEADER_HEIGHT,
      today_button: false,
      readonly_progress: true,
      popup_on: 'hover',
      popup: (gTask) => {
        const task = tasksById.get(String(gTask.id))
        if (!task) return ''
        const undated = undatedById.get(String(gTask.id))
        const statusLabel = STATUS_LABELS[task.status] || task.status
        const priorityLabel = PRIORITY_LABELS[task.priority] || task.priority
        const statusColor = STATUS_COLORS[task.status] || '#64748b'

        const dateRange = undated
          ? '<span style="color:#eab308;font-weight:600;">Sem prazos definidos (arraste para definir)</span>'
          : `<span>${formatDate(task.start_date ?? today)} → ${formatDate(task.due_date ?? task.start_date ?? today)}</span>`

        let durationHtml = ''
        if (task.start_date && task.due_date) {
          const totalDays = Math.max(1, diffDaysLocal(task.start_date, task.due_date) + 1)
          if (task.status === 'done') {
            durationHtml = `<div style="margin-top:3px;font-size:11px;color:#10b981;font-weight:600;"><i class="fa-solid fa-check"></i> Tarefa Concluída (${totalDays} dias)</div>`
          } else if (today > task.due_date) {
            const overdueDays = diffDaysLocal(task.due_date, today)
            durationHtml = `<div style="margin-top:3px;font-size:11px;color:#f43f5e;font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Atrasada há ${overdueDays} dia(s) (Total: ${totalDays} dias)</div>`
          } else if (today >= task.start_date) {
            const elapsed = diffDaysLocal(task.start_date, today) + 1
            const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)))
            const remaining = totalDays - elapsed
            durationHtml = `
              <div style="margin-top:3px;font-size:11px;color:var(--g-text-dark);">
                Tempo decorrido: <strong>${pct}%</strong> (Dia ${elapsed} de ${totalDays}) • Faltam ${remaining} dia(s)
              </div>
            `
          } else {
            const daysUntilStart = diffDaysLocal(today, task.start_date)
            durationHtml = `<div style="margin-top:3px;font-size:11px;color:var(--g-text-muted);">Inicia em ${daysUntilStart} dia(s) • Duração: ${totalDays} dias</div>`
          }
        }

        const tagsHtml = (task.tags ?? []).length > 0
          ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${task.tags!.map((tag) => `<span style="padding:1px 5px;border-radius:4px;font-size:9px;font-weight:600;background-color:#7b68ee18;color:#7b68ee;border:1px solid #7b68ee30;">#${tag}</span>`).join('')}</div>`
          : ''

        return `
          <div class="gantt-popup" style="font-family: inherit; min-width: 220px; line-height: 1.4;">
            <div style="font-weight:700;font-size:12px;margin-bottom:4px;color:var(--g-text-dark);">${task.title}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;background-color:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">
                ${statusLabel}
              </span>
              <span style="font-size:10px;color:var(--g-text-muted);">
                • Prioridade: ${priorityLabel}
              </span>
            </div>
            <div style="font-size:11px;color:var(--g-text-dark);margin-bottom:3px;">
              ${dateRange}
            </div>
            ${durationHtml}
            ${tagsHtml}
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--g-border-color);font-size:10px;color:var(--g-text-muted);display:flex;align-items:center;justify-content:space-between;">
              <span><i class="fa-solid fa-arrow-pointer" style="margin-right:3px;"></i> Duplo clique para detalhes</span>
            </div>
          </div>
        `
      },
      on_date_change: (gTask, start, end) => {
        isInteractingRef.current = true
        const nextStart = formatLocalDate(start)
        const nextDue = addDaysLocal(formatLocalDate(end), -1)
        pendingChangeRef.current = {
          taskId: String(gTask.id),
          start: nextStart,
          due: nextDue,
        }
      },
    })

    ganttInstanceRef.current = gantt

    function handleTimelineMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (target?.closest('.bar-wrapper, .handle')) {
        isInteractingRef.current = true
      }
    }

    function handleDoubleClick(event: MouseEvent) {
      const target = event.target as Element | null
      const bar = target?.closest?.('.bar-wrapper[data-id]')
      const id = bar?.getAttribute('data-id')
      if (!id) return
      const task = tasksById.get(id)
      if (task) onOpenTask(task)
    }

    wrapper.addEventListener('mousedown', handleTimelineMouseDown)
    wrapper.addEventListener('dblclick', handleDoubleClick)

    const timer = setTimeout(() => {
      scrollToToday(false)
    }, 60)

    return () => {
      clearTimeout(timer)
      wrapper.removeEventListener('mousedown', handleTimelineMouseDown)
      wrapper.removeEventListener('dblclick', handleDoubleClick)
      if (gantt) {
        gantt.clear()
        gantt.unselect_all()
      }
      wrapper.innerHTML = ''
      ganttInstanceRef.current = null
      lastZoomRef.current = null
    }
  }, [ganttTasks, rows, currentZoom, onOpenTask, scrollToToday, today])

  // Zoom & Horizontal Timeline Wheel listener
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    let lastZoomTime = 0

    function handleWheel(e: WheelEvent) {
      const container = wrapper?.querySelector('.gantt-container') as HTMLElement | null

      if (e.ctrlKey || e.metaKey) {
        // Ctrl + Scroll: Zoom in / Zoom out
        e.preventDefault()
        const now = Date.now()
        if (now - lastZoomTime < 140) return
        lastZoomTime = now

        if (e.deltaY < 0) {
          handleZoomIn()
        } else if (e.deltaY > 0) {
          handleZoomOut()
        }
      } else if (container) {
        // Normal Scroll: Move horizontally along the timeline
        e.preventDefault()
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        container.scrollLeft += delta
      }
    }

    wrapper.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      wrapper.removeEventListener('wheel', handleWheel)
    }
  }, [handleZoomIn, handleZoomOut])

  function handleDateChange(
    task: Task,
    field: 'start_date' | 'due_date',
    value: string,
  ) {
    const next = value || null
    const nextStart = field === 'start_date' ? next : task.start_date
    const nextDue = field === 'due_date' ? next : task.due_date
    if (nextStart && nextDue && nextStart > nextDue) {
      toast.danger('A data de início não pode ser depois da conclusão.')
      return
    }

    const promises: Promise<unknown>[] = [
      updateTask({ id: task.id, patch: { [field]: next } }),
    ]

    if (task.parent_id && next) {
      const parentTask = tasks.find((t) => t.id === task.parent_id)
      if (parentTask) {
        let parentStart = parentTask.start_date
        let parentDue = parentTask.due_date
        let parentChanged = false

        if (field === 'start_date' && (!parentStart || next < parentStart)) {
          parentStart = next
          parentChanged = true
        }
        if (field === 'due_date' && (!parentDue || next > parentDue)) {
          parentDue = next
          parentChanged = true
        }
        if (parentChanged) {
          promises.push(
            updateTask({
              id: parentTask.id,
              patch: { start_date: parentStart, due_date: parentDue },
            }),
          )
        }
      }
    }

    void Promise.all(promises)
      .then(() => toast.success('Data atualizada.'))
      .catch(() => toast.danger('Não foi possível salvar a data.'))
  }

  function handleStatusChange(task: Task, nextStatus: TaskStatus) {
    if (task.status === nextStatus) return
    if (moveTaskStatus) {
      void moveTaskStatus({ id: task.id, status: nextStatus })
        .then(() =>
          toast.success(`Status alterado para ${STATUS_LABELS[nextStatus]}`),
        )
        .catch(() => toast.danger('Erro ao alterar status.'))
    } else {
      void updateTask({ id: task.id, patch: { status: nextStatus } })
        .then(() =>
          toast.success(`Status alterado para ${STATUS_LABELS[nextStatus]}`),
        )
        .catch(() => toast.danger('Erro ao alterar status.'))
    }
  }

  const undatedCount = rows.filter(({ undated }) => undated).length

  return (
    <div className="flex h-full min-h-0 flex-col bg-background select-none">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/40 px-4 py-2 text-xs backdrop-blur">
        {/* Left Side: Stats & Toggle Table */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showTable ? 'secondary' : 'outline'}
            className="h-7 gap-1.5 px-2.5 text-xs font-medium"
            onPress={() => setShowTable(!showTable)}
          >
            <i
              className={`fa-solid ${showTable ? 'fa-table-columns' : 'fa-table'} text-xs`}
            />
            <span>{showTable ? 'Ocultar Tabela' : 'Mostrar Tabela'}</span>
          </Button>

          <span className="text-[11px] text-muted-foreground font-medium">
            {rows.length} tarefa{rows.length !== 1 ? 's' : ''}
          </span>

          {undatedCount > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <i className="fa-regular fa-clock" />
              {undatedCount} sem prazo
            </span>
          )}
        </div>

        {/* Right Side: Zoom Controls & Today Button */}
        <div className="flex items-center gap-2">
          {/* Zoom Buttons & Mode Selector */}
          <div className="flex items-center rounded-lg border border-border bg-background/80 p-0.5 shadow-2xs">
            <button
              type="button"
              aria-label="Aumentar Zoom (Ctrl + Scroll para cima)"
              title="Aumentar Zoom (Ctrl + Scroll para cima)"
              disabled={zoomIndex === 0}
              onClick={handleZoomIn}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <i className="fa-solid fa-magnifying-glass-plus text-[11px]" />
            </button>

            <div className="mx-1 h-3.5 w-px bg-border" />

            <div className="flex items-center gap-0.5 px-1">
              {ZOOM_CONFIGS.map((cfg, idx) => (
                <button
                  key={cfg.name}
                  type="button"
                  title={`Visualização em ${cfg.label}`}
                  onClick={() => setZoomIndex(idx)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                    zoomIndex === idx
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {cfg.shortLabel}
                </button>
              ))}
            </div>

            <div className="mx-1 h-3.5 w-px bg-border" />

            <button
              type="button"
              aria-label="Diminuir Zoom (Ctrl + Scroll para baixo)"
              title="Diminuir Zoom (Ctrl + Scroll para baixo)"
              disabled={zoomIndex === ZOOM_CONFIGS.length - 1}
              onClick={handleZoomOut}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <i className="fa-solid fa-magnifying-glass-minus text-[11px]" />
            </button>
          </div>

          {/* Today Button */}
          <Button
            size="sm"
            variant="outline"
            aria-label="Rolar a linha do tempo para Hoje"
            className="h-7 gap-1.5 border-primary/40 bg-primary/5 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10"
            onPress={() => scrollToToday(true)}
          >
            <i className="fa-solid fa-calendar-day text-xs" />
            <span>Hoje</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area: Left Table + Gantt SVG */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full w-full overflow-hidden">
          {/* Collapsible Left Table with comfortable fit and no horizontal scroll */}
          {showTable && (
            <div
              ref={tableRef}
              className="w-[740px] max-w-[55vw] shrink-0 overflow-y-auto overflow-x-hidden border-r border-border bg-background select-text pb-8"
            >
              <table className="w-full table-fixed border-collapse text-xs">
                <thead>
                  <tr
                    className="sticky top-0 z-20 border-b border-border bg-slate-100 dark:bg-slate-800"
                    style={{ height: HEADER_HEIGHT }}
                  >
                    <th className="w-8 px-1 text-center font-bold text-slate-800 dark:text-slate-100">
                      <i className="fa-solid fa-check text-[11px]" title="Concluir" />
                    </th>
                    <th className="px-2 text-left font-bold text-slate-800 dark:text-slate-100">
                      Tarefa & Tags
                    </th>
                    <th className="w-28 px-1.5 text-left font-bold text-slate-800 dark:text-slate-100">
                      Status
                    </th>
                    <th className="w-32 px-1.5 text-left font-bold text-slate-800 dark:text-slate-100">
                      Início
                    </th>
                    <th className="w-32 px-1.5 pr-2 text-left font-bold text-slate-800 dark:text-slate-100">
                      Fim
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-4 text-center text-muted-foreground"
                      >
                        Nenhuma tarefa encontrada.
                      </td>
                    </tr>
                  ) : (
                    rows.map(({ task, undated, depth, hasChildren, isSubtask }) => {
                      const isDone = task.status === 'done'
                      const isOverdue = !isDone && task.due_date && today > task.due_date

                      const project = task.project_id ? projectById.get(task.project_id) : null
                      const projectColor = project?.color || '#7b68ee'
                      const rowBg = task.project_id
                        ? `${projectColor}14` // ~8% de opacidade para fundo suave
                        : undefined

                      return (
                        <tr
                          key={task.id}
                          onDoubleClick={() => onOpenTask(task)}
                          className={`group cursor-default border-b border-border/50 transition hover:brightness-95 dark:hover:brightness-110 ${
                            isDone ? 'opacity-70' : ''
                          }`}
                          style={{
                            height: ROW_HEIGHT,
                            backgroundColor: rowBg,
                          }}
                        >
                          {/* Quick Toggle Done Checkbox */}
                          <td className="w-8 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleToggleDone(task)}
                              title={isDone ? 'Reabrir tarefa' : 'Marcar como concluída'}
                              className="flex size-5 mx-auto items-center justify-center rounded-full text-muted-foreground transition hover:scale-110 hover:text-emerald-600 focus:outline-none"
                            >
                              {isDone ? (
                                <i className="fa-solid fa-circle-check text-emerald-500 text-sm" />
                              ) : (
                                <i className="fa-regular fa-circle text-muted-foreground/60 group-hover:text-foreground text-xs" />
                              )}
                            </button>
                          </td>

                          {/* Title & Tags (2 clicks to open) */}
                          <td className="px-2 overflow-hidden">
                            <div
                              onDoubleClick={() => onOpenTask(task)}
                              title={`${task.title}\n(Duplo clique para abrir detalhes)`}
                              style={{ paddingLeft: `${depth * 14}px` }}
                              className="flex flex-col w-full text-left transition select-none min-w-0"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isSubtask ? (
                                  <span className="text-muted-foreground/70 text-[11px] font-bold shrink-0 select-none">
                                    ↳
                                  </span>
                                ) : hasChildren ? (
                                  <i className="fa-solid fa-folder-tree text-[10px] text-primary shrink-0" />
                                ) : (
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full shadow-2xs"
                                    style={{
                                      backgroundColor: isDone
                                        ? '#10b981'
                                        : isOverdue
                                            ? '#f43f5e'
                                            : task.assigned_to
                                              ? userColor(task.assigned_to)
                                              : STATUS_COLORS[task.status],
                                    }}
                                  />
                                )}
                                <span
                                  className={`truncate ${
                                    isSubtask ? 'font-normal text-xs text-foreground/90' : 'font-semibold text-xs text-foreground'
                                  } ${
                                    isDone
                                      ? 'line-through text-muted-foreground'
                                      : isOverdue
                                          ? 'text-rose-600 font-semibold'
                                          : ''
                                  }`}
                                >
                                  {task.title}
                                </span>
                                {isSubtask && (
                                  <span className="shrink-0 rounded bg-muted/90 px-1 py-0.2 text-[8px] font-medium text-muted-foreground border border-border/50">
                                    sub
                                  </span>
                                )}
                                {undated && (
                                  <span className="shrink-0 rounded border border-dashed border-amber-500/50 bg-amber-500/10 px-1 text-[8px] font-semibold leading-tight text-amber-600 dark:text-amber-400">
                                    sem prazo
                                  </span>
                                )}
                                {isOverdue && (
                                  <span className="shrink-0 rounded border border-rose-500/30 bg-rose-500/10 px-1 text-[8px] font-bold leading-tight text-rose-600">
                                    atrasada
                                  </span>
                                )}
                              </div>

                              {/* Tags under title */}
                              {(task.tags ?? []).length > 0 && (
                                <div
                                  className="flex flex-wrap gap-1 mt-0.5"
                                  style={{ paddingLeft: isSubtask ? '14px' : '10px' }}
                                >
                                  {task.tags!.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded bg-[#7b68ee]/10 px-1 text-[8px] font-semibold text-[#7b68ee]"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-1.5">
                            <select
                              value={task.status}
                              aria-label={`Status de ${task.title}`}
                              onChange={(e) =>
                                handleStatusChange(
                                  task,
                                  e.target.value as TaskStatus,
                                )
                              }
                              className="w-full cursor-pointer rounded-md border border-border/50 bg-background px-1.5 py-0.5 text-xs font-semibold shadow-2xs transition hover:border-border focus:border-primary focus:outline-none"
                              style={{
                                color: STATUS_COLORS[task.status],
                              }}
                            >
                              <option value="backlog">Backlog</option>
                              <option value="todo">A Fazer</option>
                              <option value="in_progress">Em Andamento</option>
                              <option value="review">Revisão</option>
                              <option value="done">Concluído</option>
                            </select>
                          </td>

                          {/* Start Date */}
                          <td className="px-1.5">
                            <input
                              type="date"
                              value={task.start_date ?? ''}
                              aria-label={`Início de ${task.title}`}
                              onChange={(e) =>
                                handleDateChange(
                                  task,
                                  'start_date',
                                  e.target.value,
                                )
                              }
                              className="w-full rounded-md border border-border/50 bg-background px-1.5 py-0.5 text-xs text-foreground shadow-2xs outline-none transition hover:border-border focus:border-primary"
                            />
                          </td>

                          {/* Due Date */}
                          <td className="px-1.5 pr-2">
                            <input
                              type="date"
                              value={task.due_date ?? ''}
                              aria-label={`Conclusão de ${task.title}`}
                              onChange={(e) =>
                                handleDateChange(task, 'due_date', e.target.value)
                              }
                              className={`w-full rounded-md border border-border/50 bg-background px-1.5 py-0.5 text-xs text-foreground shadow-2xs outline-none transition hover:border-border focus:border-primary ${
                                isOverdue ? 'border-rose-500/60 font-semibold text-rose-600' : ''
                              }`}
                            />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Gantt Timeline SVG Container */}
          <div
            className="relative min-w-0 flex-1 overflow-hidden pb-8"
            ref={wrapperRef}
          />
        </div>
      </div>

      {/* Shortcuts & Quick Tips Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/40 px-4 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs">
              Ctrl + Scroll
            </kbd>
            <span>Zoom na linha do tempo</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs">
              Arrastar barra
            </kbd>
            <span>Mover período (Pai move subtarefas)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs">
              Bordas da barra
            </kbd>
            <span>Ajustar início / fim dia a dia</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs">
              Duplo clique
            </kbd>
            <span>Abrir detalhes</span>
          </span>
        </div>

        <div>
          <span className="text-[10px] opacity-75">
            Modo:{' '}
            <strong className="text-foreground">{currentZoom.label}</strong>
          </span>
        </div>
      </div>
    </div>
  )
}