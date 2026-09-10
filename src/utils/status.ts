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
 * Cor de texto (preto/branco) com contraste sobre o fundo da cor do status.
 * Usa luminância relativa sRGB — fundo claro → texto escuro, fundo escuro → branco.
 */
export function statusContrastText(status: TaskStatus): string {
  const hex = STATUS_COLORS[status].replace('#', '')
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.35 ? '#111827' : '#FFFFFF'
}

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status]
}

export const TASK_STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[]
export const TASK_PRIORITIES = Object.keys(PRIORITY_LABELS) as TaskPriority[]