import { useMemo, useState } from 'react'
import { toast, Button, Checkbox, Table, Select, ListBox, Chip, AlertDialog } from '@heroui/react'
import { userColor, userRowColor } from '@/utils/colors'
import { formatDate, todayIso } from '@/utils/format'
import { PRIORITY_ICONS, STATUS_COLORS, STATUS_LABELS, TASK_STATUSES } from '@/utils/status'
import type { ProjectMember } from '@/lib/api/members'
import type { Project, Task, TaskStatus } from '@/types/database'

interface ListViewProps {
  tasks: Task[]
  projects: Project[]
  grouped: boolean
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

const STATUS_CHIP_COLOR: Record<Task['status'], string> = {
  backlog: 'default',
  todo: 'secondary',
  in_progress: 'primary',
  review: 'warning',
  done: 'success',
}

function StatusPill({ status }: { status: Task['status'] }) {
  return (
    <Chip size="sm" color={STATUS_CHIP_COLOR[status] as 'default'} variant="soft">
      <span className="flex items-center gap-1.5">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[status] }}
        />
        {STATUS_LABELS[status]}
      </span>
    </Chip>
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

interface TaskRowProps {
  task: Task
  selected: boolean
  childrenCount: number
  memberOf: (id: string | null) => ProjectMember | null
  onToggle: (checked: boolean) => void
  onOpen: () => void
}

function TaskRow({
  task,
  selected,
  childrenCount,
  memberOf: memberLookup,
  onToggle,
  onOpen,
}: TaskRowProps) {
  const isChild = !!task.parent_id
  const overdue =
    !!task.due_date &&
    task.status !== 'done' &&
    task.due_date < todayIso()
  const rowStyle = task.assigned_to
    ? { backgroundColor: userRowColor(task.assigned_to) }
    : undefined

  return (
    <Table.Row
      style={rowStyle}
      className={selected ? 'cursor-pointer bg-primary/5' : 'cursor-pointer'}
      onClick={onOpen}
    >
      <Table.Cell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          isSelected={selected}
          onChange={(checked) => onToggle(checked)}
          aria-label={`Selecionar ${task.title}`}
        />
      </Table.Cell>
      <Table.Cell>
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
      </Table.Cell>
      <Table.Cell>
        <AssigneeCell member={memberLookup(task.assigned_to)} />
      </Table.Cell>
      <Table.Cell>
        <StatusPill status={task.status} />
      </Table.Cell>
      <Table.Cell>
        <PriorityBadge priority={task.priority} />
      </Table.Cell>
      <Table.Cell className={`text-xs ${overdue ? 'font-medium text-red-600' : ''}`}>
        {task.due_date ? formatDate(task.due_date) : '—'}
      </Table.Cell>
      <Table.Cell className="text-center text-xs text-muted-foreground">
        {childrenCount > 0 ? (
          <span>
            <i className="fa-regular fa-sitemap mr-1" />
            {childrenCount}
          </span>
        ) : (
          '—'
        )}
      </Table.Cell>
    </Table.Row>
  )
}

interface TasksTableProps {
  rows: Task[]
  selected: Set<string>
  grouped?: boolean
  emptyMessage: string
  onToggle: (taskId: string, checked: boolean) => void
  onOpen: (task: Task) => void
  toggleAll: (checked: boolean) => void
  memberOf: (id: string | null) => ProjectMember | null
  countSubtasks: (task: Task) => number
}

function TasksTable({
  rows,
  selected,
  emptyMessage,
  onToggle,
  onOpen,
  toggleAll,
  memberOf,
  countSubtasks,
}: TasksTableProps) {
  const allSelected = rows.length > 0 && rows.every((task) => selected.has(task.id))
  const partialSelected = selected.size > 0 && !allSelected

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            isSelected={allSelected}
            isIndeterminate={partialSelected}
            onChange={(checked) => toggleAll(checked)}
            aria-label="Selecionar todas"
          />
          <span className="text-xs font-medium text-muted-foreground">
            Selecionar todas
          </span>
        </label>
        <span className="text-xs text-muted-foreground">
          {rows.length} tarefa(s)
        </span>
      </div>
      <Table.Root className="w-full">
        <Table.Content aria-label="Tarefas">
          <Table.Header>
            <Table.Column className="w-10">
              <span className="sr-only">Selecionar</span>
            </Table.Column>
            <Table.Column>Título</Table.Column>
            <Table.Column>Responsável</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column>Prioridade</Table.Column>
            <Table.Column>Vencimento</Table.Column>
            <Table.Column className="text-center">Subtarefas</Table.Column>
          </Table.Header>
        <Table.Body>
          {rows.length === 0 && (
            <Table.Row className="hover:bg-transparent">
              <Table.Cell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </Table.Cell>
            </Table.Row>
          )}
          {rows.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={selected.has(task.id)}
              childrenCount={countSubtasks(task)}
              memberOf={memberOf}
              onToggle={(checked) => onToggle(task.id, checked)}
              onOpen={() => onOpen(task)}
            />
          ))}
        </Table.Body>
        </Table.Content>
      </Table.Root>
    </div>
  )
}

