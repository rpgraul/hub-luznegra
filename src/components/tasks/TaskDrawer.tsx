import { useEffect, useRef, useState } from 'react'
import {
  toast,
  Button,
  Label,
  Checkbox,
  Separator,
  Select,
  ListBox,
} from '@heroui/react'
import LexicalEditor from '@/components/tasks/LexicalEditor'
import StatusSelect from '@/components/tasks/StatusSelect'
import DateInput from '@/components/ui/DateInput'
import { useTaskComments } from '@/hooks/useTaskComments'
import { useProjectMembers } from '@/hooks/useProjectMembers'
import { userColor } from '@/utils/colors'
import { CATEGORY_SUGGESTIONS, categoryColors } from '@/utils/categories'
import { formatDateTime, todayIso } from '@/utils/format'
import {
  PRIORITY_LABELS,
  TASK_PRIORITIES,
} from '@/utils/status'
import type { SerializedEditorState } from 'lexical'
import type { Project, Task, TaskPriority, TaskStatus, Json } from '@/types/database'

interface TaskDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
  projectId: string | null
  projects: Project[]
  creator: {
    currentUserId: string
    createTask: (input: {
      title: string
      project_id: string
      parent_id?: string | null
      assigned_to?: string | null
      assignees?: string[] | null
      status?: TaskStatus
      start_date?: string | null
      due_date?: string | null
      description?: Json | null
      tags?: string[] | null
      categories?: string[] | null
    }) => Promise<Task>
    updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
    deleteTask: (id: string) => Promise<unknown>
    moveTaskStatus: (args: { id: string; status: TaskStatus }) => Promise<unknown>
    childrenOf: (id: string) => Task[]
    refreshTasks?: () => void
  }
}

const EMPTY_DESCRIPTION: SerializedEditorState = {
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    children: [],
    direction: 'ltr',
  },
}

/** Deep clone de JSON Lexical (evita compartilhar o template entre tarefas). */
function cloneDesc(
  src: SerializedEditorState | null | undefined,
): SerializedEditorState {
  try {
    if (src && Object.keys(src).length > 0) {
      return JSON.parse(JSON.stringify(src)) as SerializedEditorState
    }
  } catch {
    // cai no template vazio abaixo
  }
  return JSON.parse(JSON.stringify(EMPTY_DESCRIPTION)) as SerializedEditorState
}

