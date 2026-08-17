import { useState } from 'react'
import { PRIORITY_ICONS } from '@/utils/status'
import { formatDateRange, todayIso } from '@/utils/format'
import { userRowColor } from '@/utils/colors'
import type { Task } from '@/types/database'

interface TaskCardProps {
  task: Task
  subtasks?: Task[]
  onOpen: (task: Task) => void
  onToggleSubtask?: (subtask: Task, done: boolean) => void
  onToggleDone?: (task: Task) => void
  onCreateSubtask?: (parentId: string, title: string) => void
  compact?: boolean
  project?: { name: string; color: string } | null
  parentTaskTitle?: string | null
}

export default function TaskCard({
  task,
  subtasks = [],
  onOpen,
  onToggleSubtask,
  onToggleDone,
  onCreateSubtask,
  compact = false,
  project = null,
  parentTaskTitle = null,
}: TaskCardProps) {
  const [subtasksExpanded, setSubtasksExpanded] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

  const overdue =
    !!task.due_date &&
    task.status !== 'done' &&
    task.due_date < todayIso()

  const completedSubtasks = subtasks.filter((s) => s.status === 'done').length
  const totalSubtasks = subtasks.length
  const subtaskPct =
    totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0

  const rowStyle = task.assigned_to
    ? { backgroundColor: userRowColor(task.assigned_to) }
    : undefined

  function handleCreateSubtaskSubmit(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && newSubtaskTitle.trim() && onCreateSubtask) {
      e.preventDefault()
      e.stopPropagation()
      onCreateSubtask(task.id, newSubtaskTitle.trim())
      setNewSubtaskTitle('')
    }
  }

  return (
    <div
      style={rowStyle}
      onDoubleClick={() => onOpen(task)}
      className={`group relative w-full select-none rounded-md border border-border bg-card p-3 text-left shadow-2xs transition-all hover:border-[#7b68ee]/60 hover:shadow-xs ${
        task.status === 'done' ? 'opacity-75' : ''
      }`}
    >
      {/* Parent Task Badge (if this card is a subtask in standalone view) */}
      {parentTaskTitle && (
        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
          <i className="fa-solid fa-turn-down text-[9px]" />
          <span className="truncate">Subtarefa de: {parentTaskTitle}</span>
        </div>
      )}

      {/* Title, Quick Check & Edit Button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {onToggleDone && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleDone(task)
              }}
              title={task.status === 'done' ? 'Reabrir tarefa' : 'Marcar como concluída'}
              className="mt-0.5 shrink-0 cursor-pointer text-muted-foreground/60 transition hover:text-emerald-600"
            >
              {task.status === 'done' ? (
                <i className="fa-solid fa-circle-check text-sm text-emerald-500" />
              ) : (
                <i className="fa-regular fa-circle text-xs hover:scale-110" />
              )}
            </button>
          )}

          <p
            className={`line-clamp-2 text-xs font-semibold leading-snug text-foreground ${
              task.status === 'done' ? 'text-muted-foreground line-through' : ''
            }`}
          >
            {task.title}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <i
            className={`fa-solid ${PRIORITY_ICONS[task.priority]} text-xs ${
              task.priority === 'urgent'
                ? 'text-rose-500'
                : task.priority === 'high'
                  ? 'text-amber-500'
                  : 'text-muted-foreground/60'
            }`}
            aria-label={`Prioridade ${task.priority}`}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(task)
            }}
            title="Abrir detalhes da tarefa"
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground/50 opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
          >
            <i className="fa-regular fa-pen-to-square text-[11px]" />
          </button>
        </div>
      </div>

      {/* Project & Tags */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {project && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              color: project.color,
              backgroundColor: `${project.color}18`,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            {project.name}
          </span>
        )}

        {(task.tags ?? []).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-md border border-[#7b68ee]/30 bg-[#7b68ee]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#7b68ee]"
          >
            #{tag}
          </span>
        ))}
      </div>

      {/* Details Row: Dates, Hours, Subtasks */}
      {!compact && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          {task.start_date || task.due_date ? (
            <span
              className={`flex items-center gap-1 ${
                overdue ? 'font-semibold text-rose-600' : ''
              }`}
            >
              <i className="fa-regular fa-calendar text-[10px]" />
              {formatDateRange(task.start_date, task.due_date)}
            </span>
          ) : (
            <span />
          )}

          {totalSubtasks > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setSubtasksExpanded(!subtasksExpanded)
              }}
              title="Expandir checklist de subtarefas"
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/80 bg-muted/60 px-2 py-1 text-xs font-semibold text-foreground shadow-2xs transition hover:bg-muted"
            >
              <i className="fa-solid fa-list-check text-xs text-[#7b68ee]" />
              <span>
                {completedSubtasks}/{totalSubtasks} subtarefa{totalSubtasks !== 1 ? 's' : ''}
              </span>
              <i
                className={`fa-solid fa-chevron-${
                  subtasksExpanded ? 'up' : 'down'
                } text-[10px] text-muted-foreground`}
              />
            </button>
          )}
        </div>
      )}

      {/* Subtasks Expandable Checklist */}
      {subtasksExpanded && totalSubtasks > 0 && (
        <div
          className="mt-2 space-y-1 rounded-md border border-border bg-background/95 p-2 text-xs shadow-2xs"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div className="mb-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${subtaskPct}%` }}
              />
            </div>
            <span>{subtaskPct}%</span>
          </div>

          {/* Subtasks List - Clicking anywhere on the row toggles completion */}
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {subtasks.map((subtask) => (
              <div
                key={subtask.id}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSubtask?.(subtask, subtask.status !== 'done')
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/50 px-2 py-1 transition hover:bg-muted/60"
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className="cursor-pointer text-muted-foreground hover:text-emerald-600"
                >
                  {subtask.status === 'done' ? (
                    <i className="fa-solid fa-square-check text-xs text-emerald-500" />
                  ) : (
                    <i className="fa-regular fa-square text-xs" />
                  )}
                </button>
                <span
                  className={`flex-1 truncate text-[11px] ${
                    subtask.status === 'done'
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground font-medium'
                  }`}
                >
                  {subtask.title}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(subtask)
                  }}
                  title="Abrir subtarefa"
                  className="cursor-pointer text-muted-foreground/40 hover:text-foreground"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square text-[9px]" />
                </button>
              </div>
            ))}
          </div>

          {/* Quick Add Subtask Input */}
          {onCreateSubtask && (
            <div className="mt-1.5 border-t border-border/50 pt-1.5">
              <input
                type="text"
                placeholder="+ Adicionar subtarefa (Enter)..."
                value={newSubtaskTitle}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={handleCreateSubtaskSubmit}
                className="w-full rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-[#7b68ee] focus:outline-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}