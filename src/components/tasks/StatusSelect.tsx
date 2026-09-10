import type { CSSProperties } from 'react'
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TASK_STATUSES,
  statusBorder,
  statusSoftBg,
} from '@/utils/status'
import type { TaskStatus } from '@/types/database'

interface StatusSelectProps {
  value: TaskStatus
  onChange: (status: TaskStatus) => void
  ariaLabel?: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Seletor de status em estilo pill sutil: fundo translúcido na cor
 * do status + texto na cor cheia. Mesmo visual em todas as telas.
 * (Select nativo — funciona bem dentro de tabelas com scroll.)
 */
export default function StatusSelect({
  value,
  onChange,
  ariaLabel,
  size = 'sm',
  className = '',
}: StatusSelectProps) {
  const style: CSSProperties = {
    backgroundColor: statusSoftBg(value),
    color: STATUS_COLORS[value],
    borderColor: statusBorder(value),
  }

  const sizeClass =
    size === 'md'
      ? 'w-full rounded-lg px-3 py-2'
      : 'rounded-full px-2 py-0.5'

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      aria-label={ariaLabel}
      className={`cursor-pointer border text-xs font-semibold shadow-2xs transition focus:outline-none dark:brightness-125 ${sizeClass} ${className}`}
      style={style}
    >
      {TASK_STATUSES.map((s) => (
        <option
          key={s}
          value={s}
          style={{ backgroundColor: '#FFFFFF', color: STATUS_COLORS[s] }}
        >
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  )
}
