import { PRIORITY_ICONS } from '@/utils/status'
import { formatDateRange, todayIso } from '@/utils/format'
import { userRowColor } from '@/utils/colors'
import type { Task } from '@/types/database'

interface TaskCardProps {
  task: Task
  subtitleCount: number
  onOpen: (task: Task) => void
  compact?: boolean
}

export default function TaskCard({
  task,
  subtitleCount,
  onOpen,
  compact = false,
}: TaskCardProps) {
  const overdue =
    !!task.due_date &&
    task.status !== 'done' &&
    task.due_date < todayIso()

  const rowStyle = task.assigned_to
    ? { backgroundColor: userRowColor(task.assigned_to) }
    : undefined

  return (
    <button
      type="button"
      style={rowStyle}
      onClick={() => onOpen(task)}
      className="group w-full cursor-pointer rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={`line-clamp-2 font-medium leading-snug ${
            task.status === 'done' ? 'text-muted-foreground line-through' : ''
          }`}
        >
          {task.title}
        </p>
        <i
          className={`fa-solid ${PRIORITY_ICONS[task.priority]} shrink-0 text-xs ${
            task.priority === 'urgent'
              ? 'text-red-500'
              : task.priority === 'high'
                ? 'text-amber-500'
                : 'text-muted-foreground'
          }`}
          aria-label="Prioridade"
        />
      </div>

      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {task.start_date || task.due_date ? (
            <span className={overdue ? 'font-medium text-red-600' : ''}>
              <i className="fa-regular fa-calendar mr-1" />
              {formatDateRange(task.start_date, task.due_date)}
            </span>
          ) : null}
          {task.estimated_hours !== null && task.estimated_hours !== undefined ? (
            <span>
              <i className="fa-regular fa-clock mr-1" />
              {task.estimated_hours}h
            </span>
          ) : null}
          {subtitleCount > 0 ? (
            <span>
              <i className="fa-regular fa-sitemap mr-1" />
              {subtitleCount}
            </span>
          ) : null}
        </div>
      )}
    </button>
  )
}