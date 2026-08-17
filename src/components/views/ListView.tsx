import { useMemo, useState } from 'react'
import {
  toast,
  Button,
  Checkbox,
  Table,
  Select,
  ListBox,
  AlertDialog,
} from '@heroui/react'
import { userColor, userRowColor } from '@/utils/colors'
import { formatDate, todayIso } from '@/utils/format'
import {
  PRIORITY_ICONS,
  STATUS_COLORS,
  STATUS_LABELS,
  TASK_STATUSES,
} from '@/utils/status'
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

const PRIORITY_LABELS_SHORT: Record<Task['priority'], string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

function extractDescriptionText(description: unknown): string {
  if (!description) return ''
  if (typeof description === 'string') return description
  try {
    const root = (description as { root?: { children?: unknown[] } })?.root
    if (!root) return ''
    const texts: string[] = []
    function traverse(node: unknown) {
      if (!node || typeof node !== 'object') return
      const n = node as { text?: string; children?: unknown[] }
      if (n.text) texts.push(n.text)
      if (Array.isArray(n.children)) {
        n.children.forEach(traverse)
      }
    }
    traverse(root)
    return texts.join(' ').trim()
  } catch {
    return ''
  }
}

function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  const tone =
    priority === 'urgent'
      ? 'text-rose-600'
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

function AssigneeCell({ member }: { member: ProjectMember | null }) {
  if (!member) {
    return (
      <span className="text-xs text-muted-foreground">— sem responsável —</span>
    )
  }
  const name = member.full_name ?? member.username
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white shadow-2xs"
        style={{ backgroundColor: userColor(member.id) }}
        title={name}
      >
        {initials}
      </span>
      <span className="max-w-28 truncate text-xs font-medium">{name}</span>
    </span>
  )
}

interface TaskRowProps {
  task: Task
  selected: boolean
  childrenCount: number
  memberOf: (id: string | null) => ProjectMember | null
  onToggle: (checked: boolean) => void
  onToggleDone: (task: Task) => void
  onChangeStatus: (task: Task, status: TaskStatus) => void
  onOpen: () => void
  projectName?: string | null
  projectColor?: string | null
}

