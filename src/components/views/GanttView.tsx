import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Gantt from 'frappe-gantt'
import '@/assets/frappe-gantt.css'
import { toast, Button } from '@heroui/react'
import { userColor } from '@/utils/colors'
import { todayIso, formatDate } from '@/utils/format'
import type { Task, TaskPriority, TaskStatus } from '@/types/database'

interface GanttViewProps {
  tasks: Task[]
  onOpenTask: (task: Task) => void
  updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
}

const BAR_HEIGHT = 22
const PADDING = 10
const ROW_HEIGHT = BAR_HEIGHT + PADDING // 32px
const UPPER_HEADER_HEIGHT = 24
const LOWER_HEADER_HEIGHT = 24
const HEADER_HEIGHT = UPPER_HEADER_HEIGHT + LOWER_HEADER_HEIGHT // 48px

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
    column_width: 32,
    snap_at: '1d',
  },
  {
    name: 'Week',
    label: 'Semana',
    shortLabel: 'Semana',
    view_mode: 'Week',
    column_width: 55,
    snap_at: '1d',
  },
  {
    name: 'Month',
    label: 'Mês',
    shortLabel: 'Mês',
    view_mode: 'Month',
    column_width: 85,
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
  todo: '#3b82f6',
  in_progress: '#eab308',
  review: '#a855f7',
  done: '#22c55e',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function diffDays(startIso: string, endIso: string): number {
  const d1 = new Date(`${startIso}T00:00:00`).getTime()
  const d2 = new Date(`${endIso}T00:00:00`).getTime()
  return Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1)
}

