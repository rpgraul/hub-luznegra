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
import SubtaskDateConflictModal from '@/components/tasks/SubtaskDateConflictModal'
import StatusSelect from '@/components/tasks/StatusSelect'
import CategoryFilter from '@/components/tasks/CategoryFilter'
import StatusFilter from '@/components/tasks/StatusFilter'
import TaskCommentsBadge from '@/components/tasks/TaskCommentsBadge'
import { useTaskCommentCounts } from '@/hooks/useTaskCommentCounts'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { userColor } from '@/utils/colors'
import { STATUS_COLORS, STATUS_LABELS } from '@/utils/status'
import { categoryColors, parseCategoriesText } from '@/utils/categories'
import { applyVisibleOrderToFull, filterTasksFamily } from '@/utils/taskFilter'
import {
  detectSubtaskConflict,
  extendParentToFitSubtask,
  fitSubtaskIntoParent,
  type SubtaskDateConflict,
} from '@/utils/subtaskDates'
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
  /** Abre o modo foco: exibe só a tarefa e suas subtarefas. */
  onFocusTask?: (task: Task) => void
  focusedTaskId?: string | null
}

const BAR_HEIGHT = 24
const PADDING = 12
const ROW_HEIGHT = BAR_HEIGHT + PADDING
const UPPER_HEADER_HEIGHT = 28
const LOWER_HEADER_HEIGHT = 28
const HEADER_HEIGHT = UPPER_HEADER_HEIGHT + LOWER_HEADER_HEIGHT
/**
 * A lib calcula `config.header_height = upper + lower + 10` e desenha as
 * faixas/barras do SVG a partir dessa altura. O thead da tabela (e o header
 * sticky da timeline) têm HEADER_HEIGHT (56) — para a linha N da tabela cair
 * exatamente sobre a faixa N da timeline, o header_height da lib também tem
 * que ser 56: compensamos o "+10" dela passando lower = 28 - 10 = 18.
 * (Os textos do header são elementos HTML posicionados a partir de `upper`,
 * que continua 28 — visual do header não muda.)
 */
const GANTT_LOWER_HEADER = LOWER_HEADER_HEIGHT - 10

/** Ordem "global" padrão: order_index, com created_at como desempate. */
function byOrderCreated(a: Task, b: Task): number {
  return (
    a.order_index - b.order_index ||
    (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)
  )
}

