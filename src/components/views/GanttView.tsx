import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Gantt from 'frappe-gantt'
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd'
import '@/assets/frappe-gantt.css'
import { toast, Button } from '@heroui/react'
import DateInput from '@/components/ui/DateInput'
import SubtaskModal from '@/components/tasks/SubtaskModal'
import StatusSelect from '@/components/tasks/StatusSelect'
import CategoryFilter from '@/components/tasks/CategoryFilter'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { userColor } from '@/utils/colors'
import { STATUS_COLORS, STATUS_LABELS } from '@/utils/status'
import { categoryColors, parseCategoriesText } from '@/utils/categories'
import { todayIso, formatDate } from '@/utils/format'
import type { Project, Task, TaskPriority, TaskStatus } from '@/types/database'
import type { NewTaskInput } from '@/lib/api/tasks'

interface GanttViewProps {
  tasks: Task[]
  projects?: Project[]
  activeProjectId?: string | null
  onOpenTask: (task: Task) => void
  updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
  moveTaskStatus?: (args: { id: string; status: TaskStatus }) => Promise<unknown>
  createTask?: (input: NewTaskInput) => Promise<Task>
  deleteTask?: (id: string) => Promise<unknown>
  reorderMany?: (orderedIds: string[]) => Promise<unknown>
  currentUserId?: string
}

const BAR_HEIGHT = 24
const PADDING = 12
const ROW_HEIGHT = BAR_HEIGHT + PADDING
const UPPER_HEADER_HEIGHT = 28
const LOWER_HEADER_HEIGHT = 28
const HEADER_HEIGHT = UPPER_HEADER_HEIGHT + LOWER_HEADER_HEIGHT

interface ZoomConfig {
  name: string
  label: string
  shortLabel: string
  view_mode: Gantt.viewMode
  column_width: number
  snap_at: string
}

const ZOOM_CONFIGS: ZoomConfig[] = [
  { name: 'Day-Detail', label: 'Dia (Detalhado)', shortLabel: 'Dia +', view_mode: 'Day', column_width: 44, snap_at: '1d' },
  { name: 'Day', label: 'Dia', shortLabel: 'Dia', view_mode: 'Day', column_width: 34, snap_at: '1d' },
  { name: 'Week', label: 'Semana', shortLabel: 'Semana', view_mode: 'Week', column_width: 56, snap_at: '1d' },
  { name: 'Month', label: 'Mês', shortLabel: 'Mês', view_mode: 'Month', column_width: 86, snap_at: '1d' },
  { name: 'Year', label: 'Ano', shortLabel: 'Ano', view_mode: 'Year', column_width: 110, snap_at: '1d' },
]

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

interface TaskRow {
  kind: 'task'
  task: Task
  undated: boolean
  depth: number
  hasChildren: boolean
  isSubtask: boolean
  childCount: number
}

interface AddSubtaskRow {
  kind: 'add-subtask'
  parentId: string
  depth: number
}

type GanttRow = TaskRow | AddSubtaskRow

