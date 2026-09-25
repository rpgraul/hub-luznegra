import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatIsoToBr } from '@/components/ui/DateInput'
import type { SubtaskDateConflict } from '@/utils/subtaskDates'

interface SubtaskDateConflictModalProps {
  conflict: SubtaskDateConflict | null
  parentTitle: string
  /** Altera o período da tarefa principal para caber a subtarefa. */
  onExtendParent: () => void
  /** Move a subtarefa para dentro do período da tarefa principal. */
  onFitSubtask: () => void
  onCancel: () => void
  busy?: boolean
}

function kindTitle(conflict: SubtaskDateConflict): string {
  if (conflict.kind === 'inverted') return 'Subtarefa com datas invertidas'
  if (conflict.kind === 'after_due') return 'Subtarefa termina depois da tarefa principal'
  return 'Subtarefa começa antes da tarefa principal'
}

function explanation(conflict: SubtaskDateConflict): string {
  const parent =
    `${conflict.parentStart ? formatIsoToBr(conflict.parentStart) : 'sem data de início'}` +
    ` até ${conflict.parentDue ? formatIsoToBr(conflict.parentDue) : 'sem data de conclusão'}`
  const child =
    `${conflict.subtaskStart ? formatIsoToBr(conflict.subtaskStart) : 'sem início'}` +
    ` até ${conflict.subtaskDue ? formatIsoToBr(conflict.subtaskDue) : 'sem conclusão'}`

  if (conflict.kind === 'inverted') {
    return `A subtarefa (${child}) começa depois de própria data de conclusão.`
  }
  if (conflict.kind === 'after_due') {
    return `A subtarefa (${child}) vai além do período da tarefa principal (${parent}).`
  }
  return `A subtarefa (${child}) começa antes do período da tarefa principal (${parent}).`
}

/**
 * Modal de confirmação para subtarefa fora da janela da tarefa pai.
 * Renderizado em portal próprio (z-index acima do drawer/modal de origem) para
 * não depender de aninhamento de modais.
 */
export default function SubtaskDateConflictModal({
  conflict,
  parentTitle,
  onExtendParent,
  onFitSubtask,
  onCancel,
  busy = false,
}: SubtaskDateConflictModalProps) {
  useEffect(() => {
    if (!conflict) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [conflict, busy, onCancel])

  if (!conflict) return null

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={() => !busy && onCancel()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-2xl border border-border bg-background p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
            <i className="fa-solid fa-triangle-exclamation text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-foreground">
              {kindTitle(conflict)}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Tarefa principal: <span className="font-semibold text-foreground">{parentTitle}</span>
            </p>
          </div>
        </div>

        <p className="mt-3 text-sm text-foreground/90">{explanation(conflict)}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Escolha como resolver — nada foi salvo ainda.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onExtendParent}
            className="w-full cursor-pointer rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-left text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="fa-solid fa-arrows-up-down mr-2" />
            Alterar o período da tarefa principal para incluir a subtarefa
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onFitSubtask}
            className="w-full cursor-pointer rounded-xl border border-border bg-muted/40 px-4 py-3 text-left text-sm font-semibold text-foreground transition hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="fa-solid fa-arrow-right-long mr-2" />
            Mover a subtarefa para o período da tarefa principal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="w-full cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar e manter como está
          </button>
        </div>

        {busy && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            <i className="fa-solid fa-spinner fa-spin mr-1" />
            Aplicando…
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
