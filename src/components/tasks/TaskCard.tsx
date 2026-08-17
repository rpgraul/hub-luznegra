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
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen(task)
      }}
      className={`group relative w-full cursor-pointer rounded-lg border border-border/80 bg-card p-3 text-left shadow-2xs transition-all hover:border-primary/50 hover:shadow-xs select-none ${
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

      {/* Title & Priority */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {onToggleDone && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleDone(task)
              }}
              title={task.status === 'done' ? 'Reabrir' : 'Concluir'}
              className="mt-0.5 shrink-0 text-muted-foreground/60 hover:text-emerald-600 transition"
            >
              {task.status === 'done' ? (
                <i className="fa-solid fa-circle-check text-emerald-500 text-sm" />
              ) : (
                <i className="fa-regular fa-circle text-xs hover:scale-110" />
              )}
            </button>
          )}

          <p
            className={`line-clamp-2 font-medium text-xs leading-snug text-foreground ${
              task.status === 'done' ? 'text-muted-foreground line-through' : ''
            }`}
          >
            {task.title}
          </p>
        </div>

        <i
          className={`fa-solid ${PRIORITY_ICONS[task.priority]} shrink-0 text-xs ${
            task.priority === 'urgent'
              ? 'text-rose-500'
              : task.priority === 'high'
                ? 'text-amber-500'
                : 'text-muted-foreground/60'
          }`}
          aria-label={`Prioridade ${task.priority}`}
        />
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
            className="inline-flex items-center rounded-md bg-[#7b68ee]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#7b68ee] border border-[#7b68ee]/20"
          >
            #{tag}
          </span>
        ))}
      </div>

      {/* Details Row: Dates, Hours, Subtasks */}
      {!compact && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-y-1 text-[11px] text-muted-foreground border-t border-border/40 pt-2">
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
              title="Expandir subtarefas"
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              <i className="fa-solid fa-list-check text-[10px]" />
              <span>
                {completedSubtasks}/{totalSubtasks}
              </span>
              <i
                className={`fa-solid fa-chevron-${
                  subtasksExpanded ? 'up' : 'down'
                } text-[8px]`}
              />
            </button>
          )}
        </div>
      )}

      {/* Subtasks Expandable Checklist */}
      {subtasksExpanded && totalSubtasks > 0 && (
        <div
          className="mt-2 space-y-1 rounded-md border border-border/80 bg-background/90 p-2 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div className="mb-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${subtaskPct}%` }}
              />
            </div>
            <span>{subtaskPct}%</span>
          </div>

          {/* Subtasks List */}
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {subtasks.map((subtask) => (
              <div
                key={subtask.id}
                className="flex items-center gap-2 rounded px-1.5 py-0.5 hover:bg-muted/50 transition"
              >
                <button
                  type="button"
                  onClick={() =>
                    onToggleSubtask?.(subtask, subtask.status !== 'done')
                  }
                  className="text-muted-foreground hover:text-emerald-600"
                >
                  {subtask.status === 'done' ? (
                    <i className="fa-solid fa-square-check text-emerald-500 text-xs" />
                  ) : (
                    <i className="fa-regular fa-square text-xs" />
                  )}
                </button>
                <span
                  onClick={() => onOpen(subtask)}
                  className={`flex-1 truncate cursor-pointer text-[11px] ${
                    subtask.status === 'done'
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {subtask.title}
                </span>
              </div>
            ))}
          </div>

          {/* Quick Add Subtask Input */}
          {onCreateSubtask && (
            <div className="mt-1 pt-1 border-t border-border/40">
              <input
                type="text"
                placeholder="+ Adicionar subtarefa (Enter)..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={handleCreateSubtaskSubmit}
                className="w-full bg-transparent px-1 py-0.5 text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}