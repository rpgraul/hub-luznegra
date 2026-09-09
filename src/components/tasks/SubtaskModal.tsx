import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Modal } from '@heroui/react'
import DateInput from '@/components/ui/DateInput'
import LexicalEditor from '@/components/tasks/LexicalEditor'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { userColor } from '@/utils/colors'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/utils/status'
import type { SerializedEditorState } from 'lexical'
import type {
  Json,
  Project,
  Task,
  TaskPriority,
  TaskStatus,
} from '@/types/database'
import type { NewTaskInput } from '@/lib/api/tasks'

interface SubtaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parent: Task | null
  projects: Project[]
  currentUserId: string
  createTask: (input: NewTaskInput) => Promise<Task>
  onCreated?: () => void
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: '#64748b',
  todo: '#0284c7',
  in_progress: '#7c3aed',
  review: '#a855f7',
  done: '#10b981',
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  urgent: '#ef4444',
}

function parentAssignees(parent: Task): string[] {
  if (parent.assignees && parent.assignees.length > 0) return [...parent.assignees]
  if (parent.assigned_to) return [parent.assigned_to]
  return []
}

export default function SubtaskModal({
  open,
  onOpenChange,
  parent,
  projects,
  currentUserId,
  createTask,
  onCreated,
}: SubtaskModalProps) {
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignees, setAssignees] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [hours, setHours] = useState('')
  const [description, setDescription] =
    useState<SerializedEditorState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)
  const { members } = useProjectMembers(parent?.project_id ?? null)

  useEffect(() => {
    if (!open || !parent) return
    setTitle('')
    setStatus('todo')
    setPriority(parent.priority ?? 'medium')
    const inherited = parentAssignees(parent)
    setAssignees(inherited.length > 0 ? inherited : currentUserId ? [currentUserId] : [])
    setStartDate(parent.start_date ?? '')
    setDueDate(parent.due_date ?? '')
    setHours('')
    setDescription(null)
    setError(null)
    setSubmitting(false)
    setTimeout(() => titleRef.current?.focus(), 80)
  }, [open, parent, currentUserId])

  function toggleAssignee(userId: string) {
    setAssignees((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!parent) return
    if (!title.trim()) {
      setError('Dê um título para a subtarefa.')
      return
    }
    if (!parent.project_id) {
      setError('A tarefa pai não tem projeto definido.')
      return
    }
    if (startDate && dueDate && startDate > dueDate) {
      setError('A data de início não pode ser depois da conclusão.')
      return
    }
    setSubmitting(true)
    setError(null)
    const parsedHours = Number.parseFloat(hours)
    const estimated_hours =
      hours.trim() === '' || Number.isNaN(parsedHours) ? null : parsedHours
    try {
      await createTask({
        title: title.trim(),
        project_id: parent.project_id,
        parent_id: parent.id,
        status,
        priority,
        assigned_to: assignees.length > 0 ? assignees[0] : null,
        assignees: assignees.length > 0 ? assignees : null,
        start_date: startDate || null,
        due_date: dueDate || null,
        estimated_hours,
        description: description as unknown as Json,
      })
      onOpenChange(false)
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar subtarefa.')
    } finally {
      setSubmitting(false)
    }
  }

  const parentProject = parent?.project_id
    ? projects.find((p) => p.id === parent.project_id)
    : null
  const canSubmit = !submitting && title.trim() !== '' && !!parent

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange} isDismissable={false}>
      <Modal.Container>
        <Modal.Dialog className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-xl">
          <Modal.Header className="shrink-0 border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <i className="fa-solid fa-diagram-project text-sm text-primary" />
              </div>
              <div className="min-w-0">
                <Modal.Heading className="text-base font-bold">Nova subtarefa</Modal.Heading>
                {parent && (
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <i className="fa-solid fa-turn-down text-[10px]" />
                    <span className="truncate">{parent.title}</span>
                    {parentProject && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.2 text-[9px] font-semibold"
                        style={{
                          color: parentProject.color,
                          backgroundColor: `${parentProject.color}15`,
                        }}
                      >
                        {parentProject.name}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </Modal.Header>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Modal.Body className="min-h-0 flex-1 space-y-5 overflow-y-auto py-5">
              {/* Título */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                  Título <span className="text-destructive">*</span>
                </label>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="O que precisa ser feito?"
                  required
                  className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 outline-none transition focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Status / Prioridade */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-foreground/70">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold outline-none transition hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/20"
                    style={{ color: STATUS_COLORS[status] }}
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s} style={{ color: STATUS_COLORS[s] }}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-foreground/70">Prioridade</label>
                  <div className="flex gap-1.5">
                    {TASK_PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        title={PRIORITY_LABELS[p]}
                        className="flex-1 rounded-lg border border-border px-1 py-1.5 text-[10px] font-semibold text-foreground transition"
                        style={{
                          borderColor: priority === p ? PRIORITY_COLORS[p] : undefined,
                          backgroundColor: priority === p ? `${PRIORITY_COLORS[p]}15` : undefined,
                          color: priority === p ? PRIORITY_COLORS[p] : undefined,
                        }}
                      >
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Responsáveis */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-foreground/70">
                  Responsáveis
                  {assignees.length > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary/15 px-1.5 py-0 text-[9px] font-bold text-primary">
                      {assignees.length}
                    </span>
                  )}
                </label>
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background p-2">
                  {assignees.length === 0 && (
                    <span className="mr-1 text-[11px] text-muted-foreground italic">
                      — nenhum responsável —
                    </span>
                  )}
                  {assignees.map((userId) => {
                    const m = members.find((x) => x.id === userId)
                    const name = m?.full_name ?? m?.username ?? 'Usuário'
                    return (
                      <span
                        key={userId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground"
                      >
                        <span
                          className="flex size-4 items-center justify-center rounded-full text-[8px] font-bold text-white"
                          style={{ backgroundColor: userColor(userId) }}
                        >
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => toggleAssignee(userId)}
                          className="cursor-pointer text-muted-foreground transition hover:text-red-500"
                          title="Remover responsável"
                        >
                          <i className="fa-solid fa-xmark text-[10px]" />
                        </button>
                      </span>
                    )
                  })}
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        toggleAssignee(e.target.value)
                        e.target.value = ''
                      }
                    }}
                    aria-label="Adicionar responsável"
                    className="cursor-pointer rounded-md border border-border/80 bg-background px-2 py-1 text-[11px] font-semibold text-[#7b68ee] hover:bg-muted/50"
                  >
                    <option value="" disabled>
                      + Adicionar…
                    </option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id} disabled={assignees.includes(m.id)}>
                        {m.full_name ?? m.username} {assignees.includes(m.id) ? '✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Datas & horas */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-foreground/70">Início</label>
                  <DateInput
                    value={startDate}
                    onChange={setStartDate}
                    ariaLabel="Data de início"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-foreground/70">Conclusão</label>
                  <DateInput
                    value={dueDate}
                    min={startDate || undefined}
                    onChange={setDueDate}
                    ariaLabel="Data de conclusão"
                    className={`w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground outline-none transition hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 ${
                      startDate && dueDate && dueDate < startDate
                        ? 'border-destructive text-destructive'
                        : 'border-border'
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-foreground/70">Horas est.</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      placeholder="Ex.: 2"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-8 text-xs text-foreground outline-none transition hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">h</span>
                  </div>
                </div>
              </div>
              {startDate && dueDate && dueDate < startDate && (
                <p className="flex items-center gap-1.5 text-[11px] text-destructive">
                  <i className="fa-solid fa-triangle-exclamation text-[10px]" />
                  A data de conclusão está antes do início
                </p>
              )}

              {/* Descrição */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                  <i className="fa-regular fa-file-lines mr-1.5 text-[10px]" />
                  Descrição
                </label>
                <div className="rounded-xl border border-border bg-background overflow-hidden">
                  <LexicalEditor
                    initialValue={null}
                    onChange={setDescription}
                    placeholder="Detalhes da subtarefa…"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
                  <i className="fa-solid fa-circle-exclamation shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer className="shrink-0 border-t border-border pt-3">
              <Button
                variant="outline"
                type="button"
                size="sm"
                className="rounded-xl border-border px-4 text-xs font-semibold"
                onPress={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                isDisabled={!canSubmit}
                className="rounded-xl bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin mr-2" />
                    Criando…
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-plus mr-2" />
                    Criar subtarefa
                  </>
                )}
              </Button>
            </Modal.Footer>
          </form>
          <Modal.CloseTrigger />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