function GanttCategoryCell({
  task,
  onSave,
}: {
  task: Task
  onSave: (categories: string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const categories = task.categories ?? []

  function commit() {
    setEditing(false)
    const next = parseCategoriesText(draft)
    // Mantém as existentes + adiciona as digitadas (remoção pelo Drawer/Lista)
    const merged = [...categories]
    for (const c of next) {
      if (!merged.includes(c)) merged.push(c)
    }
    if (merged.length !== categories.length) onSave(merged)
  }

  if (!editing) {
    return (
      <div
        onDoubleClick={(e) => {
          e.stopPropagation()
          setDraft('')
          setEditing(true)
        }}
        title={
          categories.length === 0
            ? '2 cliques para adicionar categoria (ex: ig, rpg)'
            : `${categories.join(', ')} (2 cliques para adicionar)`
        }
        className="flex max-w-full min-h-[20px] cursor-pointer flex-nowrap items-center gap-1 overflow-hidden"
      >
        {categories.length === 0 ? (
          <span className="text-[10px] italic text-muted-foreground/40">—</span>
        ) : (
          categories.map((cat) => {
            const colors = categoryColors(cat)
            return (
              <span
                key={cat}
                className="shrink-0 rounded border px-1 text-[8px] font-semibold leading-tight"
                style={{
                  color: colors.fg,
                  backgroundColor: colors.bg,
                  borderColor: colors.border,
                }}
              >
                {cat}
              </span>
            )
          })
        )}
      </div>
    )
  }

  return (
    <input
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          setEditing(false)
        }
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      placeholder="ig, rpg... (Enter)"
      className="w-full rounded border border-[#7b68ee] bg-background px-1 py-0.5 text-[10px] text-foreground focus:outline-none"
    />
  )
}

interface ContextMenuState {
  x: number
  y: number
  task: Task
}

export default function GanttView({
  tasks,
  projects = [],
  activeProjectId,
  onOpenTask,
  updateTask,
  moveTaskStatus,
  createTask,
  deleteTask,
  reorderMany,
  currentUserId,
}: GanttViewProps) {
  const [zoomIndex, setZoomIndex] = useState(2)
  const [showTable, setShowTable] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [subtaskModalParent, setSubtaskModalParent] = useState<Task | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  // Ordem local aplicada no instante do drop: a tabela reflete o arrasto
  // imediatamente, sem esperar o cache/servidor (evita o snap-back do DnD).
  // Limpa no settled/erro da mutação.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null)

  const { memberOf } = useProjectMembers(null)
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const ganttInstanceRef = useRef<Gantt | null>(null)
  const lastZoomRef = useRef<string | null>(null)
  const isSyncingScroll = useRef(false)
  const isInteractingRef = useRef(false)
  const pendingChangeRef = useRef<{ taskId: string; start: string; due: string } | null>(null)

  const currentZoom = ZOOM_CONFIGS[zoomIndex]
  const today = todayIso()

  const availableCategories = useMemo(() => {
    const set = new Set<string>()
    for (const t of tasks) {
      for (const cat of t.categories ?? []) set.add(cat)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [tasks])

  const filteredTasks = useMemo(() => {
    if (categoryFilter.length === 0) return tasks
    const selected = new Set(categoryFilter)
    return tasks.filter((t) => (t.categories ?? []).some((cat) => selected.has(cat)))
  }, [tasks, categoryFilter])

  // Build rows — respects expandedIds, sorted by order_index per level.
  // Enquanto há um arrasto pendente, a posição no pendingOrder prevalece
  // sobre order_index (cobre refetches parciais no meio do voo).
  const rows = useMemo<GanttRow[]>(() => {
    const byParent = new Map<string | null, Task[]>()
    const allIds = new Set(filteredTasks.map((t) => t.id))

    for (const t of filteredTasks) {
      const pId = t.parent_id && allIds.has(t.parent_id) ? t.parent_id : null
      const list = byParent.get(pId) || []
      list.push(t)
      byParent.set(pId, list)
    }
    const rank = pendingOrder ? new Map(pendingOrder.map((id, i) => [id, i])) : null
    const compare = (a: Task, b: Task): number => {
      if (rank) {
        const ra = rank.get(a.id)
        const rb = rank.get(b.id)
        if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb
      }
      return (
        a.order_index - b.order_index ||
        (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)
      )
    }
    for (const list of byParent.values()) {
      list.sort(compare)
    }

    const result: GanttRow[] = []

    function traverse(pId: string | null, depth: number) {
      const children = byParent.get(pId) || []
      for (const task of children) {
        const undated = !task.start_date && !task.due_date
        const childList = byParent.get(task.id) || []
        const hasChildren = childList.length > 0
        const isSubtask = depth > 0
        const isExpanded = expandedIds.has(task.id)

        result.push({ kind: 'task', task, undated, depth, hasChildren, isSubtask, childCount: childList.length })

        if (hasChildren && isExpanded) {
          traverse(task.id, depth + 1)
          result.push({ kind: 'add-subtask', parentId: task.id, depth: depth + 1 })
        }
      }
    }

    traverse(null, 0)
    return result
  }, [filteredTasks, expandedIds, pendingOrder])

  const taskRows = useMemo(() => rows.filter((r): r is TaskRow => r.kind === 'task'), [rows])

  const ganttTasks = useMemo(
    () =>
      taskRows.map(({ task, undated, isSubtask }) => {
        const rawStart = task.start_date ?? today
        const rawEnd = task.due_date ?? task.start_date ?? today
        let start = rawStart
        let end = rawEnd
        if (start > end) start = end
        const finalEnd = addDaysLocal(end, 1)

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
          if (task.status === 'done') customClass = 'gantt-subtask-done'
          else if (isOverdue) customClass = 'gantt-subtask-overdue'
          else if (undated) customClass = 'gantt-subtask-undated'
          else customClass = 'gantt-subtask-bar'
        } else {
          if (task.status === 'done') customClass = 'gantt-done'
          else if (isOverdue) customClass = 'gantt-overdue'
          else if (undated) customClass = 'gantt-undated'
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
          end: finalEnd,
          progress,
          dependencies: task.parent_id ? [task.parent_id] : undefined,
          custom_class: customClass,
          // A cor da barra representa o status da tarefa (fonte única: utils/status)
          color: STATUS_COLORS[task.status],
        }
      }),
    [taskRows, today],
  )

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-context-menu]')) setContextMenu(null)
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [contextMenu])

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
      updateTask({ id: task.id, patch: { start_date: nextStart, due_date: nextDue } }),
    ]

    const directChildren = tasks.filter((t) => t.parent_id === task.id)
    if (directChildren.length > 0 && deltaDays !== 0) {
      for (const child of directChildren) {
        const childPatch: Partial<Task> = {}
        if (child.start_date) childPatch.start_date = addDaysLocal(child.start_date, deltaDays)
        if (child.due_date) childPatch.due_date = addDaysLocal(child.due_date, deltaDays)
        if (Object.keys(childPatch).length > 0) promises.push(updateTask({ id: child.id, patch: childPatch }))
      }
    }

    if (task.parent_id) {
      const parentTask = tasks.find((t) => t.id === task.parent_id)
      if (parentTask) {
        let parentStart = parentTask.start_date
        let parentDue = parentTask.due_date
        let parentChanged = false

        if (!parentStart || nextStart < parentStart) { parentStart = nextStart; parentChanged = true }
        if (!parentDue || nextDue > parentDue) { parentDue = nextDue; parentChanged = true }

        if (parentChanged) {
          promises.push(updateTask({ id: parentTask.id, patch: { start_date: parentStart, due_date: parentDue } }))
        }
      }
    }

    void Promise.all(promises)
      .then(() => toast.success(directChildren.length > 0 && deltaDays !== 0 ? `Tarefa e ${directChildren.length} subtarefa(s) atualizadas!` : 'Prazos atualizados!'))
      .catch(() => toast.danger('Erro ao salvar as alterações de prazo.'))
  }, [tasks, today, updateTask])

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

  const scrollToToday = useCallback((smooth = true) => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const container = wrapper.querySelector('.gantt-container') as HTMLElement | null
    if (!container) return
    const todayEl = container.querySelector('.current-highlight, .current-ball-highlight') as HTMLElement | null
    if (todayEl) {
      const targetLeft = Math.max(0, todayEl.offsetLeft - 120)
      container.scrollTo({ left: targetLeft, behavior: smooth ? 'smooth' : 'auto' })
      return
    }
    if (ganttInstanceRef.current) {
      try {
        const instance = ganttInstanceRef.current as unknown as { scroll_current?: () => void }
        instance.scroll_current?.()
      } catch { /* ignore */ }
    }
  }, [])

  const handleZoomIn = useCallback(() => setZoomIndex((prev) => Math.max(0, prev - 1)), [])
  const handleZoomOut = useCallback(() => setZoomIndex((prev) => Math.min(ZOOM_CONFIGS.length - 1, prev + 1)), [])

  const handleToggleDone = useCallback(
    (task: Task) => {
      const isDone = task.status === 'done'
      const nextStatus: TaskStatus = isDone ? 'todo' : 'done'
      if (moveTaskStatus) {
        void moveTaskStatus({ id: task.id, status: nextStatus })
          .then(() => toast.success(isDone ? 'Tarefa reaberta.' : 'Tarefa concluída com sucesso!'))
          .catch(() => toast.danger('Erro ao alterar status da tarefa.'))
      } else {
        void updateTask({ id: task.id, patch: { status: nextStatus } })
          .then(() => toast.success(isDone ? 'Tarefa reaberta.' : 'Tarefa concluída com sucesso!'))
          .catch(() => toast.danger('Erro ao alterar status da tarefa.'))
      }
    },
    [moveTaskStatus, updateTask],
  )

  const handleToggleExpand = useCallback((taskId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }, [])

  function openSubtaskModal(parent: Task) {
    setContextMenu(null)
    setExpandedIds((prev) => new Set([...prev, parent.id]))
    setSubtaskModalParent(parent)
  }

  function handleContextMenu(e: React.MouseEvent, task: Task) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, task })
  }

  async function handleDuplicate(task: Task) {
    if (!createTask) return
    const pid = task.project_id ?? activeProjectId
    if (!pid) {
      toast.danger('Projeto não identificado para duplicação')
      return
    }
    setContextMenu(null)
    try {
      const newTask = await createTask({
        title: `${task.title} (Cópia)`,
        project_id: pid,
        parent_id: task.parent_id ?? null,
        status: task.status,
        priority: task.priority,
        assigned_to: task.assigned_to ?? null,
        start_date: task.start_date ?? null,
        due_date: task.due_date ?? null,
        estimated_hours: task.estimated_hours ?? null,
      })
      const directChildren = tasks.filter((t) => t.parent_id === task.id)
      if (directChildren.length > 0) {
        await Promise.all(
          directChildren.map((child) =>
            createTask({
              title: child.title,
              project_id: pid,
              parent_id: newTask.id,
              status: child.status,
              priority: child.priority,
              assigned_to: child.assigned_to ?? null,
              start_date: child.start_date ?? null,
              due_date: child.due_date ?? null,
            }),
          ),
        )
        toast.success(`Tarefa e ${directChildren.length} subtarefa(s) duplicadas!`)
      } else {
        toast.success('Tarefa duplicada!')
      }
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : 'Erro ao duplicar.')
    }
  }

  async function handleDelete(task: Task) {
    if (!deleteTask) return
    setContextMenu(null)
    try {
      await deleteTask(task.id)
      setExpandedIds((prev) => { const next = new Set(prev); next.delete(task.id); return next })
      toast.success('Tarefa excluída.')
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  // Refs vivas para os closures do Frappe (popup/dblclick): a instância do
  // timeline é criada uma vez por zoom e atualizada via refresh, então os
  // closures precisam enxergar os dados mais recentes sem recriar o SVG.
  const tasksByIdRef = useRef(new Map<string, Task>())
  const undatedByIdRef = useRef(new Map<string, boolean>())
  const todayRef = useRef(today)
  const onOpenTaskRef = useRef(onOpenTask)
  const ganttTasksRef = useRef(ganttTasks)
  tasksByIdRef.current = new Map(taskRows.map(({ task }) => [task.id, task]))
  undatedByIdRef.current = new Map(taskRows.map(({ task, undated }) => [task.id, undated]))
  todayRef.current = today
  onOpenTaskRef.current = onOpenTask
  ganttTasksRef.current = ganttTasks

  // Atualiza só as barras quando os dados mudam (reorder, status, datas).
  // Não destrói o SVG nem mexe no scroll — por isso não há flick no timeline.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    if (ganttTasks.length === 0) {
      wrapper.innerHTML = ''
      ganttInstanceRef.current = null
      lastZoomRef.current = null
      return
    }
    if (isInteractingRef.current) return
    const instance = ganttInstanceRef.current
    if (!instance) return
    if (lastZoomRef.current !== currentZoom.name) return
    try {
      instance.refresh(ganttTasks)
    } catch { /* a recriação do efeito de init cobre a falha */ }
  }, [ganttTasks, currentZoom.name])

  // Initialize Gantt — recria apenas ao trocar de zoom ou mostrar/ocultar tabela
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    if (ganttTasksRef.current.length === 0) {
      wrapper.innerHTML = ''
      ganttInstanceRef.current = null
      lastZoomRef.current = null
      return
    }

    if (isInteractingRef.current) return

    lastZoomRef.current = currentZoom.name
    wrapper.innerHTML = ''

    const gantt = new Gantt(wrapper, ganttTasksRef.current, {
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
        const task = tasksByIdRef.current.get(String(gTask.id))
        if (!task) return ''
        const undated = undatedByIdRef.current.get(String(gTask.id))
        const todayValue = todayRef.current
        const statusLabel = STATUS_LABELS[task.status] || task.status
        const priorityLabel = PRIORITY_LABELS[task.priority] || task.priority
        const statusColor = STATUS_COLORS[task.status] || '#64748b'

        const dateRange = undated
          ? '<span style="color:#eab308;font-weight:600;">Sem prazos definidos (arraste para definir)</span>'
          : `<span>${formatDate(task.start_date ?? todayValue)} → ${formatDate(task.due_date ?? task.start_date ?? todayValue)}</span>`

        let durationHtml = ''
        if (task.start_date && task.due_date) {
          const totalDays = Math.max(1, diffDaysLocal(task.start_date, task.due_date) + 1)
          if (task.status === 'done') {
            durationHtml = `<div style="margin-top:3px;font-size:11px;color:#10b981;font-weight:600;"><i class="fa-solid fa-check"></i> Tarefa Concluída (${totalDays} dias)</div>`
          } else if (todayValue > task.due_date) {
            const overdueDays = diffDaysLocal(task.due_date, todayValue)
            durationHtml = `<div style="margin-top:3px;font-size:11px;color:#f43f5e;font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Atrasada há ${overdueDays} dia(s) (Total: ${totalDays} dias)</div>`
          } else if (todayValue >= task.start_date) {
            const elapsed = diffDaysLocal(task.start_date, todayValue) + 1
            const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)))
            const remaining = totalDays - elapsed
            durationHtml = `<div style="margin-top:3px;font-size:11px;color:var(--g-text-dark);">Tempo decorrido: <strong>${pct}%</strong> (Dia ${elapsed} de ${totalDays}) • Faltam ${remaining} dia(s)</div>`
          } else {
            const daysUntilStart = diffDaysLocal(todayValue, task.start_date)
            durationHtml = `<div style="margin-top:3px;font-size:11px;color:var(--g-text-muted);">Inicia em ${daysUntilStart} dia(s) • Duração: ${totalDays} dias</div>`
          }
        }

        const tagsHtml = (task.tags ?? []).length > 0
          ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${task.tags!.map((tag) => `<span style="padding:1px 5px;border-radius:4px;font-size:9px;font-weight:600;background-color:#7b68ee18;color:#7b68ee;border:1px solid #7b68ee30;">#${tag}</span>`).join('')}</div>`
          : ''

        const categoriesHtml = (task.categories ?? []).length > 0
          ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${task.categories!.map((cat) => `<span style="padding:1px 5px;border-radius:4px;font-size:9px;font-weight:600;background-color:#0d948818;color:#0f766e;border:1px solid #0d948830;">${cat}</span>`).join('')}</div>`
          : ''

        return `
          <div class="gantt-popup" style="font-family:inherit;min-width:220px;line-height:1.4;">
            <div style="font-weight:700;font-size:12px;margin-bottom:4px;color:var(--g-text-dark);">${task.title}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;background-color:${statusColor}20;color:var(--status-ink);border:1px solid ${statusColor}40;">${statusLabel}</span>
              <span style="font-size:10px;color:var(--g-text-muted);">• Prioridade: ${priorityLabel}</span>
            </div>
            <div style="font-size:11px;color:var(--g-text-dark);margin-bottom:3px;">${dateRange}</div>
            ${durationHtml}
            ${tagsHtml}
            ${categoriesHtml}
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--g-border-color);font-size:10px;color:var(--g-text-muted);">
              <i class="fa-solid fa-arrow-pointer" style="margin-right:3px;"></i> Duplo clique para detalhes &nbsp;|&nbsp; <i class="fa-solid fa-computer-mouse" style="margin-right:3px;"></i> Clique direito para opções
            </div>
          </div>
        `
      },
      on_date_change: (gTask, start, end) => {
        isInteractingRef.current = true
        const nextStart = formatLocalDate(start)
        const nextDue = addDaysLocal(formatLocalDate(end), -1)
        pendingChangeRef.current = { taskId: String(gTask.id), start: nextStart, due: nextDue }
      },
    })

    ganttInstanceRef.current = gantt

    function handleTimelineMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (target?.closest('.bar-wrapper, .handle')) isInteractingRef.current = true
    }

    function handleDoubleClick(event: MouseEvent) {
      const target = event.target as Element | null
      const bar = target?.closest?.('.bar-wrapper[data-id]')
      const id = bar?.getAttribute('data-id')
      if (!id) return
      const task = tasksByIdRef.current.get(id)
      if (task) onOpenTaskRef.current(task)
    }

    const ganttContainer = wrapper.querySelector('.gantt-container') as HTMLElement | null
    if (ganttContainer) {
      ganttContainer.style.height = ''
      ganttContainer.style.maxHeight = '100%'
    }

    function onTableScroll() {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      const gContainer = wrapperRef.current?.querySelector('.gantt-container') as HTMLElement | null
      if (gContainer && tableRef.current) gContainer.scrollTop = tableRef.current.scrollTop
      requestAnimationFrame(() => { isSyncingScroll.current = false })
    }

    function onGanttScroll() {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      const gContainer = wrapperRef.current?.querySelector('.gantt-container') as HTMLElement | null
      if (tableRef.current && gContainer) tableRef.current.scrollTop = gContainer.scrollTop
      requestAnimationFrame(() => { isSyncingScroll.current = false })
    }

    const tableEl = tableRef.current
    if (tableEl) tableEl.addEventListener('scroll', onTableScroll, { passive: true })
    if (ganttContainer) {
      ganttContainer.addEventListener('scroll', onGanttScroll, { passive: true })
      if (tableEl) ganttContainer.scrollTop = tableEl.scrollTop
    }

    wrapper.addEventListener('mousedown', handleTimelineMouseDown)
    wrapper.addEventListener('dblclick', handleDoubleClick)

    const timer = setTimeout(() => scrollToToday(false), 60)

    return () => {
      clearTimeout(timer)
      if (tableEl) tableEl.removeEventListener('scroll', onTableScroll)
      if (ganttContainer) ganttContainer.removeEventListener('scroll', onGanttScroll)
      wrapper.removeEventListener('mousedown', handleTimelineMouseDown)
      wrapper.removeEventListener('dblclick', handleDoubleClick)
      if (gantt) { gantt.clear(); gantt.unselect_all() }
      wrapper.innerHTML = ''
      ganttInstanceRef.current = null
      lastZoomRef.current = null
    }
  }, [currentZoom, scrollToToday, showTable])

  // Zoom & Pan
  useEffect(() => {
    const wrapper = wrapperRef.current
    const table = tableRef.current
    if (!wrapper) return

    let lastZoomTime = 0
    let isPanning = false
    let startX = 0
    let startY = 0
    let scrollStartLeft = 0
    let scrollStartTop = 0

    function handleWheel(e: WheelEvent) {
      const container = wrapper?.querySelector('.gantt-container') as HTMLElement | null
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const now = Date.now()
        if (now - lastZoomTime < 140) return
        lastZoomTime = now
        if (e.deltaY < 0) handleZoomIn()
        else if (e.deltaY > 0) handleZoomOut()
      } else if (e.shiftKey) {
        if (container) { e.preventDefault(); container.scrollLeft += e.deltaY || e.deltaX }
      }
    }

    function handleMouseDown(e: MouseEvent) {
      if (e.button === 1 || (e.button === 0 && (e.altKey || e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        e.stopPropagation()
        const container = wrapper?.querySelector('.gantt-container') as HTMLElement | null
        isPanning = true
        startX = e.clientX
        startY = e.clientY
        scrollStartLeft = container ? container.scrollLeft : 0
        scrollStartTop = table ? table.scrollTop : 0
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }
    }

    function handleMouseMove(e: MouseEvent) {
      if (!isPanning) return
      e.preventDefault()
      const container = wrapper?.querySelector('.gantt-container') as HTMLElement | null
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (container) { container.scrollLeft = scrollStartLeft - dx; container.scrollTop = scrollStartTop - dy }
      if (table) table.scrollTop = scrollStartTop - dy
    }

    function handleMouseUp(e: MouseEvent) {
      if (isPanning && (e.button === 1 || e.button === 0)) {
        isPanning = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    function handleAuxClick(e: MouseEvent) {
      if (e.button === 1) e.preventDefault()
    }

    wrapper.addEventListener('wheel', handleWheel, { passive: false })
    wrapper.addEventListener('mousedown', handleMouseDown)
    wrapper.addEventListener('auxclick', handleAuxClick)
    window.addEventListener('mousemove', handleMouseMove, { passive: false })
    window.addEventListener('mouseup', handleMouseUp)
    if (table) {
      table.addEventListener('wheel', handleWheel, { passive: false })
      table.addEventListener('mousedown', handleMouseDown)
      table.addEventListener('auxclick', handleAuxClick)
    }

    return () => {
      wrapper.removeEventListener('wheel', handleWheel)
      wrapper.removeEventListener('mousedown', handleMouseDown)
      wrapper.removeEventListener('auxclick', handleAuxClick)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      if (table) {
        table.removeEventListener('wheel', handleWheel)
        table.removeEventListener('mousedown', handleMouseDown)
        table.removeEventListener('auxclick', handleAuxClick)
      }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [handleZoomIn, handleZoomOut])

  function handleDateChange(task: Task, field: 'start_date' | 'due_date', value: string) {
    const next = value || null
    const nextStart = field === 'start_date' ? next : task.start_date
    const nextDue = field === 'due_date' ? next : task.due_date
    if (nextStart && nextDue && nextStart > nextDue) {
      toast.danger('A data de início não pode ser depois da conclusão.')
      return
    }
    const promises: Promise<unknown>[] = [updateTask({ id: task.id, patch: { [field]: next } })]
    if (task.parent_id && next) {
      const parentTask = tasks.find((t) => t.id === task.parent_id)
      if (parentTask) {
        let parentStart = parentTask.start_date
        let parentDue = parentTask.due_date
        let parentChanged = false
        if (field === 'start_date' && (!parentStart || next < parentStart)) { parentStart = next; parentChanged = true }
        if (field === 'due_date' && (!parentDue || next > parentDue)) { parentDue = next; parentChanged = true }
        if (parentChanged) promises.push(updateTask({ id: parentTask.id, patch: { start_date: parentStart, due_date: parentDue } }))
      }
    }
    void Promise.all(promises).then(() => toast.success('Data atualizada.')).catch(() => toast.danger('Não foi possível salvar a data.'))
  }

  function handleCategoriesChange(task: Task, categories: string[]) {
    void updateTask({ id: task.id, patch: { categories } })
      .then(() => toast.success('Categorias atualizadas.'))
      .catch(() => toast.danger('Não foi possível salvar as categorias.'))
  }

  // Índice do Draggable = posição em taskRows (linhas "add-subtask" são <tr>
  // simples e não participam do DnD).
  const taskIndexById = useMemo(
    () => new Map(taskRows.map(({ task }, index) => [task.id, index])),
    [taskRows],
  )

  function persistGlobalOrder(orderedIds: string[]) {
    const currentById = new Map(tasks.map((t) => [t.id, t.order_index]))
    const changed = orderedIds.some((id, index) => currentById.get(id) !== index)
    if (!changed) return
    // Reflete o drop na hora; o Realtime é suprimido durante o voo
    // (useTasks) então nenhum refetch parcial desfaz a UI.
    setPendingOrder(orderedIds)
    const persist = reorderMany
      ? reorderMany(orderedIds)
      : Promise.all(
          orderedIds.map((id, index) =>
            updateTask({ id, patch: { order_index: index } }),
          ),
        )
    // Arrastar é silencioso como no ClickUp/Trello: toast só em erro.
    void persist
      .then(() => setPendingOrder(null))
      .catch(() => {
        setPendingOrder(null)
        toast.danger('Erro ao salvar a nova ordem.')
      })
  }

  // Reconstrói a ordem global (0..N-1 sobre as tarefas visíveis) preservando
  // o agrupamento pai→filhos: a ordem relativa dentro de cada grupo é mantida
  // e só o grupo movido muda.
  function buildGlobalIds(
    topOrder: Task[],
    siblingOverride?: { parentId: string; siblings: Task[] },
  ): string[] {
    const byParent = new Map<string | null, Task[]>()
    for (const t of filteredTasks) {
      const key = t.parent_id ?? null
      const list = byParent.get(key) || []
      list.push(t)
      byParent.set(key, list)
    }
    for (const list of byParent.values()) {
      list.sort(
        (a, b) =>
          a.order_index - b.order_index ||
          (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0),
      )
    }
    if (siblingOverride) {
      byParent.set(siblingOverride.parentId, siblingOverride.siblings)
    }
    const ids: string[] = []
    function walk(parentId: string | null) {
      const children =
        parentId === null
          ? [...topOrder]
          : (byParent.get(parentId) || []).filter((t) => t.id !== parentId)
      for (const child of children) {
        ids.push(child.id)
        walk(child.id)
      }
    }
    walk(null)
    // Inclui por segurança tarefas órfãs que não entraram no walk
    for (const t of filteredTasks) {
      if (!ids.includes(t.id)) ids.push(t.id)
    }
    return ids
  }

  function isDescendantOf(task: Task, ancestorId: string, byId: Map<string, Task>): boolean {
    let cur = task.parent_id
    while (cur) {
      if (cur === ancestorId) return true
      cur = byId.get(cur)?.parent_id ?? null
    }
    return false
  }

  function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.index === destination.index) return

    const draggedRow = taskRows[source.index]
    if (!draggedRow || draggedRow.task.id !== draggableId) return
    const dragged = draggedRow.task

    const byId = new Map(filteredTasks.map((t) => [t.id, t]))

    if (draggedRow.depth === 0) {
      // Tarefa de topo: move entre os topos; filhos acompanham o pai no rebuild global
      const topLevel = taskRows
        .filter((r) => r.depth === 0)
        .map((r) => r.task)
        .filter((t) => t.id !== dragged.id)
      // Conta quantos topos existem antes do slot de destino na lista sem o arrastado
      const reducedTaskRows = taskRows.filter((r) => r.task.id !== dragged.id)
      let destPos = 0
      for (let i = 0; i < destination.index && i < reducedTaskRows.length; i++) {
        if (reducedTaskRows[i].depth === 0) destPos++
      }
      // Destino após o fim: anexa
      destPos = Math.min(destPos, topLevel.length)
      topLevel.splice(destPos, 0, dragged)
      persistGlobalOrder(buildGlobalIds(topLevel))
      return
    }

    // Subtarefa: só pode reordenar dentro do bloco do pai (em taskRows, sem placeholders)
    const parentId = dragged.parent_id
    if (!parentId) return
    const reducedTaskRows = taskRows.filter((r) => r.task.id !== dragged.id)
    const parentPos = reducedTaskRows.findIndex((r) => r.task.id === parentId)
    if (parentPos === -1) return
    let blockEnd = parentPos
    for (let i = parentPos + 1; i < reducedTaskRows.length; i++) {
      if (!isDescendantOf(reducedTaskRows[i].task, parentId, byId)) break
      blockEnd = i
    }
    // destination.index é na lista original (com o arrastado); converte para a reduzida
    const destInReduced =
      destination.index > source.index ? destination.index - 1 : destination.index
    if (destInReduced < parentPos || destInReduced > blockEnd) {
      toast.danger('Subtarefas só podem ser reordenadas dentro da tarefa pai.')
      return
    }
    const siblings = taskRows
      .filter((r) => r.task.parent_id === parentId)
      .map((r) => r.task)
      .filter((t) => t.id !== dragged.id)
    let destPos = 0
    for (let i = 0; i <= destInReduced && i < reducedTaskRows.length; i++) {
      if (reducedTaskRows[i].task.parent_id === parentId) destPos++
    }
    // Ajusta: se o slot está logo após o último sibling, destPos já conta certo;
    // garante limite
    destPos = Math.min(destPos, siblings.length)
    // Se o destino aponta para dentro do bloco mas antes de siblings (ex: no pai),
    // conta siblings anteriores — o loop acima já faz isso; se destPos ficou 0 e o
    // slot é após algum sibling, o loop corrige.
    siblings.splice(destPos, 0, dragged)
    const topOrder = taskRows
      .filter((r) => r.depth === 0)
      .map((r) => r.task)
    persistGlobalOrder(buildGlobalIds(topOrder, { parentId, siblings }))
  }

  function handleStatusChange(task: Task, nextStatus: TaskStatus) {    if (task.status === nextStatus) return
    if (moveTaskStatus) {
      void moveTaskStatus({ id: task.id, status: nextStatus })
        .then(() => toast.success(`Status alterado para ${STATUS_LABELS[nextStatus]}`))
        .catch(() => toast.danger('Erro ao alterar status.'))
    } else {
      void updateTask({ id: task.id, patch: { status: nextStatus } })
        .then(() => toast.success(`Status alterado para ${STATUS_LABELS[nextStatus]}`))
        .catch(() => toast.danger('Erro ao alterar status.'))
    }
  }

  const undatedCount = taskRows.filter(({ undated }) => undated).length

  return (
    <div className="flex h-full min-h-0 flex-col bg-background select-none">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/40 px-4 py-2 text-xs backdrop-blur">
        <div className="flex items-center gap-2">
          <Button size="sm" variant={showTable ? 'secondary' : 'outline'} className="h-7 gap-1.5 px-2.5 text-xs font-medium" onPress={() => setShowTable(!showTable)}>
            <i className={`fa-solid ${showTable ? 'fa-table-columns' : 'fa-table'} text-xs`} />
            <span>{showTable ? 'Ocultar Tabela' : 'Mostrar Tabela'}</span>
          </Button>
          <span className="text-[11px] text-muted-foreground font-medium">
            {taskRows.length} tarefa{taskRows.length !== 1 ? 's' : ''}
          </span>
          {undatedCount > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <i className="fa-regular fa-clock" />{undatedCount} sem prazo
            </span>
          )}
          <CategoryFilter
            available={availableCategories}
            selected={categoryFilter}
            onChange={setCategoryFilter}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-background/80 p-0.5 shadow-2xs">
            <button type="button" aria-label="Aumentar Zoom" title="Aumentar Zoom (Ctrl + Scroll para cima)" disabled={zoomIndex === 0} onClick={handleZoomIn} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30">
              <i className="fa-solid fa-magnifying-glass-plus text-[11px]" />
            </button>
            <div className="mx-1 h-3.5 w-px bg-border" />
            <div className="flex items-center gap-0.5 px-1">
              {ZOOM_CONFIGS.map((cfg, idx) => (
                <button key={cfg.name} type="button" title={`Visualização em ${cfg.label}`} onClick={() => setZoomIndex(idx)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${zoomIndex === idx ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                  {cfg.shortLabel}
                </button>
              ))}
            </div>
            <div className="mx-1 h-3.5 w-px bg-border" />
            <button type="button" aria-label="Diminuir Zoom" title="Diminuir Zoom (Ctrl + Scroll para baixo)" disabled={zoomIndex === ZOOM_CONFIGS.length - 1} onClick={handleZoomOut} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30">
              <i className="fa-solid fa-magnifying-glass-minus text-[11px]" />
            </button>
          </div>
          <Button size="sm" variant="outline" aria-label="Rolar para Hoje" className="h-7 gap-1.5 border-primary/40 bg-primary/5 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10" onPress={() => scrollToToday(true)}>
            <i className="fa-solid fa-calendar-day text-xs" />
            <span>Hoje</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full w-full overflow-hidden">
          {showTable && (
            <DragDropContext onDragEnd={handleDragEnd}>
            <div ref={tableRef} className="w-[880px] max-w-[62vw] shrink-0 overflow-y-auto overflow-x-hidden border-r border-border bg-background select-text pb-8">
              <table className="w-full table-fixed border-collapse text-xs">
                <thead>
                  <tr className="sticky top-0 z-20 border-b border-border bg-slate-100 dark:bg-slate-800" style={{ height: HEADER_HEIGHT }}>
                    <th className="w-8 px-1 text-center font-bold text-slate-800 dark:text-slate-100" title="Arrastar para reordenar"><i className="fa-solid fa-grip-vertical text-[10px] opacity-50" /><span className="sr-only">Reordenar</span></th>
                    <th className="w-8 px-1 text-center font-bold text-slate-800 dark:text-slate-100"><i className="fa-solid fa-check text-[11px]" title="Concluir" /></th>
                    <th className="px-2 text-left font-bold text-slate-800 dark:text-slate-100">Tarefa & Tags</th>
                    <th className="w-16 px-1.5 text-center font-bold text-slate-800 dark:text-slate-100">Resp.</th>
                    <th className="w-32 px-1.5 text-left font-bold text-slate-800 dark:text-slate-100">Status</th>
                    <th className="w-28 px-1.5 text-left font-bold text-slate-800 dark:text-slate-100">Categoria</th>
                    <th className="w-28 px-1.5 text-left font-bold text-slate-800 dark:text-slate-100">Início</th>
                    <th className="w-28 px-1.5 pr-2 text-left font-bold text-slate-800 dark:text-slate-100">Fim</th>
                  </tr>
                </thead>
                <Droppable droppableId="gantt-tabela">
                  {(dropProvided) => (
                <tbody ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
                  {rows.length === 0 ? (
                    <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">{categoryFilter.length > 0 ? 'Nenhuma tarefa com essa categoria.' : 'Nenhuma tarefa encontrada.'}</td></tr>
                  ) : (
                    rows.map((row) => {
                      // ---- Add-subtask row (abre o modal de subtarefa; fora do DnD) ----
                      if (row.kind === 'add-subtask') {
                        return (
                          <tr key={`add-${row.parentId}`} style={{ height: ROW_HEIGHT }} className="border-b border-border/30 cursor-pointer hover:bg-primary/5 group/addrow"
                            onClick={() => {
                              const parentTask = tasks.find((t) => t.id === row.parentId)
                              if (parentTask) openSubtaskModal(parentTask)
                            }}>
                            <td className="w-8 px-1" />
                            <td colSpan={7}>
                              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/50 group-hover/addrow:text-primary transition"
                                style={{ paddingLeft: `${row.depth * 14 + 8}px` }}>
                                <span className="flex size-4 items-center justify-center rounded border border-dashed border-muted-foreground/30 group-hover/addrow:border-primary/50 transition">
                                  <i className="fa-solid fa-plus text-[9px]" />
                                </span>
                                <span>Adicionar subtarefa</span>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      // ---- Normal task row ----
                      const { task, undated, depth, hasChildren, isSubtask } = row
                      const isDone = task.status === 'done'
                      const isOverdue = !isDone && !!task.due_date && today > task.due_date
                      const isExpanded = expandedIds.has(task.id)
                      const project = task.project_id ? projectById.get(task.project_id) : null
                      const projectColor = project?.color || '#7b68ee'
                      const rowBg = task.project_id ? `${projectColor}14` : undefined

                      return (
                        <Draggable key={task.id} draggableId={task.id} index={taskIndexById.get(task.id) ?? 0}>
                          {(dragProvided, snapshot) => (
                        <tr ref={dragProvided.innerRef} {...dragProvided.draggableProps} onDoubleClick={() => onOpenTask(task)} onContextMenu={(e) => handleContextMenu(e, task)}
                          className={`group cursor-default border-b border-border/50 transition hover:brightness-95 dark:hover:brightness-110 ${isDone ? 'opacity-70' : ''} ${snapshot.isDragging ? 'bg-primary/10 shadow-lg' : ''}`}
                          style={{ ...dragProvided.draggableProps.style as React.CSSProperties, height: ROW_HEIGHT, backgroundColor: rowBg }}>

                          {/* Drag handle */}
                          <td className="w-8 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                            <span
                              {...dragProvided.dragHandleProps}
                              title="Arrastar para reordenar"
                              className="inline-flex cursor-grab items-center justify-center rounded p-1 text-muted-foreground/50 transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                            >
                              <i className="fa-solid fa-grip-vertical text-[11px]" />
                            </span>
                          </td>

                          {/* Done checkbox */}
                          <td className="w-8 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => handleToggleDone(task)} title={isDone ? 'Reabrir tarefa' : 'Marcar como concluída'}
                              className="flex size-5 mx-auto items-center justify-center rounded-full text-muted-foreground transition hover:scale-110 hover:text-emerald-600 focus:outline-none">
                              {isDone
                                ? <i className="fa-solid fa-circle-check text-emerald-500 text-sm" />
                                : <i className="fa-regular fa-circle text-muted-foreground/60 group-hover:text-foreground text-xs" />}
                            </button>
                          </td>

                          {/* Title */}
                          <td className="px-2 overflow-hidden">
                            <div onDoubleClick={() => onOpenTask(task)} title={`${task.title}\n(Duplo clique para abrir • Clique direito para opções)`}
                              style={{ paddingLeft: `${depth * 14}px` }} className="flex flex-col w-full text-left transition select-none min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isSubtask ? (
                                  <span className="text-muted-foreground/70 text-[11px] font-bold shrink-0 select-none">↳</span>
                                ) : hasChildren ? (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleExpand(task.id) }}
                                    title={isExpanded ? 'Fechar subtarefas' : `Abrir subtarefas (${row.childCount})`}
                                    className="flex items-center justify-center shrink-0 size-4 rounded text-primary/70 hover:bg-primary/10 hover:text-primary transition">
                                    <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} text-[9px]`} />
                                  </button>
                                ) : null}
                                <span className={`truncate ${isSubtask ? 'font-normal text-xs text-foreground/90' : 'font-semibold text-xs text-foreground'} ${isDone ? 'line-through text-muted-foreground' : isOverdue ? 'text-rose-600 font-semibold' : ''}`}>
                                  {task.title}
                                </span>
                                {hasChildren && !isExpanded && (
                                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0 text-[8px] font-semibold text-primary border border-primary/20 leading-tight">
                                    {row.childCount}
                                  </span>
                                )}
                                {isSubtask && <span className="shrink-0 rounded bg-muted/90 px-1 py-0.2 text-[8px] font-medium text-muted-foreground border border-border/50">sub</span>}
                                {undated && <span className="shrink-0 rounded border border-dashed border-amber-500/50 bg-amber-500/10 px-1 text-[8px] font-semibold leading-tight text-amber-600 dark:text-amber-400">sem prazo</span>}
                                {isOverdue && <span className="shrink-0 rounded border border-rose-500/30 bg-rose-500/10 px-1 text-[8px] font-bold leading-tight text-rose-600">atrasada</span>}
                              </div>
                              {(task.tags ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5" style={{ paddingLeft: isSubtask ? '14px' : '10px' }}>
                                  {task.tags!.map((tag) => (
                                    <span key={tag} className="rounded bg-[#7b68ee]/10 px-1 text-[8px] font-semibold text-[#7b68ee]">#{tag}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Assignee */}
                          <td className="w-16 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center -space-x-1">
                              {(() => {
                                const assigneeIds = task.assignees && task.assignees.length > 0 ? task.assignees : task.assigned_to ? [task.assigned_to] : []
                                if (assigneeIds.length === 0) {
                                  return (
                                    <button type="button" onClick={() => onOpenTask(task)} title="Atribuir responsável"
                                      className="flex size-6 items-center justify-center rounded-full border border-dashed border-border/80 text-muted-foreground/50 hover:text-primary hover:border-primary transition cursor-pointer text-[9px]">
                                      <i className="fa-solid fa-plus text-[8px]" />
                                    </button>
                                  )
                                }
                                return assigneeIds.map((userId) => {
                                  const member = memberOf(userId)
                                  const displayName = member?.full_name || member?.username || 'Responsável'
                                  const initials = (member?.username || displayName || userId).slice(0, 2).toUpperCase()
                                  return (
                                    <button key={userId} type="button" onClick={() => onOpenTask(task)} title={displayName}
                                      className="flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-2xs transition hover:scale-115 hover:z-10 cursor-pointer ring-1.5 ring-background overflow-hidden"
                                      style={{ backgroundColor: userColor(userId) }}>
                                      {member?.avatar_url ? (
                                        <img src={member.avatar_url} alt={displayName} className="size-full object-cover" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none' }} />
                                      ) : initials}
                                    </button>
                                  )
                                })
                              })()}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="w-32 px-1.5">
                            <StatusSelect
                              value={task.status}
                              onChange={(s) => handleStatusChange(task, s)}
                              ariaLabel={`Status de ${task.title}`}
                              size="sm"
                            />
                          </td>

                          {/* Categories */}
                          <td className="px-1.5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <GanttCategoryCell
                              task={task}
                              onSave={(categories) => handleCategoriesChange(task, categories)}
                            />
                          </td>

                          {/* Start date */}
                          <td className="px-1.5">
                            <DateInput value={task.start_date ?? ''} ariaLabel={`Início de ${task.title}`}
                              onChange={(iso) => handleDateChange(task, 'start_date', iso)}
                              className="w-full rounded-md border border-border/50 bg-background px-1.5 py-0.5 text-xs text-foreground shadow-2xs outline-none transition hover:border-border focus:border-primary" />
                          </td>

                          {/* Due date */}
                          <td className="px-1.5 pr-2">
                            <DateInput value={task.due_date ?? ''} ariaLabel={`Conclusão de ${task.title}`}
                              onChange={(iso) => handleDateChange(task, 'due_date', iso)}
                              className={`w-full rounded-md border border-border/50 bg-background px-1.5 py-0.5 text-xs text-foreground shadow-2xs outline-none transition hover:border-border focus:border-primary ${isOverdue ? 'border-rose-500/60 font-semibold text-rose-600' : ''}`} />
                          </td>
                        </tr>
                          )}
                        </Draggable>
                      )
                    })
                  )}
                  {dropProvided.placeholder}
                </tbody>
                  )}
                </Droppable>
              </table>
            </div>
            </DragDropContext>
          )}

          {/* Gantt Timeline */}
          <div className="relative min-w-0 flex-1 overflow-hidden pb-8" ref={wrapperRef} />
        </div>
      </div>

      {/* Footer shortcuts */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/40 px-4 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs">Botão do Meio / Ctrl + Arraste</kbd>
            <span>Pan</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs">Ctrl + Scroll</kbd>
            <span>Zoom</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs">Duplo clique</kbd>
            <span>Abrir detalhes</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs">Clique direito</kbd>
            <span>Duplicar / Editar / Excluir</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs"><i className="fa-solid fa-chevron-right text-[9px]" /></kbd>
            <span>Expandir subtarefas</span>
          </span>
        </div>
        <div>
          <span className="text-[10px] opacity-75">Modo: <strong className="text-foreground">{currentZoom.label}</strong></span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div data-context-menu
          className="fixed z-[200] min-w-[180px] overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}>
          <div className="border-b border-border px-3 py-1.5">
            <p className="truncate text-[11px] font-semibold text-foreground max-w-[200px]">{contextMenu.task.title}</p>
            <p className="text-[10px] text-muted-foreground">{STATUS_LABELS[contextMenu.task.status]}</p>
          </div>

          <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground transition hover:bg-muted" onClick={() => { onOpenTask(contextMenu.task); setContextMenu(null) }}>
            <i className="fa-solid fa-pen-to-square w-3.5 text-center text-muted-foreground" /><span>Editar</span>
          </button>

          {createTask && (
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground transition hover:bg-muted" onClick={() => void handleDuplicate(contextMenu.task)}>
              <i className="fa-solid fa-copy w-3.5 text-center text-muted-foreground" /><span>Duplicar</span>
            </button>
          )}

          {createTask && (
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground transition hover:bg-muted"
              onClick={() => {
                const task = contextMenu.task
                openSubtaskModal(task)
              }}>
              <i className="fa-solid fa-plus w-3.5 text-center text-muted-foreground" /><span>Adicionar subtarefa</span>
            </button>
          )}

          {tasks.some((t) => t.parent_id === contextMenu.task.id) && (
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground transition hover:bg-muted"
              onClick={() => { handleToggleExpand(contextMenu.task.id); setContextMenu(null) }}>
              <i className={`fa-solid ${expandedIds.has(contextMenu.task.id) ? 'fa-chevron-up' : 'fa-chevron-down'} w-3.5 text-center text-muted-foreground`} />
              <span>{expandedIds.has(contextMenu.task.id) ? 'Fechar subtarefas' : 'Abrir subtarefas'}</span>
            </button>
          )}

          <div className="my-1 border-t border-border" />

          {deleteTask && (
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-destructive transition hover:bg-destructive/8" onClick={() => void handleDelete(contextMenu.task)}>
              <i className="fa-solid fa-trash w-3.5 text-center" /><span>Excluir</span>
            </button>
          )}
        </div>
      )}

      {/* Modal de nova subtarefa */}
      {createTask && (
        <SubtaskModal
          open={subtaskModalParent !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSubtaskModalParent(null)
          }}
          parent={subtaskModalParent}
          projects={projects}
          currentUserId={currentUserId ?? ''}
          createTask={createTask}
          onCreated={() => {
            toast.success('Subtarefa criada!')
          }}
        />
      )}
    </div>
  )
}
