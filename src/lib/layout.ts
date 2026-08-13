import type { DefaultView } from '@/types/database'

export type ViewLayout = 'row' | 'column'

export interface LayoutState {
  views: DefaultView[]
  layout: ViewLayout
  ratios: number[]
}

export interface SavedPreset {
  id: string
  name: string
  scheme: LayoutState
}

export const DEFAULT_VIEW: DefaultView = 'gantt'

export const LAYOUT_STORAGE_KEY = 'hub.layout.v1'
export const PRESETS_STORAGE_KEY = 'hub.presets.v1'

const MIN_RATIO = 15
const MAX_RATIO = 85

export function equalRatios(count: number): number[] {
  const base = Math.floor(100 / count)
  const rest = 100 - base * count
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? rest : 0))
}

export function normalizeLayout(state: LayoutState): LayoutState {
  const views = state.views.length > 0 ? state.views : [DEFAULT_VIEW]
  const validRatios =
    state.ratios?.length === views.length &&
    state.ratios.every((r) => Number.isFinite(r) && r > 0)
  const baseRatios = validRatios
    ? state.ratios.map((r) => Math.max(1, Math.min(99, Math.round(r))))
    : equalRatios(views.length)
  const total = baseRatios.reduce((a, b) => a + b, 0)
  const fixed =
    total === 100
      ? baseRatios
      : baseRatios.map((r) => Math.round((r / total) * 100))
  let diff = 100 - fixed.reduce((a, b) => a + b, 0)
  if (diff !== 0) {
    fixed[0] = Math.max(1, fixed[0] + diff)
  }
  return {
    views,
    layout: state.layout === 'column' ? 'column' : 'row',
    ratios: fixed,
  }
}

export function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (raw) return normalizeLayout(JSON.parse(raw) as LayoutState)
  } catch {
    /* storage corrompido — usa padrão */
  }
  return { views: [DEFAULT_VIEW], layout: 'row', ratios: [100] }
}

export function saveLayout(state: LayoutState): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* localStorage indisponível */
  }
}

export function loadPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
    if (raw) {
      const list = JSON.parse(raw) as SavedPreset[]
      if (Array.isArray(list)) {
        return list
          .filter((p) => p && typeof p.name === 'string' && p.scheme)
          .map((p) => ({ ...p, scheme: normalizeLayout(p.scheme) }))
      }
    }
  } catch {
    /* storage corrompido */
  }
  return []
}

export function savePresets(presets: SavedPreset[]): void {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets))
  } catch {
    /* localStorage indisponível */
  }
}

export const BUILTIN_PRESETS: SavedPreset[] = [
  {
    id: 'builtin-5050',
    name: 'Kanban + Lista · 50/50',
    scheme: normalizeLayout({
      views: ['kanban', 'lista'],
      layout: 'row',
      ratios: [50, 50],
    }),
  },
  {
    id: 'builtin-7030',
    name: 'Gantt + Calendário · 70/30',
    scheme: normalizeLayout({
      views: ['gantt', 'calendario'],
      layout: 'row',
      ratios: [70, 30],
    }),
  },
  {
    id: 'builtin-gk',
    name: 'Gantt + Kanban · 50/50',
    scheme: normalizeLayout({
      views: ['gantt', 'kanban'],
      layout: 'row',
      ratios: [50, 50],
    }),
  },
  {
    id: 'builtin-stack',
    name: 'Empilhadas · 50/50',
    scheme: normalizeLayout({
      views: ['gantt', 'kanban'],
      layout: 'column',
      ratios: [50, 50],
    }),
  },
]

export function singleViewInLayout(
  state: LayoutState,
  view: DefaultView,
): LayoutState {
  return normalizeLayout({ views: [view], layout: state.layout, ratios: [100] })
}

export function addViewToLayout(
  state: LayoutState,
  view: DefaultView,
): LayoutState {
  if (state.views.includes(view)) return state
  const views = [...state.views, view]
  const n = views.length
  const ratios = views.map((_, i) =>
    i === n - 1
      ? Math.round(100 / n)
      : Math.round((state.ratios[i] ?? 0) * ((n - 1) / n)),
  )
  return normalizeLayout({ ...state, views, ratios })
}

export function removeViewFromLayout(
  state: LayoutState,
  view: DefaultView,
): LayoutState {
  const idx = state.views.indexOf(view)
  if (idx === -1 || state.views.length === 1) return state
  const views = state.views.filter((v) => v !== view)
  const removed = state.ratios[idx] ?? 0
  const total = state.ratios.reduce((a, b) => a + b, 0) - removed
  const ratios =
    total > 0
      ? views.map((_, i) => {
          const orig = i < idx ? state.ratios[i] : state.ratios[i + 1]
          return Math.round(((orig ?? 0) / total) * 100)
        })
      : equalRatios(views.length)
  return normalizeLayout({ ...state, views, ratios })
}

/**
 * Move a divisória entre o painel `index` e `index+1` em `deltaPct` pontos.
 * Mantém os demais painéis intactos e limita cada lado entre 15% e 85%.
 */
export function shiftRatio(
  state: LayoutState,
  index: number,
  deltaPct: number,
): LayoutState {
  if (index < 0 || index + 1 >= state.ratios.length) return state
  const next = [...state.ratios]
  let a = Math.round(next[index] + deltaPct)
  if (a < MIN_RATIO) a = MIN_RATIO
  if (a > MAX_RATIO) a = MAX_RATIO
  const b = next[index + 1] + (next[index] - a)
  if (b < MIN_RATIO) {
    next[index] = Math.round(next[index] + next[index + 1] - MIN_RATIO)
    next[index + 1] = MIN_RATIO
  } else {
    next[index] = a
    next[index + 1] = b
  }
  return normalizeLayout({ ...state, ratios: next })
}

export function equalizeRatios(state: LayoutState): LayoutState {
  return normalizeLayout({ ...state, ratios: equalRatios(state.views.length) })
}