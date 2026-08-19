import { useState, useMemo } from 'react'
import { Calendar, momentLocalizer, type View, type EventProps } from 'react-big-calendar'
import type { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop'
import { withDragAndDrop } from '@/lib/withDragAndDrop'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import moment from 'moment/min/moment-with-locales'
import { toast, Button } from '@heroui/react'
import { userColor } from '@/utils/colors'
import { formatDate, todayIso } from '@/utils/format'
import type { Project, Task } from '@/types/database'
import type { ProjectMember } from '@/lib/api/members'

moment.locale('pt-br')
const localizer = momentLocalizer(moment)
const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar)

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  isSpan: boolean
  isOverdue: boolean
  task: Task
}

interface CalendarViewProps {
  tasks: Task[]
  projects?: Project[]
  memberOf?: (id: string | null) => ProjectMember | null
  onOpenTask: (task: Task) => void
  onSelectSlot: (start: Date) => void
  updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
}

const MESSAGES = {
  allDay: 'Dia inteiro',
  previous: 'Anterior',
  next: 'Próximo',
  today: 'Hoje',
  month: 'Mês',
  week: 'Semana',
  day: 'Dia',
  agenda: 'Agenda',
  date: 'Data',
  time: 'Hora',
  event: 'Evento',
  noEventsInRange: 'Sem tarefas no período.',
  showMore: (total: number) => `+${total} mais`,
}

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'A Fazer',
  in_progress: 'Em Andamento',
  review: 'Revisão',
  done: 'Concluído',
}

const STATUS_COLORS: Record<string, string> = {
  backlog: '#94a3b8',
  todo: '#38bdf8',
  in_progress: '#818cf8',
  review: '#fbbf24',
  done: '#34d399',
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toDate(iso: string | null): Date | null {
  if (!iso) return null
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return null
  }
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0)
}

