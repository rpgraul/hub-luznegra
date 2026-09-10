import { categoryColors } from '@/utils/categories'

interface CategoryFilterProps {
  available: string[]
  selected: string[]
  onChange: (next: string[]) => void
}

/** Filtro multi-seleção por categoria (pills toggle + "Todas"). */
export default function CategoryFilter({ available, selected, onChange }: CategoryFilterProps) {
  if (available.length === 0) return null

  function toggle(cat: string) {
    onChange(
      selected.includes(cat) ? selected.filter((c) => c !== cat) : [...selected, cat],
    )
  }

  const allActive = selected.length === 0

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-bold text-foreground">Categoria:</span>
      <button
        type="button"
        onClick={() => onChange([])}
        title="Mostrar todas as categorias"
        className={`h-7 rounded-md border px-2 text-xs font-semibold transition cursor-pointer ${
          allActive
            ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
            : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        Todas
      </button>
      {available.map((cat) => {
        const active = selected.includes(cat)
        const colors = categoryColors(cat)
        return (
          <button
            key={cat}
            type="button"
            onClick={() => toggle(cat)}
            title={active ? `Remover filtro ${cat}` : `Filtrar por ${cat}`}
            className="h-7 rounded-md border px-2 text-xs font-semibold transition cursor-pointer"
            style={
              active
                ? {
                    backgroundColor: colors.bg,
                    color: colors.fg,
                    borderColor: colors.border,
                  }
                : undefined
            }
          >
            {cat}
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
