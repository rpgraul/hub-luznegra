import { useMemo, useState, useRef, useEffect } from 'react'
import {
  toast,
  Button,
  Checkbox,
  AlertDialog,
} from '@heroui/react'
import { userColor, userRowColor } from '@/utils/colors'
import { formatDate, todayIso } from '@/utils/format'
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/utils/status'
import type { ProjectMember } from '@/lib/api/members'
import type { Project, Task, TaskPriority, TaskStatus, Json } from '@/types/database'

interface ListViewProps {
  tasks: Task[]
  projects: Project[]
  grouped: boolean
  onOpenTask: (task: Task) => void
  memberOf: (id: string | null) => ProjectMember | null
  moveTaskStatus: (args: { id: string; status: TaskStatus }) => Promise<unknown>
  updateTask?: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
  deleteTask: (id: string) => Promise<unknown>
}

type SortField = 'status' | 'due_date' | 'priority' | 'title'
type SortDirection = 'asc' | 'desc'
type EditableField = 'title' | 'description' | 'due_date' | 'priority'

const STATUS_ORDER: Record<Task['status'], number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  review: 3,
  done: 4,
}

const PRIORITY_ORDER: Record<Task['priority'], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
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

function buildSimpleLexicalJson(text: string): Json {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'text',
              text,
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
          ],
          direction: 'ltr',
        },
      ],
      direction: 'ltr',
    },
  } as unknown as Json
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
  onCommitField: (taskId: string, field: EditableField, value: string) => void
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
  onCommitField,
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

  const descriptionText = extractDescriptionText(task.description)

  // Inline editing local state
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingField) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingField])

  function startEdit(field: EditableField, initial: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    setEditingField(field)
    setDraftValue(initial)
  }

  function commitEdit() {
    if (!editingField) return
    const field = editingField
    const val = draftValue.trim()
    setEditingField(null)
    onCommitField(task.id, field, val)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setEditingField(null)
    }
  }

  return (
    <tr
      style={rowStyle}
      onDoubleClick={onOpen}
      className={`group border-b border-border/60 transition-colors select-none ${
        selected ? 'bg-primary/5' : isDone ? 'bg-emerald-500/5' : 'hover:bg-muted/30'
      }`}
    >
      {/* Selection Checkbox */}
      <td onClick={(e) => e.stopPropagation()} className="w-8 px-2 py-2 text-center">
        <Checkbox
          isSelected={selected}
          onChange={(checked) => onToggle(checked)}
          aria-label={`Selecionar ${task.title}`}
          className="cursor-pointer"
        />
      </td>

      {/* Quick Done Checkbox */}
      <td onClick={(e) => e.stopPropagation()} className="w-8 px-1 py-2 text-center">
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
      </td>

      {/* Task Title & Inline Description */}
      <td className="px-3 py-2">
        <div
          className="flex flex-col gap-1"
          style={{ paddingLeft: isChild ? 22 : 0 }}
        >
          {/* Title Row */}
          <div className="flex items-center gap-2 text-xs font-semibold">
            {isChild && (
              <i className="fa-solid fa-turn-down text-xs text-muted-foreground" />
            )}

            {editingField === 'title' ? (
              <input
                ref={inputRef}
                type="text"
                value={draftValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraftValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitEdit}
                className="w-full rounded-md border border-[#7b68ee] bg-background px-1.5 py-0.5 text-xs font-bold text-foreground focus:outline-none shadow-xs"
              />
            ) : (
              <span
                onDoubleClick={(e) => startEdit('title', task.title, e)}
                title="2 cliques para editar o título inline"
                className={`cursor-pointer transition hover:text-[#7b68ee] ${
                  isDone
                    ? 'text-muted-foreground line-through'
                    : overdue
                      ? 'text-rose-600 font-bold'
                      : 'text-foreground'
                }`}
              >
                {task.title}
              </span>
            )}

            {/* Explicit Edit Icon Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
              title="Abrir modal de detalhes"
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground/50 opacity-0 transition hover:bg-muted hover:text-[#7b68ee] group-hover:opacity-100"
            >
              <i className="fa-regular fa-pen-to-square text-[11px]" />
            </button>
          </div>

          {/* Description Row (Inline Editable on 2 Clicks) */}
          {editingField === 'description' ? (
            <input
              ref={inputRef}
              type="text"
              value={draftValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commitEdit}
              placeholder="Digite a descrição (Enter salva)..."
              className="w-full rounded-md border border-[#7b68ee] bg-background px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none shadow-xs"
            />
          ) : (
            <p
              onDoubleClick={(e) => startEdit('description', descriptionText, e)}
              title="2 cliques para editar a descrição inline"
              className={`line-clamp-1 cursor-pointer text-[11px] font-normal transition hover:text-foreground ${
                descriptionText
                  ? 'text-muted-foreground/80'
                  : 'text-muted-foreground/40 italic hover:text-muted-foreground'
              }`}
            >
              {descriptionText || '+ Adicionar descrição (2 cliques)...'}
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
      </td>

      {/* Assignee */}
      <td className="px-3 py-2">
        <AssigneeCell member={memberLookup(task.assigned_to)} />
      </td>

      {/* Status (Clickable Dropdown) */}
      <td onClick={(e) => e.stopPropagation()} className="px-3 py-2">
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
      </td>

      {/* Priority (Editable on Click or Select) */}
      <td onClick={(e) => e.stopPropagation()} className="px-3 py-2">
        <select
          value={task.priority}
          onChange={(e) => onCommitField(task.id, 'priority', e.target.value)}
          aria-label={`Prioridade de ${task.title}`}
          className="cursor-pointer rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs font-semibold shadow-2xs transition hover:border-border focus:border-primary"
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS_SHORT[p]}
            </option>
          ))}
        </select>
      </td>

      {/* Due Date (Inline Editable on 2 Clicks / Date Input) */}
      <td className="px-3 py-2">
        {editingField === 'due_date' ? (
          <input
            ref={inputRef}
            type="date"
            value={draftValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            className="rounded-md border border-[#7b68ee] bg-background px-1.5 py-0.5 text-xs font-semibold text-foreground focus:outline-none shadow-xs"
          />
        ) : (
          <span
            onDoubleClick={(e) => startEdit('due_date', task.due_date ?? '', e)}
            title="2 cliques para editar data inline"
            className={`cursor-pointer transition hover:text-[#7b68ee] text-xs ${
              overdue
                ? 'font-bold text-rose-600'
                : task.due_date
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/40 italic'
            }`}
          >
            {task.due_date ? formatDate(task.due_date) : '— definir data —'}
          </span>
        )}
      </td>

      {/* Subtasks Count */}
      <td className="px-3 py-2 text-center text-xs text-muted-foreground">
        {childrenCount > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold">
            <i className="fa-solid fa-list-check text-[10px]" />
            {childrenCount}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}

interface TasksTableProps {
  rows: Task[]
  selected: Set<string>
  emptyMessage: string
  onToggle: (taskId: string, checked: boolean) => void
  onToggleDone: (task: Task) => void
  onChangeStatus: (task: Task, status: TaskStatus) => void
  onCommitField: (taskId: string, field: EditableField, value: string) => void
  onOpen: (task: Task) => void
  toggleAll: (checked: boolean) => void
  memberOf: (id: string | null) => ProjectMember | null
  countSubtasks: (task: Task) => number
  projectById?: Map<string, Project>
  onSortBy: (field: SortField) => void
  currentSortField: SortField
  currentSortDir: SortDirection
}

function TasksTable({
  rows,
  selected,
  emptyMessage,
  onToggle,
  onToggleDone,
  onChangeStatus,
  onCommitField,
  onOpen,
  toggleAll,
  memberOf,
  countSubtasks,
  projectById,
  onSortBy,
  currentSortField,
  currentSortDir,
}: TasksTableProps) {
  const allSelected =
    rows.length > 0 && rows.every((task) => selected.has(task.id))
  const partialSelected = selected.size > 0 && !allSelected

  function renderSortIcon(field: SortField) {
    if (currentSortField !== field) {
      return <i className="fa-solid fa-sort ml-1 text-[10px] opacity-40 group-hover:opacity-100" />
    }
    return (
      <i
        className={`fa-solid fa-sort-${currentSortDir === 'asc' ? 'up' : 'down'} ml-1 text-[10px] text-[#7b68ee]`}
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      {/* Table Top Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            isSelected={allSelected}
            isIndeterminate={partialSelected}
            onChange={(checked) => toggleAll(checked)}
            aria-label="Selecionar todas"
            className="cursor-pointer"
          />
          <span className="text-xs font-bold text-foreground">
            Selecionar todas
          </span>
        </label>
        <span className="text-xs font-semibold text-muted-foreground">
          {rows.length} tarefa(s) • <span className="font-normal opacity-90">2 cliques em qualquer texto para editar inline</span>
        </span>
      </div>

      {/* High-contrast, crystal-clear ClickUp table header */}
      <table className="w-full border-collapse text-xs">
        <thead className="border-b border-border bg-slate-100 dark:bg-slate-850">
          <tr className="text-slate-800 dark:text-slate-100">
            <th className="w-8 px-2 py-2.5 text-center font-bold">
              <span className="sr-only">Selecionar</span>
            </th>
            <th className="w-8 px-1 py-2.5 text-center font-bold">
              <span className="sr-only">Concluir</span>
            </th>
            <th className="px-3 py-2.5 text-left font-bold text-slate-800 dark:text-slate-100">
              <button
                type="button"
                onClick={() => onSortBy('title')}
                className="group flex items-center font-bold text-slate-800 dark:text-slate-100 hover:text-[#7b68ee] cursor-pointer"
              >
                <span>Título & Descrição</span>
                {renderSortIcon('title')}
              </button>
            </th>
            <th className="px-3 py-2.5 text-left font-bold text-slate-800 dark:text-slate-100">
              Responsável
            </th>
            <th className="px-3 py-2.5 text-left font-bold text-slate-800 dark:text-slate-100">
              <button
                type="button"
                onClick={() => onSortBy('status')}
                className="group flex items-center font-bold text-slate-800 dark:text-slate-100 hover:text-[#7b68ee] cursor-pointer"
              >
                <span>Status</span>
                {renderSortIcon('status')}
              </button>
            </th>
            <th className="px-3 py-2.5 text-left font-bold text-slate-800 dark:text-slate-100">
              <button
                type="button"
                onClick={() => onSortBy('priority')}
                className="group flex items-center font-bold text-slate-800 dark:text-slate-100 hover:text-[#7b68ee] cursor-pointer"
              >
                <span>Prioridade</span>
                {renderSortIcon('priority')}
              </button>
            </th>
            <th className="px-3 py-2.5 text-left font-bold text-slate-800 dark:text-slate-100">
              <button
                type="button"
                onClick={() => onSortBy('due_date')}
                className="group flex items-center font-bold text-slate-800 dark:text-slate-100 hover:text-[#7b68ee] cursor-pointer"
              >
                <span>Vencimento</span>
                {renderSortIcon('due_date')}
              </button>
            </th>
            <th className="px-3 py-2.5 text-center font-bold text-slate-800 dark:text-slate-100">
              Subtarefas
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
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
                onCommitField={onCommitField}
                onOpen={() => onOpen(task)}
                projectName={project?.name}
                projectColor={project?.color}
              />
            )
          })}
        </tbody>
      </table>
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
  updateTask,
  deleteTask,
}: ListViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sortField, setSortField] = useState<SortField>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  function handleSortBy(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  function handleCommitField(taskId: string, field: EditableField, value: string) {
    if (!updateTask) return
    const patch: Partial<Task> = {}
    if (field === 'title') {
      if (!value) return
      patch.title = value
    } else if (field === 'description') {
      patch.description = buildSimpleLexicalJson(value)
    } else if (field === 'due_date') {
      patch.due_date = value || null
    } else if (field === 'priority') {
      patch.priority = value as TaskPriority
    }

    void updateTask({ id: taskId, patch })
      .then(() => toast.success('Campo atualizado!'))
      .catch(() => toast.danger('Erro ao salvar alteração.'))
  }

  const rows = useMemo(() => {
    const parents = tasks.filter((task) => !task.parent_id)

    parents.sort((a, b) => {
      let cmp = 0
      if (sortField === 'status') {
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      } else if (sortField === 'priority') {
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      } else if (sortField === 'due_date') {
        const da = a.due_date ?? '9999-99-99'
        const db = b.due_date ?? '9999-99-99'
        cmp = da.localeCompare(db)
      } else if (sortField === 'title') {
        cmp = a.title.localeCompare(b.title, 'pt-BR')
      }

      if (cmp === 0) {
        cmp = a.order_index - b.order_index
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    const all: Task[] = []
    for (const parent of parents) {
      all.push(parent)
      const subtasks = tasks
        .filter((task) => task.parent_id === parent.id)
        .sort((a, b) => a.order_index - b.order_index)
      all.push(...subtasks)
    }
    return all
  }, [tasks, sortField, sortDirection])

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
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Top Filter & Sort Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/40 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground">
            Ordenar por:
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={sortField === 'status' ? 'secondary' : 'outline'}
              className="h-7 px-2 text-xs rounded-md font-semibold"
              onPress={() => handleSortBy('status')}
            >
              Status
            </Button>
            <Button
              size="sm"
              variant={sortField === 'due_date' ? 'secondary' : 'outline'}
              className="h-7 px-2 text-xs rounded-md font-semibold"
              onPress={() => handleSortBy('due_date')}
            >
              Data
            </Button>
            <Button
              size="sm"
              variant={sortField === 'priority' ? 'secondary' : 'outline'}
              className="h-7 px-2 text-xs rounded-md font-semibold"
              onPress={() => handleSortBy('priority')}
            >
              Prioridade
            </Button>
            <Button
              size="sm"
              variant={sortField === 'title' ? 'secondary' : 'outline'}
              className="h-7 px-2 text-xs rounded-md font-semibold"
              onPress={() => handleSortBy('title')}
            >
              Título
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {rows.length} tarefa(s) no total
          </span>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-y-auto p-4">
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
                  <div className="rounded-md border border-border bg-background shadow-2xs overflow-hidden">
                    <TasksTable
                      rows={sectionRows}
                      selected={selected}
                      emptyMessage={emptyMessage}
                      onToggle={toggleOne}
                      onToggleDone={handleToggleDone}
                      onChangeStatus={handleChangeStatus}
                      onCommitField={handleCommitField}
                      onOpen={onOpenTask}
                      toggleAll={toggleAll}
                      memberOf={memberOf}
                      countSubtasks={countSubtasks}
                      projectById={projectById}
                      onSortBy={handleSortBy}
                      currentSortField={sortField}
                      currentSortDir={sortDirection}
                    />
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="rounded-md border border-border bg-background shadow-2xs overflow-hidden">
            <TasksTable
              rows={rows}
              selected={selected}
              emptyMessage={emptyMessage}
              onToggle={toggleOne}
              onToggleDone={handleToggleDone}
              onChangeStatus={handleChangeStatus}
              onCommitField={handleCommitField}
              onOpen={onOpenTask}
              toggleAll={toggleAll}
              memberOf={memberOf}
              countSubtasks={countSubtasks}
              projectById={projectById}
              onSortBy={handleSortBy}
              currentSortField={sortField}
              currentSortDir={sortDirection}
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
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    void moveSelected(e.target.value as TaskStatus)
                    e.target.value = ''
                  }
                }}
                aria-label="Mover selecionadas"
                className="w-40 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold"
              >
                <option value="" disabled>Escolher status...</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
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
      </div>

      {/* Shortcuts & Quick Commands Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/40 px-4 py-1.5 text-[11px] text-muted-foreground select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs font-bold text-foreground">
              2 cliques no texto
            </kbd>
            <span>Editar inline (Enter salva, Esc cancela)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs font-bold text-foreground">
              2 cliques na linha / Lápis
            </kbd>
            <span>Abrir painel de detalhes</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted/80 px-1 py-0.5 text-[10px] font-mono shadow-2xs font-bold text-foreground">
              Círculo
            </kbd>
            <span>Concluir / Reabrir</span>
          </span>
        </div>

        <div>
          <span className="text-[10px] opacity-75">
            Ordenado por:{' '}
            <strong className="text-foreground capitalize">{sortField}</strong> (
            {sortDirection === 'asc' ? 'Crescente' : 'Decrescente'})
          </span>
        </div>
      </div>

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