/** Descrição da tarefa pronta para draft/editor (sempre clone novo). */
function taskDesc(task: Task | null): SerializedEditorState {
  const raw = task?.description as unknown
  // Legado/dado externo pode vir como string pura: converte para Lexical em
  // vez de entregar ao editor (que falharia no parse e abriria vazio).
  if (typeof raw === 'string') {
    const t = raw.trim()
    return t
      ? (buildSimpleLexicalJson(t) as unknown as SerializedEditorState)
      : cloneDesc(null)
  }
  return cloneDesc(raw as SerializedEditorState | null)
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

export default function TaskDrawer({
  open,
  onOpenChange,
  task: initialTask,
  projectId,
  projects,
  creator,
}: TaskDrawerProps) {
  // ATENÇÃO: o LexicalComposer lê `initialValue` SOMENTE no mount. Como o
  // drawer monta uma única vez por abertura e o `useEffect` de sincronia roda
  // DEPOIS do primeiro render, inicializar estes estados com vazio fazia o
  // editor nascer vazio mesmo com descrição salva — e o Salvamento seguinte
  // sobrescrevia o conteúdo bom com vazio. Por isso os inicializadores lazy
  // abaixo partem de `initialTask` (valor do primeiro mount).
  const [currentTask, setCurrentTask] = useState<Task | null>(initialTask ?? null)
  const [titleDraft, setTitleDraft] = useState(() => initialTask?.title ?? '')
  const [descriptionDraft, setDescriptionDraft] =
    useState<SerializedEditorState>(() => taskDesc(initialTask ?? null))
  // Valor inicial congelado no momento da abertura/troca de tarefa: é o que
  // alimenta o Lexical (que só lê `initialValue` no mount). Nunca passar o
  // draft vivo aqui, senão a troca pai <-> subtarefa monta o editor stale.
  const [editorInitial, setEditorInitial] =
    useState<SerializedEditorState>(() => taskDesc(initialTask ?? null))
  
  // New subtask inputs: criação SOMENTE explícita (botão ou Enter).
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskDesc, setNewSubtaskDesc] = useState('')
  const [newSubtaskDue, setNewSubtaskDue] = useState('')
  // Trava contra duplo Enter/clique rápido (evita subtarefa duplicada).
  const subtaskCommittingRef = useRef(false)
  const newSubtaskTitleRef = useRef<HTMLInputElement>(null)

  const [newComment, setNewComment] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [categoryInput, setCategoryInput] = useState('')
  const [createProjectId, setCreateProjectId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const isNew = !currentTask?.id

  const commentScrollRef = useRef<HTMLDivElement>(null)
  const comments = useTaskComments(currentTask?.id ?? null)
  const { members } = useProjectMembers(projectId)

  const titleTimer = useRef<number | undefined>(undefined)
  const descriptionTimer = useRef<number | undefined>(undefined)
  // Refs do autosave: evitam stale closure e permitem flush ao fechar/trocar.
  // Inicializadas com a tarefa do primeiro mount pelo mesmo motivo do lazy
  // init acima (efeito roda após o primeiro render).
  const loadedTaskIdRef = useRef<string | null>(initialTask?.id ?? null)
  // Último conteúdo confirmado pelo banco, POR tarefa: um save da tarefa A
  // nunca pode clobberar o controle da tarefa B ao navegar pai <-> subtarefa.
  const lastSavedDescByTask = useRef(
    new Map<string, string>(
      initialTask?.id
        ? [
            [
              initialTask.id,
              JSON.stringify(
                (initialTask.description as unknown as SerializedEditorState | null) ?? null,
              ),
            ],
          ]
        : [],
    ),
  )
  const pendingDescRef = useRef<{
    taskId: string
    json: SerializedEditorState
    serialized: string
  } | null>(null)
  const pendingTitleRef = useRef<{ taskId: string; title: string } | null>(null)
  const currentTaskRef = useRef<Task | null>(null)
  currentTaskRef.current = currentTask
  const descriptionDraftRef = useRef<SerializedEditorState>(descriptionDraft)
  descriptionDraftRef.current = descriptionDraft
  // Fila que serializa todos os writes de descrição/título do drawer: sem
  // ela, dois autosaves sobrepostos (pausa-digita-pausa rápido) concorrem e o
  // mais antigo pode vencer o mais novo no banco (last-write-wins invertido).
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  function chainSave<T>(fn: () => Promise<T>): Promise<T> {
    const run = saveChainRef.current.then(fn, fn)
    saveChainRef.current = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  // Sincroniza drafts APENAS quando troca o id da tarefa aberta. O efeito
  // antigo observava o objeto `currentTask` inteiro, então cada save otimista
  // (que cria um novo objeto) resetava o draft e matava a digitação em voo.
  useEffect(() => {
    const nextId = initialTask?.id ?? null
    if (nextId === loadedTaskIdRef.current) return
    loadedTaskIdRef.current = nextId
    // Qualquer edição pendente da tarefa anterior já foi despachada pelo
    // flush explícito de quem trocou; aqui só limpamos restos locais.
    window.clearTimeout(titleTimer.current)
    window.clearTimeout(descriptionTimer.current)
    pendingDescRef.current = null
    pendingTitleRef.current = null
    setCurrentTask(initialTask ?? null)
    if (!initialTask) {
      setTitleDraft('')
      const empty = cloneDesc(null)
      setDescriptionDraft(empty)
      descriptionDraftRef.current = empty
      setEditorInitial(empty)
      clearSubtaskDraft()
      setNewComment('')
      setTagInput('')
      setCategoryInput('')
      setCreateProjectId(projectId ?? projects[0]?.id ?? null)
      return
    }
    setTitleDraft(initialTask.title)
    const json = taskDesc(initialTask)
    setDescriptionDraft(json)
    descriptionDraftRef.current = json
    setEditorInitial(json)
    clearSubtaskDraft()
    lastSavedDescByTask.current.set(initialTask.id, JSON.stringify(json))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTask?.id])

  // Mantém o projeto default do modo "nova tarefa" sem resetar drafts.
  useEffect(() => {
    if (!currentTask) {
      setCreateProjectId(projectId ?? projects[0]?.id ?? null)
    }
  }, [projectId, projects, currentTask])

  useEffect(() => {
    if (!comments.comments.length) return
    commentScrollRef.current?.scrollTo({
      top: commentScrollRef.current.scrollHeight,
    })
  }, [comments.comments.length])

  // Flush mais recente sempre acessível ao cleanup de unmount (que tem [] deps).
  const flushDescRef = useRef(() => Promise.resolve())
  const flushTitleRef = useRef(() => Promise.resolve())

  useEffect(
    () => () => {
      // No unmount, despacha o pendente em vez de descartar: o update não
      // depende do componente montado.
      window.clearTimeout(titleTimer.current)
      window.clearTimeout(descriptionTimer.current)
      void flushDescRef.current().catch(() => {})
      void flushTitleRef.current().catch(() => {})
    },
    [],
  )

  function commitTaskPatch(patch: Partial<Task>, taskId?: string) {
    const target = currentTaskRef.current
    const id = taskId ?? target?.id
    if (!id) return
    setSaving(true)
    if (!taskId || taskId === target?.id) {
      setCurrentTask((prev) => (prev ? { ...prev, ...patch } : null))
    }
    void chainSave(() => creator.updateTask({ id, patch }))
      .then(() => {
        if ('description' in patch) {
          lastSavedDescByTask.current.set(id, JSON.stringify(patch.description ?? null))
          if (pendingDescRef.current?.taskId === id) pendingDescRef.current = null
        }
        creator.refreshTasks?.()
      })
      .catch((error) => {
        toast.danger(
          error instanceof Error
            ? `Não foi possível salvar: ${error.message}`
            : 'Não foi possível salvar as alterações.',
        )
      })
      .finally(() => {
        setSaving(false)
      })
  }

  /** Despacha imediatamente a descrição pendente (flush do debounce). */
  function flushPendingDescription(): Promise<void> {
    const pending = pendingDescRef.current
    if (!pending) return saveChainRef.current
    window.clearTimeout(descriptionTimer.current)
    pendingDescRef.current = null
    setSaving(true)
    if (import.meta.env.DEV) {
      console.log('[hub:desc] autosave', pending.taskId, `${pending.serialized.length} chars`)
    }
    return chainSave(() =>
      creator.updateTask({
        id: pending.taskId,
        patch: {
          description: pending.json as unknown as Task['description'],
        },
      }),
    )
      .then(() => {
        // Só marca como salvo se ainda for a tarefa relevante: evita que um
        // save da tarefa A clobbere o controle da tarefa B após navegação.
        lastSavedDescByTask.current.set(pending.taskId, pending.serialized)
        creator.refreshTasks?.()
        if (import.meta.env.DEV) {
          console.log('[hub:desc] autosave ok', pending.taskId)
        }
      })
      .catch((error) => {
        // Falha: recoloca na fila (se nada mais novo entrou) para retry.
        if (!pendingDescRef.current) pendingDescRef.current = pending
        console.error('[hub:desc] autosave falhou', pending.taskId, error)
        toast.danger(
          error instanceof Error
            ? `Não foi possível salvar a descrição: ${error.message}`
            : 'Não foi possível salvar a descrição.',
        )
        throw error
      })
      .finally(() => {
        setSaving(false)
      })
  }
  flushDescRef.current = flushPendingDescription

  function flushPendingTitle(): Promise<void> {
    const pending = pendingTitleRef.current
    if (!pending || !pending.title.trim()) return saveChainRef.current
    window.clearTimeout(titleTimer.current)
    pendingTitleRef.current = null
    return chainSave(() =>
      creator.updateTask({ id: pending.taskId, patch: { title: pending.title } }),
    )
      .then(() => {
        creator.refreshTasks?.()
      })
      .catch(() => {})
  }
  flushTitleRef.current = flushPendingTitle

  function openTaskDetails(task: Task) {
    // Rascunho de subtarefa não acompanha a navegação: limpa (a criação é
    // sempre explícita via botão/Enter, nunca automática).
    clearSubtaskDraft()
    // Trocar de tarefa (pai <-> subtarefa) sem antes dar flush perdia a
    // digitação em voo e ainda salvava no id errado via closure stale.
    const pendingDesc = pendingDescRef.current
    const pendingTitle = pendingTitleRef.current
    if (pendingDesc && pendingDesc.taskId !== task.id) {
      void flushPendingDescription().catch(() => {})
    }
    if (pendingTitle && pendingTitle.taskId !== task.id) {
      void flushPendingTitle().catch(() => {})
    }
    loadedTaskIdRef.current = task.id
    window.clearTimeout(titleTimer.current)
    window.clearTimeout(descriptionTimer.current)
    pendingDescRef.current = null
    pendingTitleRef.current = null
    setCurrentTask(task)
    setTitleDraft(task.title)
    const json = taskDesc(task)
    setDescriptionDraft(json)
    descriptionDraftRef.current = json
    setEditorInitial(json)
    lastSavedDescByTask.current.set(task.id, JSON.stringify(json))
  }

  function handleTitleChange(value: string) {
    setTitleDraft(value)
    const target = currentTaskRef.current
    if (!target) return
    pendingTitleRef.current = { taskId: target.id, title: value.trim() }
    window.clearTimeout(titleTimer.current)
    titleTimer.current = window.setTimeout(() => {
      const pending = pendingTitleRef.current
      if (!pending || !pending.title) return
      pendingTitleRef.current = null
      commitTaskPatch({ title: pending.title }, pending.taskId)
    }, 500)
  }

  function handleDescriptionChange(json: SerializedEditorState) {
    setDescriptionDraft(json)
    descriptionDraftRef.current = json
    const target = currentTaskRef.current
    if (!target) return
    const serialized = JSON.stringify(json)
    const lastSaved = lastSavedDescByTask.current.get(target.id)
    if (serialized === lastSaved) {
      if (pendingDescRef.current?.serialized === serialized) return
      // Texto igual ao último CONFIRMADO pelo banco: cancela redundância.
      if (pendingDescRef.current?.taskId === target.id) {
        pendingDescRef.current = null
        window.clearTimeout(descriptionTimer.current)
      }
      return
    }
    pendingDescRef.current = { taskId: target.id, json, serialized }
    window.clearTimeout(descriptionTimer.current)
    descriptionTimer.current = window.setTimeout(() => {
      void flushPendingDescription().catch(() => {})
    }, 800)
  }

  async function handleManualSave() {
    const target = currentTaskRef.current
    if (!target || manualSaving) return
    window.clearTimeout(titleTimer.current)
    window.clearTimeout(descriptionTimer.current)
    const title = titleDraft.trim()
    if (!title) {
      toast.danger('Dê um título para a tarefa antes de salvar.')
      return
    }
    setManualSaving(true)
    setSaving(true)
    try {
      // 1) Aguarda autosaves em voo: eles carregam snapshot mais antigo; o
      // write abaixo (draft mais recente) precisa ser o ÚLTIMO a chegar.
      await saveChainRef.current.catch(() => {})
      pendingTitleRef.current = null
      pendingDescRef.current = null
      const description =
        descriptionDraftRef.current as unknown as Task['description']
      // 2) Write único com o draft mais recente (updateTask verifica o eco do
      // banco e lança se a descrição não persistiu — nada de "salvo" falso).
      const saved = (await chainSave(() =>
        creator.updateTask({ id: target.id, patch: { title, description } }),
      )) as unknown as Task | null
      const confirmed =
        (saved?.description as unknown as SerializedEditorState | null) ?? null
      lastSavedDescByTask.current.set(target.id, JSON.stringify(confirmed ?? null))
      setCurrentTask((prev) =>
        prev ? { ...prev, title, description: description } : null,
      )
      creator.refreshTasks?.()
      toast.success('Todas as alterações foram salvas!')
      onOpenChange(false)
    } catch (error) {
      console.error('[hub:desc] save manual falhou', target.id, error)
      toast.danger(
        error instanceof Error
          ? `Não foi possível salvar: ${error.message}`
          : 'Não foi possível salvar as alterações.',
      )
    } finally {
      setManualSaving(false)
      setSaving(false)
    }
  }

  function handleStartDate(value: string) {
    if (!currentTask) return
    const next = value || null
    if (next && currentTask.due_date && next > currentTask.due_date) {
      toast.danger('A data de início deve ser anterior à data de conclusão.')
      return
    }
    commitTaskPatch({ start_date: next })
  }

  function handleDueDate(value: string) {
    if (!currentTask) return
    const next = value || null
    if (next && currentTask.start_date && currentTask.start_date > next) {
      toast.danger('A data de conclusão deve ser posterior à data de início.')
      return
    }
    commitTaskPatch({ due_date: next })
  }

  function handleToggleAssignee(userId: string) {
    if (!currentTask) return
    const currentAssignees =
      currentTask.assignees && currentTask.assignees.length > 0
        ? currentTask.assignees
        : currentTask.assigned_to
          ? [currentTask.assigned_to]
          : []

    let nextAssignees: string[]
    if (currentAssignees.includes(userId)) {
      nextAssignees = currentAssignees.filter((id) => id !== userId)
    } else {
      nextAssignees = [...currentAssignees, userId]
    }

    commitTaskPatch({
      assignees: nextAssignees,
      assigned_to: nextAssignees[0] ?? null,
    })
  }

  function handleAddTag() {
    if (!currentTask) return
    const cleanTag = tagInput.trim().replace(/^#/, '').toLowerCase()
    if (!cleanTag) return
    const currentTags = currentTask.tags ?? []
    if (currentTags.includes(cleanTag)) {
      setTagInput('')
      return
    }
    const nextTags = [...currentTags, cleanTag]
    commitTaskPatch({ tags: nextTags })
    setTagInput('')
  }

  function handleRemoveTag(tagToRemove: string) {
    if (!currentTask) return
    const currentTags = currentTask.tags ?? []
    const nextTags = currentTags.filter((t) => t !== tagToRemove)
    commitTaskPatch({ tags: nextTags })
  }

  function handleAddCategory() {
    if (!currentTask) return
    const clean = categoryInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!clean) return
    const current = currentTask.categories ?? []
    if (current.includes(clean)) {
      setCategoryInput('')
      return
    }
    commitTaskPatch({ categories: [...current, clean] })
    setCategoryInput('')
  }

  function handleRemoveCategory(catToRemove: string) {
    if (!currentTask) return
    const current = currentTask.categories ?? []
    commitTaskPatch({ categories: current.filter((c) => c !== catToRemove) })
  }

  async function handleCreate() {
    const title = titleDraft.trim()
    if (!title || !createProjectId) return
    try {
      await creator.createTask({
        title,
        project_id: createProjectId,
        status: 'backlog',
        assigned_to: creator.currentUserId,
      })
      setTitleDraft('')
      toast.success('Tarefa criada com sucesso!')
      onOpenChange(false)
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível criar a tarefa.',
      )
    }
  }

  /** Limpa o box de nova subtarefa. */
  function clearSubtaskDraft() {
    setNewSubtaskTitle('')
    setNewSubtaskDesc('')
    setNewSubtaskDue('')
  }

  /**
   * Cria a subtarefa — SOMENTE por ação explícita (botão ou Enter).
   * Sem auto-save: dá para escrever a frase inteira sem criar nada no meio.
   */
  async function commitSubtaskDraft(): Promise<boolean> {
    const parent = currentTaskRef.current
    const title = newSubtaskTitle.trim()
    if (!title || !parent?.id || !parent.project_id) return false
    if (subtaskCommittingRef.current) return false
    subtaskCommittingRef.current = true
    const desc = newSubtaskDesc.trim()
    const due = newSubtaskDue
    try {
      await creator.createTask({
        title,
        project_id: parent.project_id,
        parent_id: parent.id,
        status: 'todo',
        assigned_to: parent.assigned_to ?? null,
        due_date: due || null,
        description: desc ? buildSimpleLexicalJson(desc) : null,
      })
      clearSubtaskDraft()
      creator.refreshTasks?.()
      toast.success('Subtarefa criada com sucesso!')
      return true
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível criar a subtarefa.',
      )
      return false
    } finally {
      subtaskCommittingRef.current = false
    }
  }

  /** Enter no box = cria na hora e foca o título para a próxima subtarefa. */
  function handleSubtaskKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void commitSubtaskDraft().then((created) => {
      if (created) newSubtaskTitleRef.current?.focus()
    })
  }

  function handleSubtaskManual() {
    void commitSubtaskDraft().then((created) => {
      if (created) newSubtaskTitleRef.current?.focus()
    })
  }

  function handleUpdateSubtask(subtaskId: string, patch: Partial<Task>) {
    void creator.updateTask({ id: subtaskId, patch })
      .then(() => creator.refreshTasks?.())
      .catch((error) => toast.danger(
        error instanceof Error
          ? `Erro ao atualizar subtarefa: ${error.message}`
          : 'Erro ao atualizar subtarefa.',
      ))
  }

  function handleToggleSubtask(subtaskId: string, isDone: boolean) {
    const nextStatus: TaskStatus = isDone ? 'done' : 'todo'
    void creator.moveTaskStatus({ id: subtaskId, status: nextStatus })
      .then(() => {
        creator.refreshTasks?.()
        toast.success(isDone ? 'Subtarefa concluída!' : 'Subtarefa reaberta.')
      })
      .catch(() => toast.danger('Erro ao alterar subtarefa.'))
  }

  function handleDeleteSubtask(subtaskId: string) {
    void creator.deleteTask(subtaskId)
      .then(() => {
        creator.refreshTasks?.()
        toast.success('Subtarefa excluída.')
      })
      .catch(() => toast.danger('Erro ao excluir subtarefa.'))
  }

  async function handleAddComment() {
    const content = newComment.trim()
    if (!content || !currentTask) return
    try {
      await comments.addComment(content)
      setNewComment('')
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível enviar o comentário.',
      )
    }
  }

  async function handleDelete() {
    if (!currentTask) return
    try {
      await creator.deleteTask(currentTask.id)
      setConfirmDelete(false)
      onOpenChange(false)
      toast.success('Tarefa excluída.')
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : 'Não foi possível excluir a tarefa.',
      )
    }
  }

  const subtasks = currentTask ? creator.childrenOf(currentTask.id) : []

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-over Drawer strictly on the RIGHT side */}
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[620px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-250 select-text">
        {/* Drawer Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-5 backdrop-blur">
          <div className="flex items-center gap-2">
            <i className="fa-regular fa-rectangle-list text-[#7b68ee] text-sm" />
            <h2 className="text-sm font-bold text-foreground">
              {isNew ? 'Nova Tarefa' : 'Detalhes da Tarefa'}
            </h2>
            {saving && (
              <span className="text-[10px] text-muted-foreground animate-pulse font-medium">
                Salvando...
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar painel"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isNew ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Projeto *</Label>
                <Select.Root
                  selectedKey={createProjectId}
                  onSelectionChange={(value) =>
                    setCreateProjectId(typeof value === 'string' ? value : null)
                  }
                  aria-label="Projeto da tarefa"
                  className="w-full"
                  placeholder="Selecione um projeto"
                >
                  <Select.Trigger className="rounded-md border border-border bg-background">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox.Root className="rounded-md border border-border bg-card">
                      {projects.length === 0 ? (
                        <ListBox.Item id="__none" isDisabled textValue="Crie um projeto primeiro">
                          Crie um projeto primeiro
                        </ListBox.Item>
                      ) : (
                        projects.map((project) => (
                          <ListBox.Item key={project.id} id={project.id} textValue={project.name}>
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              {project.name}
                            </span>
                          </ListBox.Item>
                        ))
                      )}
                    </ListBox.Root>
                  </Select.Popover>
                </Select.Root>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Título da Tarefa *</Label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder="Digite o título da tarefa..."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate()
                  }}
                />
              </div>

              <Button
                variant="primary"
                className="w-full rounded-md bg-[#7b68ee] text-xs font-semibold text-white hover:bg-[#6c5ce7]"
                onPress={() => void handleCreate()}
                isDisabled={!titleDraft.trim() || !createProjectId}
              >
                <i className="fa-solid fa-plus mr-1.5" />
                Criar Tarefa
              </Button>
            </div>
          ) : currentTask && (
            <div className="space-y-4">
              {/* Title Input with highlighted border */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Título da Tarefa</Label>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Título da tarefa..."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                />
              </div>

              {/* Description Editor with highlighted border */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Descrição</Label>
                <div className="rounded-md border border-border bg-background p-1.5 shadow-2xs">
                  <LexicalEditor
                    key={currentTask.id}
                    namespace={`hub-drawer-${currentTask.id}`}
                    initialValue={editorInitial}
                    onChange={handleDescriptionChange}
                  />
                </div>
              </div>

              <Separator className="my-2" />

              {/* Tags / Etiquetas */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Etiquetas / Tags</Label>
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-2 shadow-2xs">
                  {(currentTask.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md border border-[#7b68ee]/30 bg-[#7b68ee]/15 px-2 py-0.5 text-xs font-semibold text-[#7b68ee]"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="cursor-pointer text-[#7b68ee]/70 transition hover:text-red-500"
                        title="Remover tag"
                      >
                        <i className="fa-solid fa-xmark text-[10px]" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder="Adicionar tag (Enter)..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        handleAddTag()
                      }
                    }}
                    className="min-w-[130px] flex-1 bg-transparent px-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </div>

              {/* Categorias */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Categorias</Label>
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-2 shadow-2xs">
                  {(currentTask.categories ?? []).map((cat) => {
                    const colors = categoryColors(cat)
                    return (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold"
                        style={{
                          color: colors.fg,
                          backgroundColor: colors.bg,
                          borderColor: colors.border,
                        }}
                      >
                        <span>{cat}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCategory(cat)}
                          className="cursor-pointer opacity-60 transition hover:opacity-100 hover:text-red-500"
                          title="Remover categoria"
                        >
                          <i className="fa-solid fa-xmark text-[10px]" />
                        </button>
                      </span>
                    )
                  })}
                  <input
                    type="text"
                    placeholder="Adicionar categoria (Enter)..."
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        handleAddCategory()
                      }
                    }}
                    list="hub-category-suggestions"
                    className="min-w-[130px] flex-1 bg-transparent px-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  <datalist id="hub-category-suggestions">
                    {CATEGORY_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Attributes Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Status</Label>
                  <StatusSelect
                    value={currentTask.status}
                    onChange={(status) =>
                      void creator
                        .moveTaskStatus({ id: currentTask.id, status })
                        .catch(() =>
                          toast.danger('Não foi possível alterar o status.'),
                        )
                    }
                    ariaLabel="Alterar status"
                    size="md"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Prioridade</Label>
                  <Select.Root
                    selectedKey={currentTask.priority}
                    onSelectionChange={(value) =>
                      commitTaskPatch({ priority: value as TaskPriority })
                    }
                    aria-label="Alterar prioridade"
                    className="w-full"
                  >
                    <Select.Trigger className="rounded-md border border-border bg-background shadow-2xs">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox.Root className="rounded-md border border-border bg-card">
                        {TASK_PRIORITIES.map((priority) => (
                          <ListBox.Item key={priority} id={priority} textValue={PRIORITY_LABELS[priority]}>
                            {PRIORITY_LABELS[priority]}
                          </ListBox.Item>
                        ))}
                      </ListBox.Root>
                    </Select.Popover>
                  </Select.Root>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold text-foreground">Responsáveis</Label>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-2 shadow-2xs">
                    {(() => {
                      const currentAssignees =
                        currentTask.assignees && currentTask.assignees.length > 0
                          ? currentTask.assignees
                          : currentTask.assigned_to
                            ? [currentTask.assigned_to]
                            : []

                      return (
                        <>
                          {currentAssignees.length === 0 && (
                            <span className="text-xs text-muted-foreground italic mr-2">
                              — nenhum responsável —
                            </span>
                          )}
                          {currentAssignees.map((userId) => {
                            const member = members.find((m) => m.id === userId)
                            const name =
                              member?.full_name ?? member?.username ?? 'Usuário'
                            const initials = name.slice(0, 2).toUpperCase()
                            return (
                              <span
                                key={userId}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground"
                              >
                                {member?.avatar_url ? (
                                  <img
                                    src={member.avatar_url}
                                    alt={name}
                                    className="size-4.5 rounded-full object-cover ring-1 ring-border shadow-2xs"
                                  />
                                ) : (
                                  <span
                                    className="flex size-4.5 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-2xs"
                                    style={{ backgroundColor: userColor(userId) }}
                                  >
                                    {initials}
                                  </span>
                                )}
                                <span>{name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAssignee(userId)}
                                  className="cursor-pointer text-muted-foreground hover:text-red-500 ml-0.5"
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
                                handleToggleAssignee(e.target.value)
                                e.target.value = ''
                              }
                            }}
                            aria-label="Adicionar responsável"
                            className="cursor-pointer rounded-md border border-border/80 bg-background px-2 py-1 text-xs font-semibold text-[#7b68ee] hover:bg-muted/50"
                          >
                            <option value="" disabled>
                              + Adicionar responsável...
                            </option>
                            {members.map((member) => (
                              <option
                                key={member.id}
                                value={member.id}
                                disabled={currentAssignees.includes(member.id)}
                              >
                                {member.full_name ?? member.username}{' '}
                                {currentAssignees.includes(member.id) ? '✓' : ''}
                              </option>
                            ))}
                          </select>
                        </>
                      )
                    })()}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Horas Estimadas</Label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={currentTask.estimated_hours != null ? String(currentTask.estimated_hours) : ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      const value = raw === '' ? null : Number.parseFloat(raw)
                      if (value !== null && !Number.isNaN(value)) {
                        commitTaskPatch({ estimated_hours: Math.max(0, value) })
                      }
                    }}
                    placeholder="0"
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Início</Label>
                  <DateInput
                    value={currentTask.start_date ?? ''}
                    onChange={handleStartDate}
                    ariaLabel="Data de início"
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Conclusão</Label>
                  <DateInput
                    value={currentTask.due_date ?? ''}
                    onChange={handleDueDate}
                    ariaLabel="Data de conclusão"
                    className={`w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs ${
                      currentTask.due_date &&
                      currentTask.due_date < todayIso() &&
                      currentTask.status !== 'done'
                        ? 'border-red-500 font-semibold text-red-600'
                        : ''
                    }`}
                  />
                </div>
              </div>

              <Separator className="my-2" />

              {/* Enhanced Subtasks Section: Checkbox, Title, Description & Due Date */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">
                    Subtarefas{' '}
                    <span className="font-normal text-muted-foreground">
                      ({subtasks.length})
                    </span>
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {subtasks.filter((s) => s.status === 'done').length}/{subtasks.length} concluída(s)
                  </span>
                </div>

                {/* Subtask list */}
                <div className="space-y-2">
                  {subtasks.length === 0 && (
                    <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                      Nenhuma subtarefa adicionada.
                    </p>
                  )}
                  {subtasks.map((subtask) => {
                    const subtaskDescText = extractDescriptionText(subtask.description)
                    const isSubtaskDone = subtask.status === 'done'
                    return (
                      <div
                        key={subtask.id}
                        className={`rounded-md border border-border p-2.5 shadow-2xs transition space-y-2 ${
                          isSubtaskDone ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-background'
                        }`}
                      >
                        {/* Subtask Header Row: Checkbox, Title, Actions */}
                        <div className="flex items-center gap-2">
                          <Checkbox
                            isSelected={isSubtaskDone}
                            onChange={(checked) => handleToggleSubtask(subtask.id, checked)}
                            aria-label={`Concluir subtarefa ${subtask.title}`}
                          />
                          <input
                            type="text"
                            key={`${subtask.id}-title-${subtask.updated_at}`}
                            defaultValue={subtask.title}
                            onBlur={(e) => {
                              const val = e.target.value.trim()
                              if (val && val !== subtask.title) {
                                handleUpdateSubtask(subtask.id, { title: val })
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                            placeholder="Título da subtarefa..."
                            className={`flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs font-semibold focus:border-[#7b68ee] focus:bg-background focus:outline-none ${
                              isSubtaskDone ? 'text-muted-foreground line-through' : 'text-foreground'
                            }`}
                          />

                          {/* Open Subtask Details in Drawer */}
                          <button
                            type="button"
                            onClick={() => openTaskDetails(subtask)}
                            title="Editar detalhes completos desta subtarefa"
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-[#7b68ee]"
                          >
                            <i className="fa-solid fa-arrow-up-right-from-square text-[11px]" />
                          </button>

                          {/* Delete Subtask */}
                          <button
                            type="button"
                            onClick={() => handleDeleteSubtask(subtask.id)}
                            title="Excluir subtarefa"
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-red-500"
                          >
                            <i className="fa-solid fa-trash text-[11px]" />
                          </button>
                        </div>

                        {/* Subtask Details Row: Description & Due Date */}
                        <div className="flex flex-wrap items-center gap-2 pl-6">
                          <input
                            type="text"
                            key={`${subtask.id}-desc-${subtask.updated_at}`}
                            defaultValue={subtaskDescText}
                            onBlur={(e) => {
                              const val = e.target.value.trim()
                              if (val !== subtaskDescText) {
                                handleUpdateSubtask(subtask.id, {
                                  description: val ? buildSimpleLexicalJson(val) : null,
                                })
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                            placeholder="+ Descrição da subtarefa (Enter)..."
                            className="flex-1 min-w-[140px] rounded border border-border/60 bg-muted/20 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-[#7b68ee] focus:bg-background focus:outline-none"
                          />

                          <div className="flex items-center gap-1">
                            <i className="fa-regular fa-calendar text-[10px] text-muted-foreground" />
                            <DateInput
                              value={subtask.due_date ?? ''}
                              onChange={(iso) => {
                                handleUpdateSubtask(subtask.id, {
                                  due_date: iso || null,
                                })
                              }}
                              ariaLabel={`Conclusão de ${subtask.title}`}
                              className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[11px] text-foreground focus:border-[#7b68ee] focus:bg-background focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add New Subtask Form (criação só explícita: botão ou Enter) */}
                <div className="rounded-md border border-border bg-card p-3 space-y-2 shadow-2xs">
                  <span className="text-xs font-semibold text-foreground">
                    Nova Subtarefa
                  </span>
                  <input
                    ref={newSubtaskTitleRef}
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={handleSubtaskKeyDown}
                    placeholder="Título da nova subtarefa..."
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newSubtaskDesc}
                      onChange={(e) => setNewSubtaskDesc(e.target.value)}
                      onKeyDown={handleSubtaskKeyDown}
                      placeholder="Descrição (opcional)..."
                      className="flex-1 min-w-[140px] rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                    />
                    <DateInput
                      value={newSubtaskDue}
                      onChange={setNewSubtaskDue}
                      onKeyDown={handleSubtaskKeyDown}
                      ariaLabel="Conclusão da nova subtarefa"
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-muted-foreground">
                      Enter ou Adicionar cria a subtarefa.
                    </span>
                    <Button
                      size="sm"
                      className="rounded-md bg-[#7b68ee] text-xs font-semibold text-white hover:bg-[#6c5ce7]"
                      onPress={handleSubtaskManual}
                      isDisabled={!newSubtaskTitle.trim()}
                    >
                      <i className="fa-solid fa-plus mr-1" />
                      Adicionar Subtarefa
                    </Button>
                  </div>
                </div>
              </div>

              <Separator className="my-2" />

              {/* Comments Section */}
              <div className="space-y-2.5">
                <Label className="text-xs font-semibold text-foreground">Comentários e Atividades</Label>
                <div
                  ref={commentScrollRef}
                  className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-2.5 text-xs shadow-2xs"
                >
                  {comments.comments.length === 0 && (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      Nenhum comentário ainda.
                    </p>
                  )}
                  {comments.comments.map((comment) => {
                    const isMine = comment.author_id === creator.currentUserId
                    const authorMember = members.find((m) => m.id === comment.author_id)
                    const authorName = authorMember?.full_name ?? authorMember?.username ?? 'Usuário'
                    return (
                      <div
                        key={comment.id}
                        className="rounded-md border border-border bg-background p-2.5 shadow-2xs"
                      >
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {authorName}
                          </span>
                          <span>{formatDateTime(comment.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs text-foreground">{comment.content}</p>
                        {isMine && (
                          <div className="mt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                void comments
                                  .deleteComment(comment.id)
                                  .catch(() =>
                                    toast.danger(
                                      'Não foi possível excluir o comentário.',
                                    ),
                                  )
                              }
                              className="cursor-pointer text-[10px] text-muted-foreground transition hover:text-red-600"
                            >
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="space-y-1.5">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleAddComment()
                      }
                    }}
                    placeholder="Escreva um comentário (Enter para enviar)..."
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7b68ee] focus:outline-none shadow-2xs"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-md border border-border text-xs"
                      onPress={() => void handleAddComment()}
                      isDisabled={!newComment.trim()}
                    >
                      <i className="fa-regular fa-paper-plane mr-1" />
                      Comentar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Sticky Footer with explicit Salvar button */}
        {currentTask && !isNew && (
          <div className="flex shrink-0 items-center justify-between border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
            <Button
              variant="danger"
              size="sm"
              className="rounded-md text-xs"
              onPress={() => setConfirmDelete(true)}
            >
              <i className="fa-solid fa-trash mr-1" />
              Excluir
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-md border border-border text-xs"
                onPress={() => onOpenChange(false)}
              >
                Fechar
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="rounded-md bg-[#7b68ee] text-xs font-semibold text-white hover:bg-[#6c5ce7]"
                onPress={handleManualSave}
                isDisabled={manualSaving || !titleDraft.trim()}
              >
                <i className="fa-solid fa-floppy-disk mr-1" />
                {manualSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal (custom com z-index 60 para ficar sobre o Drawer) */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-500">
              <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10">
                <i className="fa-solid fa-trash-can text-lg" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Excluir Tarefa?</h3>
                <p className="text-xs text-muted-foreground">Esta ação não poderá ser desfeita</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tem certeza que deseja excluir <strong>"{currentTask?.title}"</strong>? Todas as subtarefas e comentários vinculados também serão excluídos definitivamente.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition shadow-xs cursor-pointer"
              >
                <i className="fa-solid fa-trash text-xs" />
                <span>Sim, Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}