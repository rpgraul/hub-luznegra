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
 * Seletor de status em pill sólida (sem borda).
 * Dropdown customizado (HeroUI) para a lista aberta ser 100% estilizada em
 * qualquer browser — <option> nativo é renderizado pelo SO e ignora estilo.
 * Mesma API do select nativo anterior: os 5 pontos de uso não mudam.
 * (O Trigger do HeroUI já renderiza o <button> acessível; aqui vai só o
 * conteúdo visual em <span> para não aninhar botões.)
 */
export default function StatusSelect({
  value,
  onChange,
  ariaLabel,
  size = 'sm',
  className = '',
}: StatusSelectProps) {
  const triggerClass =
    size === 'md'
      ? 'w-full rounded-lg px-3 py-2 text-xs'
      : 'max-w-full rounded-full px-2 py-0.5 text-[11px]'

  return (
    <Dropdown.Root>
      <Dropdown.Trigger aria-label={ariaLabel}>
        <span
          title={ariaLabel}
          className={`status-select__trigger inline-flex cursor-pointer items-center justify-between gap-1.5 font-medium transition duration-150 hover:brightness-105 active:brightness-95 ${triggerClass} ${className}`}
          style={{ backgroundColor: STATUS_COLORS[value] }}
        >
          <span className="truncate">{STATUS_LABELS[value]}</span>
          <i className="fa-solid fa-chevron-down shrink-0 text-[9px] opacity-80" />
        </span>
      </Dropdown.Trigger>
      <Dropdown.Popover className="status-select__popover min-w-[170px]">
        <Dropdown.Menu aria-label={ariaLabel ?? 'Status'}>
          {TASK_STATUSES.map((s) => (
            <Dropdown.Item
              key={s}
              onAction={() => onChange(s)}
              className="status-select__item"
            >
              <span
                className="status-select__pill flex w-full items-center justify-between gap-2 rounded-full px-2.5 py-1 text-xs font-medium"
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