export default function CalendarView({
  tasks,
  projects = [],
  memberOf,
  onOpenTask,
  onSelectSlot,
  updateTask,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date())
  const [currentView, setCurrentView] = useState<View>('month')
  const [filterMode, setFilterMode] = useState<'due_only' | 'all'>('due_only')

  const today = todayIso()

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>()
    projects.forEach((p) => map.set(p.id, p))
    return map
  }, [projects])

  const events: CalendarEvent[] = useMemo(() => {
    return tasks
      .map((task) => {
        if (filterMode === 'due_only') {
          // Show only at due_date (or start_date if no due_date)
          const targetDateStr = task.due_date ?? task.start_date
          const targetDate = toDate(targetDateStr)
          if (!targetDate) return null

          const isOverdue = task.status !== 'done' && !!task.due_date && today > task.due_date

          return {
            id: task.id,
            title: task.title,
            start: targetDate,
            end: addDays(targetDate, 1),
            allDay: true,
            isSpan: false,
            isOverdue,
            task,
          }
        }

        const rawStart = toDate(task.start_date ?? task.due_date)
        const rawEnd = toDate(task.due_date ?? task.start_date)
        if (!rawStart || !rawEnd) return null

        const start = rawStart <= rawEnd ? rawStart : rawEnd
        const end = rawEnd >= rawStart ? rawEnd : rawStart

        const isSpan = task.start_date !== null && task.due_date !== null && task.start_date !== task.due_date
        const isOverdue = task.status !== 'done' && !!task.due_date && today > task.due_date

        return {
          id: task.id,
          title: task.title,
          start,
          end: addDays(end, 1),
          allDay: true,
          isSpan,
          isOverdue,
          task,
        }
      })
      .filter((event): event is CalendarEvent => event !== null)
  }, [tasks, filterMode, today])

  const handleEventDrop: withDragAndDropProps<CalendarEvent>['onEventDrop'] = ({
    event,
    start,
    end,
  }) => {
    void updateTask({
      id: event.task.id,
      patch: {
        start_date: moment(start).format('YYYY-MM-DD'),
        due_date: moment(end).subtract(1, 'days').format('YYYY-MM-DD'),
      },
    }).catch(() => toast.danger('Não foi possível salvar as datas.'))
  }

  const handleEventResize: withDragAndDropProps<CalendarEvent>['onEventResize'] = ({
    event,
    start,
    end,
  }) => {
    void updateTask({
      id: event.task.id,
      patch: {
        start_date: moment(start).format('YYYY-MM-DD'),
        due_date: moment(end).subtract(1, 'days').format('YYYY-MM-DD'),
      },
    }).catch(() => toast.danger('Não foi possível salvar as datas.'))
  }

  // Custom Event component to show rich metadata: tags, assignee avatar, status badge
  function CustomEventComponent({ event }: EventProps<CalendarEvent>) {
    const task = event.task
    const isDone = task.status === 'done'
    const isOverdue = event.isOverdue

    const project = task.project_id ? projectMap.get(task.project_id) : null
    const tags = task.tags ?? []

    const assigneeIds =
      task.assignees && task.assignees.length > 0
        ? task.assignees
        : task.assigned_to
          ? [task.assigned_to]
          : []

    const assignees = assigneeIds
      .map((id) => (memberOf ? memberOf(id) : null))
      .filter((m): m is ProjectMember => !!m)

    const priorityBadge =
      task.priority === 'urgent'
        ? { label: 'Urgente', color: 'bg-rose-500 text-white' }
        : task.priority === 'high'
          ? { label: 'Alta', color: 'bg-amber-500 text-white' }
          : null

    const statusLabel = STATUS_LABELS[task.status] || task.status

    return (
      <div
        className={`group relative flex flex-col justify-between overflow-hidden rounded-lg p-2 leading-snug transition select-none ${
          isDone ? 'opacity-70' : ''
        }`}
        title={`${task.title}\nStatus: ${statusLabel}\nProjeto: ${project?.name || 'Sem projeto'}\nPrazo: ${
          task.due_date ? formatDate(task.due_date) : 'Sem prazo'
        }`}
      >
        {/* Top line: Project indicator badge + Status + Avatar */}
        <div className="flex items-center justify-between gap-1.5 mb-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            {project && (
              <span
                className="truncate rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-xs"
                style={{ backgroundColor: project.color || '#6366f1' }}
              >
                {project.name}
              </span>
            )}
            <span
              className="rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs backdrop-blur-sm"
            >
              {statusLabel}
            </span>
          </div>

          {/* Right badges & Avatar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {priorityBadge && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider shadow-xs ${priorityBadge.color}`}
              >
                {priorityBadge.label}
              </span>
            )}

            {isOverdue && (
              <span className="rounded-md bg-amber-400 text-amber-950 px-1.5 py-0.5 text-[9px] font-black tracking-wide shadow-xs border border-amber-300">
                ⚠️ Atrasada
              </span>
            )}

            {/* Assignee Avatar with real photo */}
            {assignees.length > 0 ? (
              <div className="flex items-center -space-x-1.5">
                {assignees.slice(0, 2).map((m) => {
                  const name = m.full_name || m.username || 'User'
                  const initials = (m.username || name).slice(0, 2).toUpperCase()
                  return (
                    <div
                      key={m.id}
                      className="size-5.5 shrink-0 overflow-hidden rounded-full ring-2 ring-white/60 shadow-xs"
                      style={{ backgroundColor: userColor(m.id) }}
                      title={name}
                    >
                      {m.avatar_url ? (
                        <img
                          src={m.avatar_url}
                          alt={name}
                          className="size-full object-cover"
                          onError={(e) => {
                            ;(e.currentTarget as HTMLElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center text-[8.5px] font-bold text-white">
                          {initials}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : task.assigned_to ? (
              <div
                className="flex size-5.5 shrink-0 items-center justify-center rounded-full text-[8.5px] font-bold text-white ring-2 ring-white/50 shadow-xs"
                style={{ backgroundColor: userColor(task.assigned_to) }}
              >
                {task.assigned_to.slice(0, 2).toUpperCase()}
              </div>
            ) : null}
          </div>
        </div>

        {/* Task Title */}
        <div className="min-w-0">
          <span
            className={`block truncate text-[13px] font-bold tracking-tight text-white ${
              isDone ? 'line-through opacity-85' : ''
            } ${isOverdue ? 'text-rose-100 font-extrabold' : ''}`}
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
          >
            {task.title}
          </span>
        </div>

        {/* Tags line (if present) */}
        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 overflow-hidden">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-black/40 px-2 py-0.5 text-[9.5px] font-bold text-white/95 backdrop-blur-sm shadow-2xs"
              >
                #{tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[9px] text-white/90 font-semibold">+{tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background p-4 select-none">
      {/* Top Controls Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-2 text-xs backdrop-blur shadow-2xs">
        {/* Left Side: Stats & Legend */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-foreground">
            {events.length} tarefa{events.length !== 1 ? 's' : ''} agendada{events.length !== 1 ? 's' : ''}
          </span>

          <div className="hidden sm:flex items-center gap-2 border-l border-border pl-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-[#818cf8]" />
              <span>Em Andamento</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-[#38bdf8]" />
              <span>A Fazer</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-[#34d399]" />
              <span>Concluído</span>
            </span>
          </div>
        </div>

        {/* Right Side: Mode Switcher & Month Quick Jump */}
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-lg border border-border bg-background p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                filterMode === 'all'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <i className="fa-solid fa-arrows-left-right mr-1.5 text-[10px]" />
              Período Completo
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('due_only')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                filterMode === 'due_only'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <i className="fa-regular fa-calendar-check mr-1.5 text-[10px]" />
              Apenas Entregas (Deadlines)
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-7.5 gap-1.5 text-xs font-semibold"
            onPress={() => setCurrentDate(new Date())}
          >
            <i className="fa-solid fa-calendar-day text-xs" />
            <span>Mês Atual</span>
          </Button>
        </div>
      </div>

      {/* Calendar Area */}
      <div className="h-full min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background shadow-xs">
        <DnDCalendar
          localizer={localizer}
          events={events}
          date={currentDate}
          onNavigate={(newDate) => setCurrentDate(newDate)}
          view={currentView}
          onView={(newView) => setCurrentView(newView)}
          views={['month', 'week', 'day'] as View[]}
          messages={MESSAGES}
          culture="pt-br"
          selectable
          resizable
          longPressThreshold={150}
          components={{
            event: CustomEventComponent,
          }}
          onSelectEvent={(event) => onOpenTask(event.task)}
          onSelectSlot={(slotInfo) => onSelectSlot(slotInfo.start)}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          eventPropGetter={(event) => {
            const task = event.task
            const isDone = task.status === 'done'
            const isOverdue = event.isOverdue

            // Base color: preserve assignee userColor (or status color), keeping identity clear
            const baseColor = isDone
              ? '#10b981'
              : task.assigned_to
                ? userColor(task.assigned_to)
                : STATUS_COLORS[task.status] || '#7b68ee'

            return {
              style: {
                backgroundColor: baseColor,
                color: 'white',
                borderRadius: '8px',
                border: isOverdue
                  ? '2px solid #ef4444'
                  : '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: isOverdue
                  ? '0 0 0 1px #b91c1c, 0 3px 8px rgba(239, 68, 68, 0.35)'
                  : '0 2px 5px -1px rgba(0, 0, 0, 0.25), 0 1px 3px -1px rgba(0, 0, 0, 0.15)',
                padding: '3px',
                minHeight: '36px',
              },
            }
          }}
        />
      </div>
    </div>
  )
}