function TaskRow({
  task,
  selected,
  childrenCount,
  memberOf: memberLookup,
  onToggle,
  onToggleDone,
  onChangeStatus,
  onOpen,
  projectName,
  projectColor,
}: TaskRowProps) {
  const isChild = !!task.parent_id
  const isDone = task.status === 'done'
  const overdue =
    !!task.due_date && !isDone && task.due_date < todayIso()
  const rowStyle = task.assigned_to
    ? { backgroundColor: userRowColor(task.assigned_to) }
    : undefined

  const descriptionPreview = extractDescriptionText(task.description)
  const hoverTooltip = descriptionPreview
    ? `${task.title}\n\nDescrição:\n${descriptionPreview}`
    : `${task.title}\n(Dê 2 cliques para abrir detalhes)`

  return (
    <Table.Row
      style={rowStyle}
      onDoubleClick={onOpen}
      className={`group cursor-default transition-colors select-none ${
        selected ? 'bg-primary/5' : isDone ? 'bg-emerald-500/5' : ''
      }`}
    >
      {/* Selection Checkbox */}
      <Table.Cell onClick={(e) => e.stopPropagation()} className="w-8">
        <Checkbox
          isSelected={selected}
          onChange={(checked) => onToggle(checked)}
          aria-label={`Selecionar ${task.title}`}
          className="cursor-pointer"
        />
      </Table.Cell>

      {/* Quick Done Checkbox */}
      <Table.Cell onClick={(e) => e.stopPropagation()} className="w-8 px-1 text-center">
        <button
          type="button"
          onClick={() => onToggleDone(task)}
          title={isDone ? 'Reabrir tarefa' : 'Marcar como concluída'}
          className="flex size-5 mx-auto cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:scale-110 hover:text-emerald-600 focus:outline-none"
        >
          {isDone ? (
            <i className="fa-solid fa-circle-check text-emerald-500 text-sm" />
          ) : (
            <i className="fa-regular fa-circle text-muted-foreground/60 group-hover:text-foreground text-xs" />
          )}
        </button>
      </Table.Cell>

      {/* Task Title, Description Preview & Tags */}
      <Table.Cell>
        <div
          title={hoverTooltip}
          className="flex flex-col gap-1 py-1"
          style={{ paddingLeft: isChild ? 22 : 0 }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            {isChild && (
              <i className="fa-solid fa-turn-down text-xs text-muted-foreground" />
            )}
            <span
              className={
                isDone
                  ? 'text-muted-foreground line-through'
                  : overdue
                    ? 'text-rose-600 font-bold'
                    : 'text-foreground'
              }
            >
              {task.title}
            </span>

            {/* Explicit Edit Icon Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
              title="Editar tarefa (2 cliques)"
              className="cursor-pointer text-muted-foreground/40 opacity-0 transition hover:text-[#7b68ee] group-hover:opacity-100"
            >
              <i className="fa-regular fa-pen-to-square text-[11px]" />
            </button>
          </div>

          {/* Description snippet on hover/preview */}
          {descriptionPreview && (
            <p className="line-clamp-1 text-[11px] font-normal text-muted-foreground/80">
              {descriptionPreview}
            </p>
          )}

          {/* Project & Tags metadata */}
          <div className="flex flex-wrap items-center gap-1.5">
            {projectName && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.2 text-[9px] font-semibold"
                style={{
                  color: projectColor || '#7b68ee',
                  backgroundColor: `${projectColor || '#7b68ee'}15`,
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: projectColor || '#7b68ee' }}
                />
                {projectName}
              </span>
            )}
            {(task.tags ?? []).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md border border-[#7b68ee]/30 bg-[#7b68ee]/10 px-1.5 py-0.2 text-[9px] font-semibold text-[#7b68ee]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </Table.Cell>

      {/* Assignee */}
      <Table.Cell>
        <AssigneeCell member={memberLookup(task.assigned_to)} />
      </Table.Cell>

      {/* Quick Status Select */}
      <Table.Cell onClick={(e) => e.stopPropagation()}>
        <select
          value={task.status}
          onChange={(e) => onChangeStatus(task, e.target.value as TaskStatus)}
          aria-label={`Status de ${task.title}`}
          className="cursor-pointer rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs font-semibold shadow-2xs transition hover:border-border focus:border-primary"
          style={{ color: STATUS_COLORS[task.status] }}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </Table.Cell>

      {/* Priority */}
      <Table.Cell>
        <PriorityBadge priority={task.priority} />
      </Table.Cell>

      {/* Due Date */}
      <Table.Cell
        className={`text-xs ${
          overdue ? 'font-bold text-rose-600' : 'text-muted-foreground'
        }`}
      >
        {task.due_date ? formatDate(task.due_date) : '—'}
      </Table.Cell>

      {/* Subtasks Count */}
      <Table.Cell className="text-center text-xs text-muted-foreground">
        {childrenCount > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold">
            <i className="fa-solid fa-list-check text-[10px]" />
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
  emptyMessage: string
  onToggle: (taskId: string, checked: boolean) => void
  onToggleDone: (task: Task) => void
  onChangeStatus: (task: Task, status: TaskStatus) => void
  onOpen: (task: Task) => void
  toggleAll: (checked: boolean) => void
  memberOf: (id: string | null) => ProjectMember | null
  countSubtasks: (task: Task) => number
  projectById?: Map<string, Project>
}

function TasksTable({
  rows,
  selected,
  emptyMessage,
  onToggle,
  onToggleDone,
  onChangeStatus,
  onOpen,
  toggleAll,
  memberOf,
  countSubtasks,
  projectById,
}: TasksTableProps) {
  const allSelected =
    rows.length > 0 && rows.every((task) => selected.has(task.id))
  const partialSelected = selected.size > 0 && !allSelected

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card/40 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            isSelected={allSelected}
            isIndeterminate={partialSelected}
            onChange={(checked) => toggleAll(checked)}
            aria-label="Selecionar todas"
            className="cursor-pointer"
          />
          <span className="text-xs font-semibold text-muted-foreground">
            Selecionar todas
          </span>
        </label>
        <span className="text-xs font-semibold text-muted-foreground">
          {rows.length} tarefa(s) • <span className="font-normal opacity-80">2 cliques para editar</span>
        </span>
      </div>
      <Table.Root className="w-full text-xs">
        <Table.Content aria-label="Lista de tarefas">
          <Table.Header>
            <Table.Column className="w-8">
              <span className="sr-only">Selecionar</span>
            </Table.Column>
            <Table.Column className="w-8 text-center">
              <span className="sr-only">Concluir</span>
            </Table.Column>
            <Table.Column>Título & Descrição</Table.Column>
            <Table.Column>Responsável</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column>Prioridade</Table.Column>
            <Table.Column>Vencimento</Table.Column>
            <Table.Column className="text-center">Subtarefas</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.length === 0 && (
              <Table.Row className="hover:bg-transparent">
                <Table.Cell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </Table.Cell>
              </Table.Row>
            )}
            {rows.map((task) => {
              const project =
                task.project_id && projectById
                  ? projectById.get(task.project_id)
                  : null
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={selected.has(task.id)}
                  childrenCount={countSubtasks(task)}
                  memberOf={memberOf}
                  onToggle={(checked) => onToggle(task.id, checked)}
                  onToggleDone={onToggleDone}
                  onChangeStatus={onChangeStatus}
                  onOpen={() => onOpen(task)}
                  projectName={project?.name}
                  projectColor={project?.color}
                />
              )
            })}
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

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

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

  function handleToggleDone(task: Task) {
    const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    void moveTaskStatus({ id: task.id, status: nextStatus })
      .then(() =>
        toast.success(
          task.status === 'done' ? 'Tarefa reaberta.' : 'Tarefa concluída!',
        ),
      )
      .catch(() => toast.danger('Erro ao alterar status.'))
  }

  function handleChangeStatus(task: Task, nextStatus: TaskStatus) {
    if (task.status === nextStatus) return
    void moveTaskStatus({ id: task.id, status: nextStatus })
      .then(() =>
        toast.success(`Status alterado para ${STATUS_LABELS[nextStatus]}`),
      )
      .catch(() => toast.danger('Erro ao alterar status.'))
  }

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

  const emptyMessage = grouped
    ? 'Nenhuma tarefa por aqui.'
    : 'Nenhuma tarefa neste projeto.'

  return (
    <div className="p-4">
      {grouped ? (
        <div className="space-y-6">
          {sections.length === 0 && (
            <div className="rounded-md border border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground shadow-2xs">
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
                    className="size-2.5 rounded-full shadow-2xs"
                    style={{ backgroundColor: project?.color ?? '#94A3B8' }}
                  />
                  <h2 className="text-xs font-bold text-foreground">
                    {project?.name ?? 'Sem projeto'}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {sectionRows.length} tarefa(s)
                  </span>
                </header>
                <div className="rounded-md border border-border bg-background shadow-2xs">
                  <TasksTable
                    rows={sectionRows}
                    selected={selected}
                    emptyMessage={emptyMessage}
                    onToggle={toggleOne}
                    onToggleDone={handleToggleDone}
                    onChangeStatus={handleChangeStatus}
                    onOpen={onOpenTask}
                    toggleAll={toggleAll}
                    memberOf={memberOf}
                    countSubtasks={countSubtasks}
                    projectById={projectById}
                  />
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-background shadow-2xs">
          <TasksTable
            rows={rows}
            selected={selected}
            emptyMessage={emptyMessage}
            onToggle={toggleOne}
            onToggleDone={handleToggleDone}
            onChangeStatus={handleChangeStatus}
            onOpen={onOpenTask}
            toggleAll={toggleAll}
            memberOf={memberOf}
            countSubtasks={countSubtasks}
            projectById={projectById}
          />
        </div>
      )}

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-popover px-4 py-2.5 shadow-lg animate-in slide-in-from-bottom-2">
          <span className="text-xs font-bold">
            {selected.size} selecionada(s)
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Mover para:</span>
            <Select.Root
              selectedKey={null}
              onSelectionChange={(value) =>
                void moveSelected(value as TaskStatus)
              }
              aria-label="Mover selecionadas"
              className="w-40"
              placeholder="Escolher status"
            >
              <Select.Trigger className="rounded-md border border-border bg-background">
                <Select.Value />
              </Select.Trigger>
              <Select.Popover>
                <ListBox.Root className="rounded-md border border-border bg-card">
                  {TASK_STATUSES.map((status) => (
                    <ListBox.Item
                      key={status}
                      id={status}
                      textValue={STATUS_LABELS[status]}
                    >
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
              className="rounded-md"
              onPress={() => setConfirmDelete(true)}
            >
              <i className="fa-solid fa-trash mr-1" />
              Excluir
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-md"
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
          <AlertDialog.Dialog className="rounded-md border border-border bg-card sm:max-w-md">
            <AlertDialog.Header>
              <AlertDialog.Heading>Excluir tarefas selecionadas?</AlertDialog.Heading>
              <p className="text-sm text-muted-foreground">
                Esta ação é definitiva. As {selected.size} tarefa(s) selecionadas
                serão excluídas (junto com suas subtarefas).
              </p>
            </AlertDialog.Header>
            <AlertDialog.Body />
            <AlertDialog.Footer>
              <Button variant="outline" className="rounded-md" onPress={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" className="rounded-md" onPress={() => void deleteSelected()}>
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