export default function GanttView({
  tasks,
  onOpenTask,
  updateTask,
}: GanttViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const ganttInstanceRef = useRef<Gantt | null>(null)
  const [zoomIndex, setZoomIndex] = useState(1) // Default: Day compact
  const [showTable, setShowTable] = useState(true)

  const currentZoom = ZOOM_CONFIGS[zoomIndex]

  const rows = useMemo(
    () =>
      tasks.map((task) => {
        const undated = !task.start_date && !task.due_date
        return { task, undated }
      }),
    [tasks],
  )

  const ganttTasks = useMemo(
    () =>
      rows.map(({ task, undated }) => {
        const start = task.start_date ?? todayIso()
        const end = task.due_date
          ? addDays(task.due_date, 1)
          : addDays(task.start_date ?? todayIso(), 1)

        return {
          id: task.id,
          name:
            task.title.length > 30 ? `${task.title.slice(0, 29)}…` : task.title,
          start,
          end,
          progress: task.status === 'done' ? 100 : 0,
          dependencies: task.parent_id ? [task.parent_id] : undefined,
          custom_class:
            task.status === 'done'
              ? 'gantt-done'
              : undated
                ? 'gantt-undated'
                : '',
          color: task.assigned_to
            ? userColor(task.assigned_to)
            : STATUS_COLORS[task.status] || '#3b82f6',
        }
      }),
    [rows],
  )

  // Scroll timeline to today
  const scrollToToday = useCallback((smooth = true) => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const container = wrapper.querySelector('.gantt-container') as HTMLElement | null
    if (!container) return

    // Frappe Gantt highlights today with .current-highlight or today date class
    const todayEl = container.querySelector(
      '.current-highlight, .current-ball-highlight',
    ) as HTMLElement | null

    if (todayEl) {
      const targetLeft = Math.max(0, todayEl.offsetLeft - 80)
      container.scrollTo({
        left: targetLeft,
        behavior: smooth ? 'smooth' : 'auto',
      })
      return
    }

    // Fallback: use gantt scroll_current
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

  // Initialize and update Gantt
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    if (ganttTasks.length === 0) {
      wrapper.innerHTML = ''
      ganttInstanceRef.current = null
      return
    }

    const tasksById = new Map(rows.map(({ task }) => [task.id, task]))
    const undatedById = new Map(
      rows.map(({ task, undated }) => [task.id, undated]),
    )

    // Clear previous instance DOM
    wrapper.innerHTML = ''

    const gantt = new Gantt(wrapper, ganttTasks, {
      view_mode: currentZoom.view_mode,
      column_width: currentZoom.column_width,
      snap_at: currentZoom.snap_at,
      language: 'pt',
      date_format: 'YYYY-MM-DD',
      bar_height: BAR_HEIGHT,
      padding: PADDING,
      upper_header_height: UPPER_HEADER_HEIGHT,
      lower_header_height: LOWER_HEADER_HEIGHT,
      today_button: false,
      popup_on: 'hover',
      popup: (gTask) => {
        const task = tasksById.get(String(gTask.id))
        if (!task) return ''
        const undated = undatedById.get(String(gTask.id))
        const statusLabel = STATUS_LABELS[task.status] || task.status
        const priorityLabel = PRIORITY_LABELS[task.priority] || task.priority
        const statusColor = STATUS_COLORS[task.status] || '#64748b'

        const dateRange = undated
          ? '<span style="color:#eab308;font-weight:500;">Sem prazos definidos (arraste para definir)</span>'
          : `<span>${formatDate(task.start_date ?? todayIso())} → ${formatDate(task.due_date ?? task.start_date ?? todayIso())}</span>`

        const duration =
          task.start_date && task.due_date
            ? `<div style="margin-top:2px;font-size:10px;opacity:0.8;">Duração: ${diffDays(task.start_date, task.due_date)} dia(s)</div>`
            : ''

        return `
          <div class="gantt-popup" style="font-family: inherit; min-width: 200px;">
            <div style="font-weight:600;font-size:12px;margin-bottom:4px;color:var(--g-text-dark);">${task.title}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background-color:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">
                ${statusLabel}
              </span>
              <span style="font-size:10px;color:var(--g-text-muted);">
                • Prioridade: ${priorityLabel}
              </span>
            </div>
            <div style="font-size:11px;color:var(--g-text-dark);margin-bottom:4px;">
              ${dateRange}
            </div>
            ${duration}
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--g-border-color);font-size:10px;color:var(--g-text-muted);">
              <i class="fa-solid fa-arrow-pointer" style="margin-right:4px;"></i> Duplo clique para abrir detalhes
            </div>
          </div>
        `
      },
      on_date_change: (gTask, start, end) => {
        const task = tasksById.get(String(gTask.id))
        if (!task) return
        const nextStart = start.toISOString().slice(0, 10)
        const nextDue = addDays(end.toISOString().slice(0, 10), -1)

        void updateTask({
          id: task.id,
          patch: { start_date: nextStart, due_date: nextDue },
        })
          .then(() => {
            toast.success('Prazos atualizados!')
          })
          .catch(() => toast.danger('Não foi possível salvar as datas.'))
      },
    })

    ganttInstanceRef.current = gantt

    // Double click to open task
    function handleDoubleClick(event: MouseEvent) {
      const target = event.target as Element | null
      const bar = target?.closest?.('.bar-wrapper[data-id]')
      const id = bar?.getAttribute('data-id')
      if (!id) return
      const task = tasksById.get(id)
      if (task) onOpenTask(task)
    }

    wrapper.addEventListener('dblclick', handleDoubleClick)

    // Scroll to today smoothly after layout calculation
    const timer = setTimeout(() => {
      scrollToToday(false)
    }, 60)

    return () => {
      clearTimeout(timer)
      wrapper.removeEventListener('dblclick', handleDoubleClick)
      if (gantt) {
        gantt.clear()
        gantt.unselect_all()
      }
      wrapper.innerHTML = ''
      ganttInstanceRef.current = null
    }
  }, [ganttTasks, rows, currentZoom, onOpenTask, updateTask, scrollToToday])

  // Ctrl + Scroll to Zoom listener
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (e.deltaY < 0) {
          handleZoomIn()
        } else if (e.deltaY > 0) {
          handleZoomOut()
        }
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
    void updateTask({ id: task.id, patch: { [field]: next } })
      .then(() => toast.success('Data atualizada.'))
      .catch(() => toast.danger('Não foi possível salvar a data.'))
  }

  function handleStatusChange(task: Task, nextStatus: TaskStatus) {
    if (task.status === nextStatus) return
    void updateTask({ id: task.id, patch: { status: nextStatus } })
      .then(() =>
        toast.success(`Status alterado para ${STATUS_LABELS[nextStatus]}`),
      )
      .catch(() => toast.danger('Erro ao alterar status.'))
  }

  const undatedCount = rows.filter(({ undated }) => undated).length

  return (
    <div className="flex h-full min-h-0 flex-col bg-background select-none">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-2 text-xs backdrop-blur">
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

          <span className="text-[11px] text-muted-foreground">
            {rows.length} tarefa{rows.length !== 1 ? 's' : ''}
          </span>

          {undatedCount > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              <i className="fa-regular fa-clock" />
              {undatedCount} sem prazo
            </span>
          )}
        </div>

        {/* Right Side: Zoom Controls & Today Button */}
        <div className="flex items-center gap-2">
          {/* Zoom Buttons & Mode Selector */}
          <div className="flex items-center rounded-lg border border-border bg-background/80 p-0.5 shadow-xs">
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
                      ? 'bg-primary text-primary-foreground shadow-xs'
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
          {/* Collapsible Left Table */}
          {showTable && (
            <div className="w-[380px] shrink-0 overflow-auto border-r border-border bg-background select-text">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr
                    className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur"
                    style={{ height: HEADER_HEIGHT }}
                  >
                    <th className="px-3 text-left font-semibold text-muted-foreground">
                      Tarefa
                    </th>
                    <th className="w-24 px-2 text-left font-semibold text-muted-foreground">
                      Status
                    </th>
                    <th className="w-24 px-2 text-left font-semibold text-muted-foreground">
                      Início
                    </th>
                    <th className="w-24 px-2 pr-3 text-left font-semibold text-muted-foreground">
                      Fim
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-4 text-center text-muted-foreground"
                      >
                        Nenhuma tarefa encontrada.
                      </td>
                    </tr>
                  ) : (
                    rows.map(({ task, undated }) => (
                      <tr
                        key={task.id}
                        className="group border-b border-border/50 transition hover:bg-muted/40"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {/* Title */}
                        <td className="max-w-[150px] px-3">
                          <button
                            type="button"
                            onClick={() => onOpenTask(task)}
                            className="flex w-full items-center gap-1.5 text-left transition hover:text-primary"
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor: task.assigned_to
                                  ? userColor(task.assigned_to)
                                  : STATUS_COLORS[task.status],
                              }}
                            />
                            <span className="truncate font-medium text-foreground">
                              {task.title}
                            </span>
                            {undated && (
                              <span className="shrink-0 rounded border border-dashed border-amber-500/50 bg-amber-500/10 px-1 text-[9px] font-medium leading-tight text-amber-500">
                                sem prazo
                              </span>
                            )}
                          </button>
                        </td>

                        {/* Status */}
                        <td className="px-2">
                          <select
                            value={task.status}
                            aria-label={`Status de ${task.title}`}
                            onChange={(e) =>
                              handleStatusChange(
                                task,
                                e.target.value as TaskStatus,
                              )
                            }
                            className="w-full cursor-pointer rounded border border-transparent bg-transparent py-0.5 text-[11px] font-medium transition hover:border-border focus:border-primary focus:bg-background"
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
                            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] outline-none transition hover:border-border focus:border-primary focus:bg-background"
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
                            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] outline-none transition hover:border-border focus:border-primary focus:bg-background"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Gantt Timeline SVG Container */}
          <div
            className="relative min-w-0 flex-1 overflow-hidden"
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
            <span>Mover período ou definir datas</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs">
              Bordas da barra
            </kbd>
            <span>Ajustar início / fim</span>
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