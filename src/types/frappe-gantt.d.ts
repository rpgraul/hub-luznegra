/**
 * Tipos locais para 'frappe-gantt' v1.2.2.
 *
 * O @types/frappe-gantt (v0.9) descreve a API antiga e mente sobre o runtime
 * atual — o callback `popup` na v1.2.2 recebe um saco de opções
 * {task, chart, ...} (a tarefa real está em `ctx.task`) e aceita `false`
 * para nem abrir o popup. Por isso o pacote foi removido e o que o app
 * usa está declarado aqui, espelhando o comportamento real da lib.
 */
declare module 'frappe-gantt' {
  /** Objeto de tarefa passado ao construtor/refresh (campos extras são livres). */
  export interface GanttTaskInput {
    id: string
    name: string
    start: string
    end: string
    progress?: number
    dependencies?: string[]
    custom_class?: string
    [key: string]: unknown
  }

  /** v1.2.2: o callback `popup` recebe ESTE saco — a tarefa está em ctx.task. */
  export interface GanttPopupContext {
    task: { id: string | number; [key: string]: unknown }
    chart: unknown
    get_title: () => HTMLElement
    set_title: (html: string) => void
    get_subtitle: () => HTMLElement
    set_subtitle: (html: string) => void
    get_details: () => HTMLElement
    set_details: (html: string) => void
    add_action: (
      label: string | ((task: unknown) => string),
      fn: (task: unknown, gantt: unknown, event: unknown) => void,
    ) => void
    [key: string]: unknown
  }

  export interface GanttOptions {
    view_mode?: string
    view_modes?: string[]
    column_width?: number | null
    snap_at?: string | null
    language?: string
    date_format?: string
    bar_height?: number
    padding?: number
    upper_header_height?: number
    lower_header_height?: number
    container_height?: number | 'auto'
    today_button?: boolean
    infinite_padding?: boolean
    readonly_progress?: boolean
    readonly_dates?: boolean
    popup_on?: 'hover' | 'click' | string
    /** `false` faz a lib NÃO abrir o popup (string vazia abriria caixa vazia). */
    popup?: boolean | string | ((ctx: GanttPopupContext) => string | false)
    scroll_to?: string | Date | null
    ignore?: unknown
    on_click?: (task: unknown, event?: unknown) => void
    on_date_change?: (
      task: { id: string | number; [key: string]: unknown },
      start: Date,
      end: Date,
    ) => void
    on_progress_change?: (task: unknown, progress: number) => void
    on_view_change?: (mode: unknown) => void
    [key: string]: unknown
  }

  export default class Gantt {
    constructor(
      element: string | HTMLElement | SVGElement,
      tasks: GanttTaskInput[],
      options?: GanttOptions,
    )
    refresh(tasks: GanttTaskInput[]): void
    clear(): void
    unselect_all(): void
    [key: string]: unknown
  }
}
