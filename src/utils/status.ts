import type { TaskPriority, TaskStatus } from '@/types/database'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'A Fazer',
  in_progress: 'Em Andamento',
  review: 'Revisão',
  done: 'Concluído',
}

export const STATUS_COLORS: Record<TaskStatus, string> = {
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

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status]
}

export const TASK_STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[]
export const TASK_PRIORITIES = Object.keys(PRIORITY_LABELS) as TaskPriority[]