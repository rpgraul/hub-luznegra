import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { userColor, userRowColor } from '@/utils/colors'
import { formatDate, todayIso } from '@/utils/format'
import { PRIORITY_ICONS, STATUS_COLORS, STATUS_LABELS, TASK_STATUSES } from '@/utils/status'
import type { ProjectMember } from '@/lib/api/members'
import type { Task, TaskStatus } from '@/types/database'

interface ListViewProps {
  tasks: Task[]
  onOpenTask: (task: Task) => void
  memberOf: (id: string | null) => ProjectMember | null
  moveTaskStatus: (args: { id: string; status: TaskStatus }) => Promise<unknown>
  deleteTask: (id: string) => Promise<unknown>
}

const STATUS_ORDER: Record<Task['status'], number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  review: 3,
  done: 4,
}

function StatusPill({ status }: { status: Task['status'] }) {
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
      {PRIORITY_LABELS_SHORT[priority]}
    </span>
  )
}

const PRIORITY_LABELS_SHORT: Record<Task['priority'], string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

function AssigneeCell({ member }: { member: ProjectMember | null }) {
  if (!member) {
    return <span className="text-xs text-muted-foreground">— sem responsável —</span>
  }
  const name = member.full_name ?? member.username
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        style={{ backgroundColor: userColor(member.id) }}
        title={name}
      >
        {initials}
      </span>
      <span className="max-w-28 truncate text-xs">{name}</span>
    </span>
  )
}

export default function ListView({
  tasks,
  onOpenTask,
  memberOf,
  moveTaskStatus,
  deleteTask,
}: ListViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)

  const parents = useMemo(
    () =>
      tasks
        .filter((task) => !task.parent_id)
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            a.order_index - b.order_index,
        ),
    [tasks],
  )

  const rows = useMemo(() => {
    const all: Task[] = []
    for (const parent of parents) {
      all.push(parent)
      all.push(
        ...tasks
          .filter((task) => task.parent_id === parent.id)
          .sort((a, b) => a.order_index - b.order_index),
      )
    }
    return all
  }, [parents, tasks])

  const allSelected = rows.length > 0 && rows.every((task) => selected.has(task.id))

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(rows.map((task) => task.id)))
    } else {
      setSelected(new Set())
    }
  }

  function toggleOne(taskId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(taskId)
      } else {
        next.delete(taskId)
      }
      return next
    })
  }

  async function moveSelected(status: TaskStatus) {
    const ids = [...selected]
    try {
      await Promise.all(
        ids.map((id) => moveTaskStatus({ id, status })),
      )
      setSelected(new Set())
      toast.success(
        `${ids.length} tarefa(s) movida(s) para ${STATUS_LABELS[status]}.`,
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível mover as tarefas.',
      )
    }
  }

  async function deleteSelected() {
    const ids = [...selected]
    try {
      await Promise.all(ids.map((id) => deleteTask(id)))
      setSelected(new Set())
      setConfirmDelete(false)
      toast.success(`${ids.length} tarefa(s) excluída(s).`)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir as tarefas.',
      )
    }
  }

  return (
    <div className="p-4">
      <div className="rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allSelected || (selected.size > 0 ? 'indeterminate' : false)
                  }
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label="Selecionar todas"
                />
              </TableHead>
              <TableHead>Título</TableHead>
              <TableHead className="w-40">Responsável</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-28">Prioridade</TableHead>
              <TableHead className="w-28">Vencimento</TableHead>
              <TableHead className="w-24 text-center">Subtarefas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Nenhuma tarefa neste projeto.
                </TableCell>
              </TableRow>
            )}
            {rows.map((task) => {
              const isChild = !!task.parent_id
              const childrenCount = isChild
                ? 0
                : tasks.filter((t) => t.parent_id === task.id).length
              const overdue =
                !!task.due_date &&
                task.status !== 'done' &&
                task.due_date < todayIso()
              const rowStyle = task.assigned_to
                ? { backgroundColor: userRowColor(task.assigned_to) }
                : undefined

              return (
                <TableRow
                  key={task.id}
                  style={rowStyle}
                  className={
                    selected.has(task.id) ? 'cursor-pointer bg-primary/5' : 'cursor-pointer'
                  }
                  onClick={() => onOpenTask(task)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(task.id)}
                      onCheckedChange={(checked) =>
                        toggleOne(task.id, checked === true)
                      }
                      aria-label={`Selecionar ${task.title}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div
                      className="flex items-center gap-2 text-sm font-medium"
                      style={{ paddingLeft: isChild ? 20 : 0 }}
                    >
                      {isChild && (
                        <i className="fa-solid fa-turn-down text-xs text-muted-foreground" />
                      )}
                      <span
                        className={
                          task.status === 'done'
                            ? 'text-muted-foreground line-through'
                            : ''
                        }
                      >
                        {task.title}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <AssigneeCell member={memberOf(task.assigned_to)} />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={task.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={task.priority} />
                  </TableCell>
                  <TableCell className={`text-xs ${overdue ? 'font-medium text-red-600' : ''}`}>
                    {task.due_date ? formatDate(task.due_date) : '—'}
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {childrenCount > 0 ? (
                      <span>
                        <i className="fa-regular fa-sitemap mr-1" />
                        {childrenCount}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium">
            {selected.size} selecionada(s)
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Mover para:</span>
            <Select
              value=""
              onValueChange={(value) => void moveSelected(value as TaskStatus)}
            >
              <SelectTrigger className="h-8 w-40" aria-label="Mover selecionadas">
                <SelectValue placeholder="Escolher status" />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(true)}
            >
              <i className="fa-solid fa-trash mr-1" />
              Excluir
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Limpar
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir tarefas selecionadas?</DialogTitle>
            <DialogDescription>
              Esta ação é definitiva. As {selected.size} tarefa(s) selecionadas
              serão excluídas (junto com suas subtarefas).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void deleteSelected()}>
              <i className="fa-solid fa-trash mr-1" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}