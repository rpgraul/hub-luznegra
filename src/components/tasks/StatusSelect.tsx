import { Dropdown } from '@heroui/react'
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TASK_STATUSES,
  statusInkOn,
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
 * Seletor de status em pill sólida (sem borda): fundo na cor do status +
 * texto branco ou bem escuro pelo melhor contraste (statusInkOn).
 * Dropdown customizado (HeroUI) para a lista aberta ser 100% estilizada em
 * qualquer browser — <option> nativo é renderizado pelo SO e ignora estilo.
 * Mesma API do select nativo anterior: os 5 pontos de uso não mudam.
 */
export default function StatusSelect({
  value,
  onChange,
  ariaLabel,
  size = 'sm',
  className = '',
}: StatusSelectProps) {
  const bg = STATUS_COLORS[value]
  const ink = statusInkOn(value)

  const triggerClass =
    size === 'md'
      ? 'w-full rounded-lg px-3 py-2 text-xs'
      : 'max-w-full rounded-full px-2 py-0.5 text-[11px]'

  return (
    <Dropdown.Root>
      <Dropdown.Trigger>
        <button
          type="button"
          aria-label={ariaLabel}
          title={ariaLabel}
          className={`inline-flex cursor-pointer items-center justify-between gap-1.5 border-0 font-semibold shadow-2xs transition hover:brightness-95 focus:outline-none ${triggerClass} ${className}`}
          style={{ backgroundColor: bg, color: ink }}
        >
          <span className="truncate">{STATUS_LABELS[value]}</span>
          <i className="fa-solid fa-chevron-down shrink-0 text-[9px] opacity-80" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Popover className="min-w-[170px]">
        <Dropdown.Menu aria-label={ariaLabel ?? 'Status'}>
          {TASK_STATUSES.map((s) => (
            <Dropdown.Item key={s} onAction={() => onChange(s)}>
              <span
                className="flex w-full items-center justify-between gap-2 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: STATUS_COLORS[s], color: statusInkOn(s) }}
              >
                {STATUS_LABELS[s]}
                {s === value && <i className="fa-solid fa-check text-[10px]" />}
              </span>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  )
}
