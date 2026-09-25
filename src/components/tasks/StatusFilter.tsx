import { Dropdown } from '@heroui/react'
import { STATUS_COLORS, STATUS_LABELS, TASK_STATUSES } from '@/utils/status'
import type { TaskStatus } from '@/types/database'

interface StatusFilterProps {
  selected: TaskStatus[]
  onChange: (next: TaskStatus[]) => void
  /** Contagem por status (opcional) para mostrar o que existe no filtro atual. */
  counts?: Record<string, number>
}

const ICONS: Record<TaskStatus, string> = {
  uncertain: 'fa-circle-question',
  backlog: 'fa-inbox',
  todo: 'fa-circle',
  in_progress: 'fa-spinner',
  review: 'fa-magnifying-glass',
  done: 'fa-circle-check',
}

/** Dropdown multi-seleção por status (a coluna do Kanban também é filtro aqui). */
export default function StatusFilter({ selected, onChange, counts }: StatusFilterProps) {
  const allActive = selected.length === 0

  function toggle(status: TaskStatus) {
    onChange(
      selected.includes(status)
        ? selected.filter((s) => s !== status)
        : [...selected, status],
    )
  }

  const label = allActive
    ? 'Status'
    : selected.length === 1
      ? STATUS_LABELS[selected[0]]
      : `${selected.length} status`

  return (
    <Dropdown.Root>
      <Dropdown.Trigger>
        <button
          type="button"
          title="Filtrar por status"
          className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition ${
            allActive
              ? 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'border-primary bg-primary/10 text-primary hover:bg-primary/15'
          }`}
        >
          <i className="fa-solid fa-filter text-[10px]" />
          <span className="max-w-[120px] truncate">{label}</span>
          {allActive ? (
            <i className="fa-solid fa-chevron-down text-[9px] opacity-60" />
          ) : (
            <span
              role="button"
              tabIndex={0}
              title="Limpar filtro"
              onClick={(e) => {
                e.stopPropagation()
                onChange([])
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  e.preventDefault()
                  onChange([])
                }
              }}
              className="flex size-4 items-center justify-center rounded hover:bg-primary/20"
            >
              <i className="fa-solid fa-xmark text-[9px]" />
            </span>
          )}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu className="min-w-[200px]">
          {/* `Dropdown.Section` (e não <div>): um elemento solto dentro de
              `Dropdown.Menu` quebra a coleção do React Aria e só o primeiro
              item é renderizado. */}
          <Dropdown.Item key="__all" onAction={() => onChange([])} className="gap-2">
            <i
              className={`fa-solid ${allActive ? 'fa-square-check' : 'fa-square'} w-3.5 text-center`}
              style={allActive ? { color: STATUS_COLORS.todo } : undefined}
            />
            <span className="flex-1 font-semibold">Todos os status</span>
            {counts && (
              <span className="text-[10px] text-muted-foreground">
                {Object.values(counts).reduce((a, b) => a + b, 0)}
              </span>
            )}
          </Dropdown.Item>
          <Dropdown.Section>
            {TASK_STATUSES.map((status) => {
            const active = selected.includes(status)
            const color = STATUS_COLORS[status]
            const count = counts?.[status] ?? 0
            return (
              <Dropdown.Item
                key={status}
                onAction={() => toggle(status)}
                className="gap-2"
              >
                  <i
                    className={`fa-solid ${active ? 'fa-square-check' : 'fa-square'} w-3.5 text-center`}
                    style={active ? { color } : undefined}
                  />
                  <i
                    className={`fa-solid ${ICONS[status]} w-3.5 text-center text-[10px]`}
                    style={{ color }}
                  />
                  <span className="flex-1">{STATUS_LABELS[status]}</span>
                  <span className="text-[10px] text-muted-foreground">{count}</span>
                </Dropdown.Item>
              )
          })}
          </Dropdown.Section>
          {!allActive && (
            <Dropdown.Section>
              <Dropdown.Item key="__clear" onAction={() => onChange([])}>
                <i className="fa-solid fa-xmark mr-2 w-3.5 text-center text-muted-foreground" />
                Limpar filtro
              </Dropdown.Item>
            </Dropdown.Section>
          )}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  )
}