export default function ListView({
  tasks,
  projects,
  grouped,
  onOpenTask,
  memberOf,
  moveTaskStatus,
  deleteTask,
}: ListViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)

  const rows = useMemo(() => {
    const parents = tasks
      .filter((task) => !task.parent_id)
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.order_index - b.order_index,
      )

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
  }, [tasks])

  const sections = useMemo(() => {
    if (!grouped) return []
    const ids = new Set(
      tasks.map((task) => task.project_id).filter((id): id is string => !!id),
    )
    const list: Array<{
      project: Project | null
      sectionTasks: Task[]
    }> = projects
      .filter((project) => ids.has(project.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((project) => ({
        project,
        sectionTasks: tasks.filter((task) => task.project_id === project.id),
      }))
    const orphan = tasks.filter((task) => !task.project_id)
    if (orphan.length > 0) {
      list.push({ project: null, sectionTasks: orphan })
    }
    return list
  }, [tasks, projects, grouped])

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
      await Promise.all(ids.map((id) => moveTaskStatus({ id, status })))
      setSelected(new Set())
      toast.success(
        `${ids.length} tarefa(s) movida(s) para ${STATUS_LABELS[status]}.`,
      )
    } catch (error) {
      toast.danger(
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
      toast.danger(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir as tarefas.',
      )
    }
  }

  function countSubtasks(task: Task) {
    return tasks.filter((t) => t.parent_id === task.id).length
  }

  const emptyMessage = grouped ? 'Nenhuma tarefa por aqui.' : 'Nenhuma tarefa neste projeto.'

  return (
    <div className="p-4">
      {grouped ? (
        <div className="space-y-6">
          {sections.length === 0 && (
            <div className="rounded-xl border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}
          {sections.map(({ project, sectionTasks }) => {
            const sectionRows = rows.filter((task) =>
              sectionTasks.some((t) => t.id === task.id),
            )
            return (
              <section key={project?.id ?? '__sem_projeto__'}>
                <header className="mb-2 flex items-center gap-2 px-1">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: project?.color ?? '#94A3B8' }}
                  />
                  <h2 className="text-sm font-semibold">
                    {project?.name ?? 'Sem projeto'}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {sectionRows.length} tarefa(s)
                  </span>
                </header>
                <div className="rounded-xl border bg-background">
                  <TasksTable
                    rows={sectionRows}
                    selected={selected}
                    emptyMessage={emptyMessage}
                    onToggle={toggleOne}
                    onOpen={onOpenTask}
                    toggleAll={toggleAll}
                    memberOf={memberOf}
                    countSubtasks={countSubtasks}
                  />
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border bg-background">
          <TasksTable
            rows={rows}
            selected={selected}
            emptyMessage={emptyMessage}
            onToggle={toggleOne}
            onOpen={onOpenTask}
            toggleAll={toggleAll}
            memberOf={memberOf}
            countSubtasks={countSubtasks}
          />
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium">
            {selected.size} selecionada(s)
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Mover para:</span>
            <Select.Root
              selectedKey={null}
              onSelectionChange={(value) => void moveSelected(value as TaskStatus)}
              aria-label="Mover selecionadas"
              className="w-40"
              placeholder="Escolher status"
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Popover>
                <ListBox.Root>
                  {TASK_STATUSES.map((status) => (
                    <ListBox.Item key={status} id={status} textValue={STATUS_LABELS[status]}>
                      {STATUS_LABELS[status]}
                    </ListBox.Item>
                  ))}
                </ListBox.Root>
              </Select.Popover>
            </Select.Root>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              onPress={() => setConfirmDelete(true)}
            >
              <i className="fa-solid fa-trash mr-1" />
              Excluir
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => setSelected(new Set())}
            >
              Limpar
            </Button>
          </div>
        </div>
      )}

      <AlertDialog.Root isOpen={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialog.Backdrop />
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-md">
            <AlertDialog.Header>
              <AlertDialog.Heading>Excluir tarefas selecionadas?</AlertDialog.Heading>
              <p className="text-sm text-muted-foreground">
                Esta ação é definitiva. As {selected.size} tarefa(s) selecionadas
                serão excluídas (junto com suas subtarefas).
              </p>
            </AlertDialog.Header>
            <AlertDialog.Body />
            <AlertDialog.Footer>
              <Button variant="outline" onPress={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onPress={() => void deleteSelected()}>
                <i className="fa-solid fa-trash mr-1" />
                Excluir
              </Button>
            </AlertDialog.Footer>
            <AlertDialog.CloseTrigger />
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Root>
    </div>
  )
}