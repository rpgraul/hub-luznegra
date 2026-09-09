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
  Project,
  TaskPriority,
  TaskStatus,
} from '@/types/database'

export interface NewSubtaskInput {
  title: string
  due_date: string | null
}

export interface NewTaskInput {
  title: string
  project_id: string
  status: TaskStatus
  priority: TaskPriority
  assigned_to: string | null
  assignees: string[]
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  description: SerializedEditorState | null
  subtasks: NewSubtaskInput[]
}

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  initialProjectId: string | null
  initialStartDate?: string | null
  currentUserId: string
  onCreate: (input: NewTaskInput) => Promise<void>
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

export default function NewTaskModal({
  open,
  onOpenChange,
  projects,
  initialProjectId,
  initialStartDate,
  currentUserId,
  onCreate,
}: NewTaskModalProps) {
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignees, setAssignees] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [hours, setHours] = useState('')
  const [description, setDescription] =
    useState<SerializedEditorState | null>(null)
  const [subtasks, setSubtasks] = useState<NewSubtaskInput[]>([])
  const [subtaskInput, setSubtaskInput] = useState('')
  const [subtaskDueDate, setSubtaskDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)
  const { members } = useProjectMembers(projectId || null)

  useEffect(() => {
    if (!open) return
    setProjectId(initialProjectId ?? projects[0]?.id ?? '')
    setTitle('')
    setStatus('todo')
    setPriority('medium')
    setAssignees(currentUserId ? [currentUserId] : [])
    const initDate = initialStartDate ? initialStartDate.slice(0, 10) : ''
    setStartDate(initDate)
    setDueDate(initDate)
    setHours('')
    setDescription(null)
    setSubtasks([])
    setSubtaskInput('')
    setSubtaskDueDate('')
    setError(null)
    setSubmitting(false)
    setTimeout(() => titleRef.current?.focus(), 80)
  }, [open, initialProjectId, initialStartDate, projects, currentUserId])

  function toggleAssignee(userId: string) {
    setAssignees((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    )
  }

  function addSubtask() {
    const value = subtaskInput.trim()
    if (!value) return
    setSubtasks((prev) => [
      ...prev,
      { title: value, due_date: subtaskDueDate || null },
    ])
    setSubtaskInput('')
    setSubtaskDueDate('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !projectId) {
      setError('Preencha o título e selecione um projeto.')
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
      await onCreate({
        title: title.trim(),
        project_id: projectId,
        status,
        priority,
        assigned_to: assignees.length > 0 ? assignees[0] : null,
        assignees,
        start_date: startDate || null,
        due_date: dueDate || null,
        estimated_hours,
        description,
        subtasks,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar tarefa.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !submitting && title.trim() !== '' && projectId !== ''
  const selectedProject = projects.find((p) => p.id === projectId)

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange} isDismissable={false}>
      <Modal.Container>
        <Modal.Dialog className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl">
          {/* Header */}
          <Modal.Header className="shrink-0 border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <i className="fa-solid fa-list-check text-sm text-primary" />
              </div>
              <div>
                <Modal.Heading className="text-base font-bold">Nova tarefa</Modal.Heading>
                {selectedProject && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: selectedProject.color }} />
                    {selectedProject.name}
                  </p>
                )}
              </div>
            </div>
          </Modal.Header>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Modal.Body className="min-h-0 flex-1 space-y-5 overflow-y-auto py-5">

              {/* ── Título ── */}
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

              {/* ── Seção: Projeto / Status / Prioridade / Responsável ── */}
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <i className="fa-solid fa-sliders text-[10px]" />
                  Configurações
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {/* Projeto */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-foreground/70">Projeto</label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      required
                      className="w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none transition hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/20"
                    >
                      <option value="" disabled>Selecione…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {/* Color swatch preview */}
                    {selectedProject && (
                      <div className="flex items-center gap-1.5 px-0.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: selectedProject.color }} />
                        <span className="text-[10px] text-muted-foreground">{selectedProject.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Status */}
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

                  {/* Prioridade */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-foreground/70">Prioridade</label>
                    <div className="flex gap-1.5">
                      {TASK_PRIORITIES.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className="flex-1 rounded-lg border border-border px-2 py-1.5 text-[10px] font-semibold text-foreground transition"
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

                  {/* Responsáveis */}
                  <div className="col-span-2 space-y-1">
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
                          <option
                            key={m.id}
                            value={m.id}
                            disabled={assignees.includes(m.id)}
                          >
                            {m.full_name ?? m.username}{' '}
                            {assignees.includes(m.id) ? '✓' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Seção: Datas & Horas ── */}
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <i className="fa-regular fa-calendar text-[10px]" />
                  Prazo & Esforço
                </p>
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
                        placeholder="Ex.: 4"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-8 text-xs text-foreground outline-none transition hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/20"
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">h</span>
                    </div>
                  </div>
                </div>
                {/* Date validation warning */}
                {startDate && dueDate && dueDate < startDate && (
                  <p className="flex items-center gap-1.5 text-[11px] text-destructive">
                    <i className="fa-solid fa-triangle-exclamation text-[10px]" />
                    A data de conclusão está antes do início
                  </p>
                )}
              </div>

              {/* ── Seção: Descrição ── */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                  <i className="fa-regular fa-file-lines mr-1.5 text-[10px]" />
                  Descrição
                </label>
                <div className="rounded-xl border border-border bg-background overflow-hidden">
                  <LexicalEditor
                    initialValue={null}
                    onChange={setDescription}
                    placeholder="Descreva a tarefa, contexto, links úteis…"
                  />
                </div>
              </div>

              {/* ── Seção: Subtarefas ── */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                  <i className="fa-solid fa-list-check mr-1.5 text-[10px]" />
                  Subtarefas
                  {subtasks.length > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary/15 px-1.5 py-0 text-[9px] font-bold text-primary normal-case tracking-normal">
                      {subtasks.length}
                    </span>
                  )}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={subtaskInput}
                    onChange={(e) => setSubtaskInput(e.target.value)}
                    placeholder="Adicione uma subtarefa e pressione Enter…"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addSubtask() }
                    }}
                    className="flex-1 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex gap-2">
                    <DateInput
                      value={subtaskDueDate}
                      min={startDate || undefined}
                      onChange={setSubtaskDueDate}
                      title="Data final da subtarefa"
                      ariaLabel="Data final da subtarefa"
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none transition hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={addSubtask}
                      disabled={!subtaskInput.trim()}
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <i className="fa-solid fa-plus text-sm" />
                    </button>
                  </div>
                </div>
                {subtasks.length > 0 && (
                  <div className="space-y-1.5">
                    {subtasks.map((subtask, index) => (
                      <div
                        key={`${index}-${subtask.title}`}
                        className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm transition hover:border-border"
                      >
                        <i className="fa-regular fa-circle text-[10px] text-muted-foreground/50 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-foreground/90">{subtask.title}</span>
                        <DateInput
                          value={subtask.due_date ?? ''}
                          min={startDate || undefined}
                          onChange={(iso) =>
                            setSubtasks((prev) =>
                              prev.map((s, j) =>
                                j === index ? { ...s, due_date: iso || null } : s,
                              ),
                            )
                          }
                          title="Data final da subtarefa"
                          ariaLabel={`Data final de ${subtask.title}`}
                          className="shrink-0 rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground outline-none transition hover:border-primary/50 focus:border-primary"
                        />
                        <button
                          type="button"
                          aria-label={`Remover ${subtask.title}`}
                          onClick={() =>
                            setSubtasks((prev) => prev.filter((_, j) => j !== index))
                          }
                          className="shrink-0 text-muted-foreground/40 transition hover:text-destructive group-hover:opacity-100"
                        >
                          <i className="fa-solid fa-xmark text-xs" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Erro */}
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
                    Criar tarefa
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
