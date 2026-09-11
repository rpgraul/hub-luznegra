import type { TaskPriority, TaskStatus } from '@/types/database'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  uncertain: 'Incerto',
  backlog: 'Backlog',
  todo: 'A Fazer',
  in_progress: 'Em Andamento',
  review: 'Revisão',
  done: 'Concluído',
}

export const STATUS_COLORS: Record<TaskStatus, string> = {
  uncertain: '#9CA3AF',
  backlog: '#6B7280',
  todo: '#3B82F6',
  in_progress: '#D97706',
  review: '#8B5CF6',
  done: '#10B981',
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

export const PRIORITY_ICONS: Record<TaskPriority, string> = {
  low: 'fa-arrow-down',
  medium: 'fa-minus',
  high: 'fa-arrow-up',
  urgent: 'fa-triangle-exclamation',
}

export function statusColor(status: TaskStatus): string {
  return STATUS_COLORS[status]
}

/**
 * Fundo translúcido (~12%) na cor do status — pills sutis.
 * (As cores são hex de 6 dígitos, então dá para anexar o alfa.)
 */
export function statusSoftBg(status: TaskStatus): string {
  return `${STATUS_COLORS[status]}1F`
}

/** Borda suave (~40%) na cor do status — pills sutis. */
export function statusBorder(status: TaskStatus): string {
  return `${STATUS_COLORS[status]}66`
}

/**
 * Cor de texto sobre o fundo sólido do status (sem borda).
 * Compara o contraste WCAG de branco vs. cinza bem escuro sobre a cor
 * do status e retorna o vencedor — sempre o melhor contraste.
 */
export function statusInkOn(status: TaskStatus): '#FFFFFF' | '#222222' {
  const hex = STATUS_COLORS[status].replace('#', '')
  const channel = (i: number): number => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const lum = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  const lumDark = 0.0159 // #222222
  const contrastWhite = 1.05 / (lum + 0.05)
  const contrastDark = (lum + 0.05) / (lumDark + 0.05)
  return contrastWhite >= contrastDark ? '#FFFFFF' : '#222222'
}

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status]
}

export const TASK_STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[]
export const TASK_PRIORITIES = Object.keys(PRIORITY_LABELS) as TaskPriority[]