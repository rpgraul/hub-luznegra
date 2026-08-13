import { Calendar, momentLocalizer, type View } from 'react-big-calendar'
import type { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop'
import { withDragAndDrop } from '@/lib/withDragAndDrop'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import moment from 'moment/min/moment-with-locales'
import { toast } from '@heroui/react'
import { userColor } from '@/utils/colors'
import type { Task } from '@/types/database'

moment.locale('pt-br')
const localizer = momentLocalizer(moment)
const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar)

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
  updateTask,
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

  return (
    <div className="h-full p-4">
      <div className="h-full overflow-hidden rounded-xl border bg-background">
        <DnDCalendar
          localizer={localizer}
          events={events}
          defaultView="month"
          views={['month', 'week', 'day'] as View[]}
          messages={MESSAGES}
          culture="pt-br"
          selectable
          resizable
          longPressThreshold={150}
          onSelectEvent={(event) => onOpenTask(event.task)}
          onSelectSlot={(slotInfo) => onSelectSlot(slotInfo.start)}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
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
        />
      </div>
    </div>
  )
}