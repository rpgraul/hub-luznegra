import { STATUS_COLORS, STATUS_LABELS, TASK_STATUSES } from '@/utils/status'
import type { TaskStatus } from '@/types/database'

interface StatusFilterProps {
  selected: TaskStatus[]
  onChange: (next: TaskStatus[]) => void
  /** Contagem por status (opcional) para mostrar o que existe no filtro atual. */
  counts?: Record<string, number>
}

/** Filtro multi-seleção por status (pills toggle + "Todas"). */
export default function StatusFilter({ selected, onChange, counts }: StatusFilterProps) {
  function toggle(status: TaskStatus) {
    onChange(
      selected.includes(status)
        ? selected.filter((s) => s !== status)
        : [...selected, status],
    )
  }

  const allActive = selected.length === 0

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-bold text-foreground">Status:</span>
      <button
        type="button"
        onClick={() => onChange([])}
        title="Mostrar todos os status"
        className={`h-7 rounded-md border px-2 text-xs font-semibold transition cursor-pointer ${
          allActive
            ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
            : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        Todos
      </button>
      {TASK_STATUSES.map((status) => {
        const active = selected.includes(status)
        const color = STATUS_COLORS[status]
        const count = counts?.[status] ?? 0
        return (
          <button
            key={status}
            type="button"
            onClick={() => toggle(status)}
            title={active ? `Remover filtro ${STATUS_LABELS[status]}` : `Filtrar por ${STATUS_LABELS[status]}`}
            className="h-7 rounded-md border px-2 text-xs font-semibold transition cursor-pointer"
            style={
              active
                ? {
                    backgroundColor: color,
                    color: '#FFFFFF',
                    borderColor: color,
                  }
                : { color }
            }
          >
            {STATUS_LABELS[status]}
            {counts && count > 0 && (
              <span className="ml-1 opacity-70">{count}</span>
            )}
          </button>
        )
      })}
      {!allActive && (
        <button
          type="button"
          onClick={() => onChange([])}
          title="Limpar filtro"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <i className="fa-solid fa-xmark text-[10px]" />
        </button>
      )}
    </div>
  )
}