interface ZoomConfig {
  name: string
  label: string
  shortLabel: string
  /** View mode da lib: 'Day' | 'Week' | 'Month' | 'Year' (string na v1.2.2). */
  view_mode: string
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

interface DragHint {
  /** 'start' = ponta esquerda | 'due' = ponta direita | 'move' = barra inteira */
  mode: 'start' | 'due' | 'move'
  startIso: string
  dueIso: string
  x: number
  y: number
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
  onFocusTask,
  focusedTaskId = null,
}: GanttViewProps) {
  const [zoomIndex, setZoomIndex] = useState(2)
  const [showTable, setShowTable] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  // Tooltip de arraste: ao segurar a ponta (ou a barra) mostra a data de
  // início/fim; o on_date_change atualiza o valor ao vivo durante o arraste.
  const [dragHint, setDragHint] = useState<DragHint | null>(null)
  const dragOriginRef = useRef<{ taskId: string; mode: DragHint['mode']; start: string | null; due: string | null } | null>(null)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  // Conflito de datas (subtarefa fora da janela do pai) vindo do Gantt:
  // edição nas colunas Início/Fim ou drag da barra na timeline. Antes o pai
  // era estendido silenciosamente — agora as 3 opções decidem.
  const [dateConflict, setDateConflict] = useState<SubtaskDateConflict | null>(null)
  const [conflictBusy, setConflictBusy] = useState(false)
  const [conflictParentTitle, setConflictParentTitle] = useState('')
  const pendingConflictRef = useRef<{
    taskId: string
    parentId: string
    start: string | null
    due: string | null
    /** 'input' = coluna Início/Fim | 'drag' = arraste da barra na timeline */
    source: 'input' | 'drag'
    /** Só no drag: delta a aplicar nas filhas da subtarefa movida */
    deltaDays?: number
  } | null>(null)
  const [subtaskModalParent, setSubtaskModalParent] = useState<Task | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>([])
  // Trocar de projeto limpa o filtro de categoria: as categorias disponíveis
  // vêm das tarefas do projeto ativo — um filtro herdado de outro projeto
  // deixa a tela vazia E invisível (as chips nem renderizam pra poder
  // desmarcar). Reset junto é o comportamento menos confuso.
  useEffect(() => {
    setCategoryFilter([])
  }, [activeProjectId])
  // Ordem local aplicada no instante do drop: a tabela reflete o arrasto
  // imediatamente, sem esperar o cache/servidor (evita o snap-back do DnD).
  // Limpa no settled/erro da mutação.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null)

  const { memberOf } = useProjectMembers(null)
  const { counts: commentCounts } = useTaskCommentCounts()
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const ganttInstanceRef = useRef<Gantt | null>(null)
  const lastZoomRef = useRef<string | null>(null)
  const isSyncingScroll = useRef(false)
  const isInteractingRef = useRef(false)
  const pendingChangeRef = useRef<{ taskId: string; start: string; due: string } | null>(null)
  // Abre/fecha o menu de contexto por coords (usado também pelas barras).
  const openContextMenuRef = useRef<(x: number, y: number, task: Task) => void>(() => {})

  const currentZoom = ZOOM_CONFIGS[zoomIndex]
  const today = todayIso()

  const availableCategories = useMemo(() => {
    const set = new Set<string>()
    for (const t of tasks) {
      for (const cat of t.categories ?? []) set.add(cat)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [tasks])

  // Contagem por status sobre o que o filtro de categoria realmente exibe
  // (family-wise) — antes era filtro plano e as contagens divergiam do
  // que a tabela mostrava com o filtro ativo.
  const statusCounts = useMemo(() => {
    const base =
      categoryFilter.length === 0
        ? tasks
        : filterTasksFamily(tasks, (t) =>
            (t.categories ?? []).some((cat) => categoryFilter.includes(cat)),
          )
    const counts: Record<string, number> = {}
    for (const t of base) counts[t.status] = (counts[t.status] ?? 0) + 1
    return counts
  }, [tasks, categoryFilter])

  const filteredTasks = useMemo(() => {
    if (categoryFilter.length === 0 && statusFilter.length === 0) return tasks

    const byCategory = (t: Task) =>
      categoryFilter.length === 0 ||
      (t.categories ?? []).some((cat) => categoryFilter.includes(cat))
    const byStatus = (t: Task) =>
      statusFilter.length === 0 || statusFilter.includes(t.status)

    // Family-wise: quem casa mantém ANCESTRAIS (subtarefa que casa mostra o
    // pai — senão viraria raiz órfã) E DESCENDENTES (pai que casa continua
    // mostrando as subtarefas — antes elas SUMIAM com o filtro ativo).
    return filterTasksFamily(tasks, (t) => byCategory(t) && byStatus(t))
  }, [tasks, categoryFilter, statusFilter])

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

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const ganttTasks = useMemo(
    () =>
      // A timeline repete a MESMA ordem da tabela, incluindo as linhas
      // "Adicionar subtarefa": sem elas o Frappe empilha as barras e as linhas
      // de baixo saem deslocadas em relação à tabela.
      rows.flatMap((row) => {
        if (row.kind === 'add-subtask') {
          // Barra-fantasma: só reserva a linha da tabela na timeline.
          const parent = tasksById.get(row.parentId)
          const start = parent?.start_date ?? parent?.due_date ?? today
          const end = addDaysLocal(parent?.due_date ?? start, 1)
          return [
            {
              id: `add-${row.parentId}`,
              name: '',
              start,
              end,
              progress: 0,
              custom_class: 'gantt-addrow-spacer',
            },
          ]
        }
        const { task, undated, isSubtask } = row
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

        // Linha de dependência só é segura quando a subtarefa está contida na
        // janela do pai; fora disso o Frappe desenha barras invertidas/travava.
        const parentTask = task.parent_id ? tasksById.get(task.parent_id) : undefined
        const outsideParentWindow =
          !!parentTask &&
          ((!!parentTask.start_date && start < parentTask.start_date) ||
            (!!parentTask.due_date && end > addDaysLocal(parentTask.due_date, 1)))

        return [
          {
            id: task.id,
            name: taskTitle.length > 35 ? `${taskTitle.slice(0, 34)}…` : taskTitle,
            start,
            end: finalEnd,
            progress,
            dependencies:
              task.parent_id && !outsideParentWindow ? [task.parent_id] : undefined,
            custom_class: customClass,
            // A cor da barra representa o status da tarefa (fonte única: utils/status)
            color: STATUS_COLORS[task.status],
          },
        ]
      }),
    [rows, today, tasksById],
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

    // SUBTAREFA fora da janela do pai? Modal com as 3 opções ANTES de
    // qualquer save (as promises abaixo disparam na criação) — antes o
    // pai era estendido silenciosamente.
    if (task.parent_id) {
      const parentTask = tasks.find((t) => t.id === task.parent_id)
      if (parentTask) {
        const conflict = detectSubtaskConflict(
          { start_date: parentTask.start_date, due_date: parentTask.due_date },
          { start_date: nextStart, due_date: nextDue },
        )
        if (conflict) {
          pendingConflictRef.current = {
            taskId: task.id,
            parentId: task.parent_id,
            start: nextStart,
            due: nextDue,
            source: 'drag',
            deltaDays: diffDaysLocal(task.start_date ?? today, nextStart),
          }
          setConflictParentTitle(parentTask.title)
          setDateConflict(conflict)
          return
        }
      }
    }

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

    void Promise.all(promises)
      .then(() => toast.success(directChildren.length > 0 && deltaDays !== 0 ? `Tarefa e ${directChildren.length} subtarefa(s) atualizadas!` : 'Prazos atualizados!'))
      .catch(() => toast.danger('Erro ao salvar as alterações de prazo.'))
  }, [tasks, today, updateTask])

  // Cursor global (só ref, sem re-render) — posiciona o tooltip de arraste.
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [])

  useEffect(() => {
    function handleWindowMouseUp() {
      if (isInteractingRef.current) {
        isInteractingRef.current = false
        commitPendingDateChange()
      }
      dragOriginRef.current = null
      setDragHint(null)
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

  // Mesma coisa, porém a partir de um evento nativo (barras do Frappe).
  useEffect(() => {
    openContextMenuRef.current = (x, y, task) => setContextMenu({ x, y, task })
  }, [])

  /** Ativa o modo foco na tarefa (ou sai, se já for a focada). */
  function handleToggleFocus(task: Task) {
    if (!onFocusTask) return
    setContextMenu(null)
    setExpandedIds((prev) => new Set([...prev, task.id]))
    onFocusTask(task)
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

  // Sincronia vertical tabela <-> timeline (só refs, seguro em closures antigas).
  function syncGanttToTable() {
    if (isSyncingScroll.current) return
    isSyncingScroll.current = true
    const gContainer = wrapperRef.current?.querySelector('.gantt-container') as HTMLElement | null
    if (gContainer && tableRef.current) gContainer.scrollTop = tableRef.current.scrollTop
    requestAnimationFrame(() => { isSyncingScroll.current = false })
  }

  function syncTableToGantt() {
    if (isSyncingScroll.current) return
    isSyncingScroll.current = true
    const gContainer = wrapperRef.current?.querySelector('.gantt-container') as HTMLElement | null
    if (tableRef.current && gContainer) tableRef.current.scrollTop = gContainer.scrollTop
    requestAnimationFrame(() => { isSyncingScroll.current = false })
  }

  function destroyGanttInstance() {
    const instance = ganttInstanceRef.current
    ganttInstanceRef.current = null
    lastZoomRef.current = null
    if (instance) {
      try { instance.clear(); instance.unselect_all() } catch { /* ignore */ }
    }
  }

  // Destroys the timeline on unmount.
  useEffect(() => {
    return () => {
      destroyGanttInstance()
    }
  }, [])

  // Interop de clique no elemento estável do wrapper (sobrevive a innerHTML).
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    function handleTimelineMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target?.closest('.bar-wrapper, .handle')) return
      isInteractingRef.current = true
      // Tooltip de arraste: ao SEGURAR a ponta já mostra a data de início/fim
      // da tarefa; durante o arraste o on_date_change mantém o valor ao vivo.
      const bar = target.closest('.bar-wrapper[data-id]') as HTMLElement | null
      const id = bar?.getAttribute('data-id') ?? ''
      if (!id || id.startsWith('add-')) return
      const task = tasksByIdRef.current.get(id)
      if (!task) return
      const handleEl = (target.classList.contains('handle')
        ? target
        : (target.closest('.handle') as HTMLElement | null)) as HTMLElement | null
      const mode: DragHint['mode'] = handleEl?.classList.contains('left')
        ? 'start'
        : handleEl?.classList.contains('right')
          ? 'due'
          : 'move'
      dragOriginRef.current = {
        taskId: id,
        mode,
        start: task.start_date ?? null,
        due: task.due_date ?? null,
      }
      setDragHint({
        mode,
        startIso: task.start_date ?? '',
        dueIso: task.due_date ?? '',
        x: e.clientX,
        y: e.clientY,
      })
    }

    function handleDoubleClick(event: MouseEvent) {
      const target = event.target as Element | null
      const bar = target?.closest?.('.bar-wrapper[data-id]')
      const id = bar?.getAttribute('data-id')
      if (!id) return
      const task = tasksByIdRef.current.get(id)
      if (task) onOpenTaskRef.current(task)
    }

    // Clique direito na barra abre o mesmo menu da linha da tabela.
    function handleContextMenuNative(event: MouseEvent) {
      const target = event.target as Element | null
      const bar = target?.closest?.('.bar-wrapper[data-id]')
      const id = bar?.getAttribute('data-id')
      if (!id) return
      const task = tasksByIdRef.current.get(id)
      if (!task) return
      event.preventDefault()
      event.stopPropagation()
      openContextMenuRef.current(event.clientX, event.clientY, task)
    }

    wrapper.addEventListener('mousedown', handleTimelineMouseDown)
    wrapper.addEventListener('dblclick', handleDoubleClick)
    wrapper.addEventListener('contextmenu', handleContextMenuNative)
    return () => {
      wrapper.removeEventListener('mousedown', handleTimelineMouseDown)
      wrapper.removeEventListener('dblclick', handleDoubleClick)
      wrapper.removeEventListener('contextmenu', handleContextMenuNative)
    }
  }, [])

  // Scroll da tabela -> timeline. A tabela REMONTA ao alternar exibir/ocultar
  // (render condicional), então o listener precisa ser re-anexado no toggle —
  // com deps [] ele morria junto com o elemento antigo.
  useEffect(() => {
    const tableEl = tableRef.current
    if (!tableEl) return
    tableEl.addEventListener('scroll', syncGanttToTable, { passive: true })
    return () => {
      tableEl.removeEventListener('scroll', syncGanttToTable)
    }
  }, [showTable])

  // Scroll da timeline -> tabela. O `.gantt-container` é recriado a cada
  // rebuild da timeline, então o listener não pode viver nele: no caminho de
  // refresh (só os dados mudam) o antigo attach nunca era re-executado e a
  // tabela parava de seguir a timeline após a 1ª atualização de dados.
  // Em CAPTURE no wrapper — div estável, sempre montada — o scroll de
  // qualquer `.gantt-container` descendente é capturado (scroll não borbulha,
  // mas propaga na captura), sobrevivendo a rebuilds, refreshes e zoom.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    function onWrapperScroll(e: Event) {
      const target = e.target as HTMLElement | null
      if (!target?.classList.contains('gantt-container')) return
      syncTableToGantt()
    }
    wrapper.addEventListener('scroll', onWrapperScroll, { capture: true, passive: true })
    return () => {
      wrapper.removeEventListener('scroll', onWrapperScroll, { capture: true })
    }
  }, [])

  // Constrói o timeline na chegada dos dados / troca de zoom / tabela;
  // atualiza só as barras (refresh) quando só os dados mudam — sem flick.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    if (ganttTasks.length === 0) {
      wrapper.innerHTML = ''
      destroyGanttInstance()
      return
    }

    if (isInteractingRef.current) return

    let refreshed = false
    if (ganttInstanceRef.current && lastZoomRef.current === currentZoom.name) {
      try {
        // O refresh() re-renderiza e a lib volta o scroll horizontal para
        // "hoje" (set_scroll_position com scroll_to='today') — sem isso,
        // qualquer atualização de dados puxava a timeline de volta.
        const ganttContainer = wrapper.querySelector('.gantt-container') as HTMLElement | null
        const keepLeft = ganttContainer?.scrollLeft ?? 0
        ganttInstanceRef.current.refresh(ganttTasks)
        if (ganttContainer && ganttContainer.scrollLeft !== keepLeft) {
          ganttContainer.scrollLeft = keepLeft
        }
        refreshed = true
      } catch { /* queda para reconstrução abaixo */ }
    }
    if (refreshed) return
    destroyGanttInstance()
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
      lower_header_height: GANTT_LOWER_HEADER,
      today_button: false,
      // Infinite padding OFF: com ele, a lib anexa um handler de
      // "mousewheel" que dispara em QUALQUER scroll sobre a timeline (mesmo
      // vertical!), estende o período e re-renderiza o SVG inteiro pulando o
      // scrollLeft ~10 colunas — a coluna andava na horizontal junto com a
      // vertical, flickando e "mudando o mês". Sem infinite padding, o range
      // de datas é fixo (tarefas ± padding do view mode) e o wheel fica
      // vertical puro (horizontal só com Shift, como antes).
      infinite_padding: false,
      readonly_progress: true,
      popup_on: 'hover',
      popup: (g) => {
        // v1.2.2: o callback recebe um saco de opções {task, chart, ...} — a
        // tarefa real está em g.task. (Antes: gTask.id era undefined, caía no
        // return '' e TODO hover de barra abria um tooltip VAZIO. Com false a
        // lib nem abre o popup.)
        const ganttTaskId = String(g.task.id)
        const task = tasksByIdRef.current.get(ganttTaskId)
        if (!task) return false
        const undated = undatedByIdRef.current.get(ganttTaskId)
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
              <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;background-color:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${statusLabel}</span>
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
        const taskId = String(gTask.id)
        pendingChangeRef.current = { taskId, start: nextStart, due: nextDue }
        // Tooltip ao vivo: compara com as datas ORIGINAIS (capturadas no
        // mousedown) para saber qual ponta está se movendo e atualiza o
        // valor em tempo real enquanto arrasta.
        const origin = dragOriginRef.current
        if (!origin || origin.taskId !== taskId) return
        const startChanged = nextStart !== origin.start
        const dueChanged = nextDue !== origin.due
        const mode: DragHint['mode'] =
          startChanged && dueChanged ? 'move'
          : startChanged ? 'start'
          : dueChanged ? 'due'
          : origin.mode
        setDragHint({
          mode,
          startIso: nextStart,
          dueIso: nextDue,
          ...lastPointerRef.current,
        })
      },
    })

    ganttInstanceRef.current = gantt

    const ganttContainer = wrapper.querySelector('.gantt-container') as HTMLElement | null
    if (ganttContainer) {
      ganttContainer.style.height = ''
      ganttContainer.style.maxHeight = '100%'
    }

    const tableEl = tableRef.current
    // O listener de scroll (timeline -> tabela) agora vive no wrapper, em
    // fase de captura — ver efeito dedicado acima. Aqui só sincroniza a
    // posição vertical inicial após construir a timeline.
    if (ganttContainer && tableEl) ganttContainer.scrollTop = tableEl.scrollTop

    const timer = setTimeout(() => scrollToToday(false), 60)

    return () => {
      clearTimeout(timer)
    }
  }, [ganttTasks, currentZoom, scrollToToday, showTable])

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
    // SUBTAREFA fora da janela do pai? Modal com as 3 opções antes de
    // salvar — antes o pai era estendido silenciosamente.
    if (task.parent_id) {
      const parentTask = tasks.find((t) => t.id === task.parent_id)
      if (parentTask) {
        const conflict = detectSubtaskConflict(
          { start_date: parentTask.start_date, due_date: parentTask.due_date },
          { start_date: nextStart, due_date: nextDue },
        )
        if (conflict) {
          pendingConflictRef.current = {
            taskId: task.id,
            parentId: task.parent_id,
            start: nextStart ?? null,
            due: nextDue ?? null,
            source: 'input',
          }
          setConflictParentTitle(parentTask.title)
          setDateConflict(conflict)
          return
        }
      }
    }
    const promises: Promise<unknown>[] = [updateTask({ id: task.id, patch: { [field]: next } })]
    void Promise.all(promises).then(() => toast.success('Data atualizada.')).catch(() => toast.danger('Não foi possível salvar a data.'))
  }

  /** Opção 1 do modal: estende o período do pai para caber a subtarefa. */
  async function resolveConflictByParent() {
    const pending = pendingConflictRef.current
    if (!pending) return
    const parent = tasks.find((t) => t.id === pending.parentId)
    if (!parent) {
      cancelDateConflict()
      return
    }
    setConflictBusy(true)
    try {
      const nextParent = extendParentToFitSubtask(
        { start_date: parent.start_date, due_date: parent.due_date },
        { start_date: pending.start, due_date: pending.due },
      )
      const promises: Promise<unknown>[] = [
        updateTask({ id: pending.taskId, patch: { start_date: pending.start, due_date: pending.due } }),
      ]
      // Drag da barra inteira: as filhas da subtarefa acompanham o delta.
      if (pending.source === 'drag' && pending.deltaDays) {
        for (const child of tasks.filter((t) => t.parent_id === pending.taskId)) {
          const childPatch: Partial<Task> = {}
          if (child.start_date) childPatch.start_date = addDaysLocal(child.start_date, pending.deltaDays)
          if (child.due_date) childPatch.due_date = addDaysLocal(child.due_date, pending.deltaDays)
          if (Object.keys(childPatch).length > 0) promises.push(updateTask({ id: child.id, patch: childPatch }))
        }
      }
      if (nextParent.start_date !== parent.start_date || nextParent.due_date !== parent.due_date) {
        promises.push(updateTask({ id: parent.id, patch: { start_date: nextParent.start_date, due_date: nextParent.due_date } }))
      }
      await Promise.all(promises)
      toast.success('Período da tarefa principal ajustado para caber a subtarefa.')
      pendingConflictRef.current = null
      setDateConflict(null)
    } catch {
      toast.danger('Não foi possível salvar as alterações de prazo.')
    } finally {
      setConflictBusy(false)
    }
  }

  /** Opção 2 do modal: move a subtarefa para dentro da janela do pai. */
  async function resolveConflictBySubtask() {
    const pending = pendingConflictRef.current
    if (!pending) return
    const parent = tasks.find((t) => t.id === pending.parentId)
    if (!parent) {
      cancelDateConflict()
      return
    }
    setConflictBusy(true)
    try {
      const fitted = fitSubtaskIntoParent(
        { start_date: parent.start_date, due_date: parent.due_date },
        { start_date: pending.start, due_date: pending.due },
      )
      await updateTask({ id: pending.taskId, patch: { start_date: fitted.start_date, due_date: fitted.due_date } })
      toast.success('Subtarefa movida para o período da tarefa principal.')
      pendingConflictRef.current = null
      setDateConflict(null)
    } catch {
      toast.danger('Não foi possível salvar as alterações de prazo.')
    } finally {
      setConflictBusy(false)
    }
  }

  /** Opção 3: cancela e mantém como está (nada foi salvo). */
  function cancelDateConflict() {
    pendingConflictRef.current = null
    setDateConflict(null)
    // O drag moveu a barra visualmente; repõe na posição salva.
    try {
      ganttInstanceRef.current?.refresh(ganttTasksRef.current)
    } catch { /* noop */ }
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
      .catch((err) => {
        console.error('[hub:reorder] falha ao persistir ordem:', err)
        setPendingOrder(null)
        toast.danger('Erro ao salvar a nova ordem.')
      })
  }

  // Reconstrói a ordem global (0..N-1 sobre a lista COMPLETA de tarefas —
  // inclusive as ocultas pelo filtro) preservando o agrupamento pai→filhos:
  // a ordem relativa dentro de cada grupo é mantida e só o grupo movido muda.
  // Receber a lista completa (não a filtrada) é o que impede o filtro de
  // corromper os índices das tarefas ocultas durante um reorder.
  function buildGlobalIds(
    topOrder: Task[],
    siblingOverride?: { parentId: string; siblings: Task[] },
  ): string[] {
    const byParent = new Map<string | null, Task[]>()
    for (const t of tasks) {
      const key = t.parent_id ?? null
      const list = byParent.get(key) || []
      list.push(t)
      byParent.set(key, list)
    }
    for (const list of byParent.values()) {
      list.sort(byOrderCreated)
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
    for (const t of tasks) {
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
      const visibleTops = taskRows
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
      destPos = Math.min(destPos, visibleTops.length)
      visibleTops.splice(destPos, 0, dragged)
      // Ordem GLOBAL: permuta os slots dos topos VISÍVEIS dentro da lista
      // completa — as tarefas ocultas pelo filtro mantêm seus slots, então
      // renumerar 0..N daqui não corrompe a ordem de ninguém.
      const fullTops = tasks.filter((t) => !t.parent_id).sort(byOrderCreated)
      const globalTopOrder = applyVisibleOrderToFull(fullTops, visibleTops)
      persistGlobalOrder(buildGlobalIds(globalTopOrder))
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
    // `destination.index` já vem na convenção do arrayMove do
    // @hello-pangea/dnd (splice out do arrastado + splice in nesta posição da
    // lista SEM ele). Usar `destination.index - 1` aqui fazia o drop para cima
    // recalcular a posição de origem e nada era salvo (a linha voltava).
    const insertPos = destination.index
    if (insertPos <= parentPos || insertPos > blockEnd + 1) {
      toast.danger('Subtarefas só podem ser reordenadas dentro da tarefa pai.')
      return
    }
    const allSiblings = taskRows
      .filter((r) => r.task.parent_id === parentId)
      .map((r) => r.task)
    const originPos = allSiblings.findIndex((t) => t.id === dragged.id)
    const siblings = allSiblings.filter((t) => t.id !== dragged.id)
    // Quantos irmãos (já sem o arrastado) ficam ANTES do slot de destino —
    // esse é o índice de inserção na lista de irmãos.
    let destPos = 0
    for (let i = 0; i < insertPos && i < reducedTaskRows.length; i++) {
      if (reducedTaskRows[i].task.parent_id === parentId) destPos++
    }
    destPos = Math.min(destPos, siblings.length)
    // Drop no mesmo lugar: nada a salvar (evita criar ordem duplicada/escrita inútil).
    if (destPos === originPos) return
    siblings.splice(destPos, 0, dragged)
    // Ordem GLOBAL dos irmãos: permuta os slots dos irmãos VISÍVEIS dentro
    // da lista completa de subtarefas do pai (ocultas pelo filtro ficam
    // intactas) — e o rebuild usa os topos completos, não os visíveis.
    const fullSiblings = tasks
      .filter((t) => t.parent_id === parentId)
      .sort(byOrderCreated)
    const globalSiblings = applyVisibleOrderToFull(fullSiblings, siblings)
    const topOrder = tasks.filter((t) => !t.parent_id).sort(byOrderCreated)
    persistGlobalOrder(buildGlobalIds(topOrder, { parentId, siblings: globalSiblings }))
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
      {/* `flex-nowrap`: o bloco da direita (zoom + Hoje) fica sempre colado à
          direita; quem pode quebrar linha é só o grupo da esquerda. */}
      <div className="flex flex-nowrap items-center gap-3 border-b border-border bg-card/40 px-4 py-2 text-xs backdrop-blur">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Button size="sm" variant={showTable ? 'secondary' : 'outline'} className="h-7 gap-1.5 px-2.5 text-xs font-medium" onPress={() => setShowTable(!showTable)}>
            <i className={`fa-solid ${showTable ? 'fa-table-columns' : 'fa-table'} text-xs`} />
            <span>{showTable ? 'Ocultar Tabela' : 'Mostrar Tabela'}</span>
          </Button>
          <span className="text-[11px] text-muted-foreground font-medium">
            {taskRows.length} tarefa{taskRows.length !== 1 ? 's' : ''}
            {(statusFilter.length > 0 || categoryFilter.length > 0) && (
              <span className="text-muted-foreground/70"> de {tasks.length}</span>
            )}
          </span>
          {undatedCount > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <i className="fa-regular fa-clock" />{undatedCount} sem prazo
            </span>
          )}
          <StatusFilter
            selected={statusFilter}
            onChange={setStatusFilter}
            counts={statusCounts}
          />
          <CategoryFilter
            available={availableCategories}
            selected={categoryFilter}
            onChange={setCategoryFilter}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
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
            {/* pb-0.5 (2px): iguala o scrollHeight da tabela ao da timeline.
                O grid_height da lib é header + padding + linhas - 10, ou seja
                2px além do conteúdo da tabela (thead + linhas) — com extents
                iguais, o sync 1:1 de scrollTop não briga com clamp no fim. */}
            <div ref={tableRef} className="w-[880px] max-w-[62vw] shrink-0 overflow-y-auto overflow-x-hidden border-r border-border bg-background select-text pb-0.5">
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
                              style={{ paddingLeft: `${depth * 14}px`, maxHeight: ROW_HEIGHT }} className="flex flex-col w-full text-left transition select-none min-w-0 overflow-hidden">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isSubtask ? (
                                  <span className="text-muted-foreground/70 text-[11px] font-bold shrink-0 select-none">↳</span>
                                ) : hasChildren ? (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleExpand(task.id) }}
                                    title={isExpanded ? 'Fechar subtarefas' : `Abrir subtarefas (${row.childCount})`}
                                    className="flex items-center justify-center shrink-0 size-4 rounded text-primary/70 hover:bg-primary/10 hover:text-primary transition">
                                    <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} text-[9px]`} />
                                  </button>
                                ) : (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); openSubtaskModal(task) }}
                                    title="Adicionar subtarefa"
                                    aria-label={`Adicionar subtarefa em ${task.title}`}
                                    className="flex items-center justify-center shrink-0 size-4 rounded border border-dashed border-muted-foreground/30 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:border-primary/50 hover:text-primary focus-visible:opacity-100">
                                    <i className="fa-solid fa-plus text-[9px]" />
                                  </button>
                                )}
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
                                <TaskCommentsBadge taskId={task.id} count={commentCounts.get(task.id) ?? 0} />
                              </div>
                              {(task.tags ?? []).length > 0 && (
                                <div className="flex flex-nowrap gap-1 mt-0.5 overflow-hidden" style={{ paddingLeft: isSubtask ? '14px' : '10px' }}>
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
          {/* Sem pb: a viewport da timeline (.gantt-container height:100%)
              precisa ter a MESMA altura da viewport da tabela — se um lado
              for mais curto, o scroll máximo diverge e desalinha no fim. */}
          <div className="relative min-w-0 flex-1 overflow-hidden" ref={wrapperRef} />
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

          {onFocusTask && tasks.some((t) => t.parent_id === contextMenu.task.id) && (
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground transition hover:bg-muted"
              onClick={() => handleToggleFocus(contextMenu.task)}>
              <i className={`fa-solid ${focusedTaskId === contextMenu.task.id ? 'fa-circle-xmark' : 'fa-bullseye'} w-3.5 text-center text-muted-foreground`} />
              <span>{focusedTaskId === contextMenu.task.id ? 'Sair do foco nesta tarefa' : 'Focar na tarefa'}</span>
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

      {/* Tooltip de datas durante o arraste da barra (ponta = início/fim) */}
      {dragHint && (
        <div
          className="pointer-events-none fixed z-[300] flex items-center gap-1.5 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] font-semibold text-foreground shadow-xl"
          style={{
            left: Math.min(dragHint.x + 14, window.innerWidth - 210),
            top: Math.max(dragHint.y - 44, 8),
          }}
        >
          {dragHint.mode === 'start' && (
            <>
              <i className="fa-solid fa-calendar-day text-primary" />
              <span>Início: {dragHint.startIso ? formatDate(dragHint.startIso) : '— sem data —'}</span>
            </>
          )}
          {dragHint.mode === 'due' && (
            <>
              <i className="fa-solid fa-flag-checkered text-emerald-600" />
              <span>Fim: {dragHint.dueIso ? formatDate(dragHint.dueIso) : '— sem data —'}</span>
            </>
          )}
          {dragHint.mode === 'move' && (
            <>
              <i className="fa-solid fa-arrows-left-right text-primary" />
              <span>
                {dragHint.startIso ? formatDate(dragHint.startIso) : '—'} → {dragHint.dueIso ? formatDate(dragHint.dueIso) : '—'}
              </span>
            </>
          )}
        </div>
      )}

      {/* Conflito de datas: subtarefa fora da janela do pai (colunas Início/
          Fim e drag da barra pedem decisão — nada é salvo antes dela). */}
      <SubtaskDateConflictModal
        conflict={dateConflict}
        parentTitle={conflictParentTitle}
        busy={conflictBusy}
        onExtendParent={() => void resolveConflictByParent()}
        onFitSubtask={() => void resolveConflictBySubtask()}
        onCancel={cancelDateConflict}
      />

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
          updateTask={updateTask}
          onCreated={() => {
            toast.success('Subtarefa criada!')
          }}
        />
      )}
    </div>
  )
}
