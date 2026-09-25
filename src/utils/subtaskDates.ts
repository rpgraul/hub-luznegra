/**
 * Regras de janela pai/subtarefa.
 *
 * Uma subtarefa precisa caber dentro do período da tarefa pai. Datas ausentes
 * são permitidas (tarefa sem prazo não restringe a subtarefa), mas qualquer
 * data informada precisa estar dentro da janela conhecida do pai.
 */

export interface DateWindow {
  start_date?: string | null
  due_date?: string | null
}

export type SubtaskConflictKind =
  /** A subtarefa começa antes do início do pai. */
  | 'before_start'
  /** A subtarefa termina depois da conclusão do pai. */
  | 'after_due'
  /** A própria subtarefa tem início posterior à conclusão. */
  | 'inverted'

export interface SubtaskDateConflict {
  kind: SubtaskConflictKind
  /** Data da subtarefa que violou a janela do pai. */
  offendingDate: string
  parentStart: string | null
  parentDue: string | null
  subtaskStart: string | null
  subtaskDue: string | null
}

function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

/** `true` se a subtarefa respeita a janela do pai (ou se o pai não tem janela). */
export function isWithinParentWindow(
  parent: DateWindow,
  subtask: DateWindow,
): boolean {
  return detectSubtaskConflict(parent, subtask) === null
}

/**
 * Detecta conflito entre a janela da subtarefa e a do pai.
 * Retorna `null` quando está tudo certo.
 */
export function detectSubtaskConflict(
  parent: DateWindow,
  subtask: DateWindow,
): SubtaskDateConflict | null {
  const s = subtask.start_date || null
  const d = subtask.due_date || null

  if (s && d && s > d) {
    return {
      kind: 'inverted',
      offendingDate: s,
      parentStart: parent.start_date ?? null,
      parentDue: parent.due_date ?? null,
      subtaskStart: s,
      subtaskDue: d,
    }
  }

  // Qualquer data da subtarefa anterior ao início do pai (inclusive a conclusão
  // quando a subtarefa não tem data de início).
  const earliest = s && d ? (s < d ? s : d) : (s ?? d)
  if (parent.start_date && earliest && earliest < parent.start_date) {
    return {
      kind: 'before_start',
      offendingDate: earliest,
      parentStart: parent.start_date,
      parentDue: parent.due_date ?? null,
      subtaskStart: s,
      subtaskDue: d,
    }
  }

  // Qualquer data da subtarefa posterior à conclusão do pai.
  const latest = s && d ? (s > d ? s : d) : (d ?? s)
  if (parent.due_date && latest && latest > parent.due_date) {
    return {
      kind: 'after_due',
      offendingDate: latest,
      parentStart: parent.start_date ?? null,
      parentDue: parent.due_date,
      subtaskStart: s,
      subtaskDue: d,
    }
  }

  return null
}

/**
 * Opção "mover a subtarefa": empurra a subtarefa para dentro da janela do pai,
 * preservando a duração quando possível.
 */
export function fitSubtaskIntoParent(
  parent: DateWindow,
  subtask: DateWindow,
): { start_date: string | null; due_date: string | null } {
  const s = subtask.start_date || null
  const d = subtask.due_date || null
  const ps = parent.start_date || null
  const pd = parent.due_date || null

  let nextStart = s
  let nextDue = d

  // Datas invertidas na própria subtarefa: preserva a conclusão e zera o início.
  if (nextStart && nextDue && nextStart > nextDue) nextStart = null

  // Com janela completa no pai, reposiciona preservando a duração.
  if (nextStart && nextDue && ps && pd) {
    const duration = diffDays(nextStart, nextDue)
    if (nextStart < ps) {
      nextStart = ps
      nextDue = addDays(ps, duration)
    }
    if (nextDue > pd) {
      nextDue = pd
      nextStart = addDays(pd, -duration)
    }
  }

  // Sem data de início: a subtarefa passa a começar junto com o pai.
  if (!nextStart && ps) {
    nextStart = ps
    if (nextDue && nextDue < ps) nextDue = ps
  }
  if (!nextDue && pd) nextDue = pd

  if (ps && nextStart && nextStart < ps) nextStart = ps
  if (pd && nextDue && nextDue > pd) nextDue = pd
  if (nextStart && nextDue && nextStart > nextDue) nextStart = nextDue

  return { start_date: nextStart, due_date: nextDue }
}

/**
 * Opção "alterar o período da tarefa principal": estende o pai para caber a
 * subtarefa (muda só os campos realmente necessários).
 */
export function extendParentToFitSubtask(
  parent: DateWindow,
  subtask: DateWindow,
): { start_date: string | null; due_date: string | null } {
  const s = subtask.start_date || null
  const d = subtask.due_date || null
  return {
    start_date: minDate(parent.start_date ?? null, s),
    due_date: maxDate(parent.due_date ?? null, d),
  }
}

/** Diff de dias em ISO `yyyy-mm-dd` (UTC, imune a fuso). */
export function diffDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

export function addDays(iso: string, days: number): string {
  const base = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(base)) return iso
  const next = new Date(base + days * 86_400_000)
  return next.toISOString().slice(0, 10)
}
