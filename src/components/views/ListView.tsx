import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { userRowColor } from '@/utils/colors'
import { formatDateRange } from '@/utils/format'
import { PRIORITY_ICONS, STATUS_COLORS, STATUS_LABELS } from '@/utils/status'
import type { Task } from '@/types/database'

interface ListViewProps {
  tasks: Task[]
  onOpenTask: (task: Task) => void
}

function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  const tone =
    priority === 'urgent'
      ? 'text-red-600'
      : priority === 'high'
        ? 'text-amber-600'
        : 'text-muted-foreground'
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
      <i className={`fa-solid ${PRIORITY_ICONS[priority]}`} />
      {priority === 'urgent'
        ? 'Urgente'
        : priority === 'high'
          ? 'Alta'
          : priority === 'medium'
            ? 'Média'
            : 'Baixa'}
    </span>
  )
}

function StatusBadge({ status }: { status: Task['status'] }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        color: STATUS_COLORS[status],
        backgroundColor: `${STATUS_COLORS[status]}1A`,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[status] }}
      />
      {STATUS_LABELS[status]}
    </span>
  )
}

export default function ListView({ tasks, onOpenTask }: ListViewProps) {
  const parents = tasks
    .filter((task) => !task.parent_id)
    .sort(
      (a, b) =>
        TASK_STATUS_ORDER[a.status] - TASK_STATUS_ORDER[b.status] ||
        a.order_index - b.order_index,
    )

  return (
    <div className="p-4">
      <div className="rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-28">Prioridade</TableHead>
              <TableHead className="w-44">Datas</TableHead>
              <TableHead className="w-24 text-right">Horas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parents.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma tarefa neste projeto.
                </TableCell>
              </TableRow>
            )}
            {parents.map((task) => {
              const children = tasks.filter((t) => t.parent_id === task.id)
              return (
                <RowGroup
                  key={task.id}
                  task={task}
                  childTasks={children}
                  onOpenTask={onOpenTask}
                />
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

const TASK_STATUS_ORDER: Record<Task['status'], number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  review: 3,
  done: 4,
}

function RowGroup({
  task,
  childTasks,
  onOpenTask,
}: {
  task: Task
  childTasks: Task[]
  onOpenTask: (task: Task) => void
}) {
  return (
    <>
      <TaskRow task={task} depth={0} onOpen={onOpenTask} />
      {childTasks.map((child) => (
        <TaskRow key={child.id} task={child} depth={1} onOpen={onOpenTask} />
      ))}
    </>
  )
}

function TaskRow({
  task,
  depth,
  onOpen,
}: {
  task: Task
  depth: number
  onOpen: (task: Task) => void
}) {
  const rowStyle = task.assigned_to
    ? { backgroundColor: userRowColor(task.assigned_to) }
    : undefined

  return (
    <TableRow
      style={rowStyle}
      className="cursor-pointer"
      onClick={() => onOpen(task)}
    >
      <TableCell>
        <div
          className="flex items-center gap-2 text-sm font-medium"
          style={{ paddingLeft: depth * 20 }}
        >
          {depth === 1 && (
            <i className="fa-solid fa-turn-down text-xs text-muted-foreground" />
          )}
          <span className={task.status === 'done' ? 'text-muted-foreground line-through' : ''}>
            {task.title}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={task.status} />
      </TableCell>
      <TableCell>
        <PriorityBadge priority={task.priority} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {task.start_date || task.due_date ? (
          formatDateRange(task.start_date, task.due_date)
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {task.estimated_hours !== null && task.estimated_hours !== undefined
          ? `${task.estimated_hours}h`
          : '—'}
      </TableCell>
    </TableRow>
  )
}