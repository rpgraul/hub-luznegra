import { Calendar, momentLocalizer, type View } from 'react-big-calendar'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import moment from 'moment/min/moment-with-locales'
import { userColor } from '@/utils/colors'
import type { Task } from '@/types/database'

moment.locale('pt-br')
const localizer = momentLocalizer(moment)

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  task: Task
}

interface CalendarViewProps {
  tasks: Task[]
  onOpenTask: (task: Task) => void
  onSelectSlot: (start: Date) => void
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toDate(iso: string | null): Date | null {
  if (!iso) return null
  return new Date(`${iso}T00:00:00`)
}

export default function CalendarView({
  tasks,
  onOpenTask,
  onSelectSlot,
}: CalendarViewProps) {
  const events: CalendarEvent[] = tasks
    .map((task) => {
      const start = toDate(task.start_date ?? task.due_date)
      const end = toDate(task.due_date ?? task.start_date)
      if (!start || !end) return null
      return {
        id: task.id,
        title: task.title,
        start,
        end: addDays(end, 1),
        allDay: true,
        task,
      }
    })
    .filter((event): event is CalendarEvent => event !== null)

  return (
    <div className="h-full p-4">
      <div className="h-full overflow-hidden rounded-xl border bg-background">
        <Calendar<CalendarEvent>
          localizer={localizer}
          events={events}
          defaultView="month"
          views={['month', 'week', 'day'] as View[]}
          messages={MESSAGES}
          culture="pt-br"
          selectable
          longPressThreshold={150}
          onSelectEvent={(event) => onOpenTask(event.task)}
          onSelectSlot={(slotInfo) => onSelectSlot(slotInfo.start)}
          eventPropGetter={(event) => ({
            style: {
              backgroundColor: event.task.assigned_to
                ? userColor(event.task.assigned_to)
                : '#6B7280',
              color: 'white',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              opacity: event.task.status === 'done' ? 0.5 : 1,
            },
          })}
          dayPropGetter={(date) =>
            moment(date).isSame(moment(), 'day')
              ? { className: 'rbc-today' }
              : {}
          }
        />
      </div>
    </div>
  )
}