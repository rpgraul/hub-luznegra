import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

interface DateInputProps {
  /** Data em ISO `yyyy-mm-dd` ou `''` */
  value: string
  onChange: (iso: string) => void
  min?: string
  className?: string
  /** Classes extras aplicadas ao wrapper (posicionamento/flex). */
  wrapperClassName?: string
  ariaLabel?: string
  title?: string
  placeholder?: string
  disabled?: boolean
  inputRef?: React.Ref<HTMLInputElement>
  onBlur?: () => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  onFocus?: () => void
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Converte ISO `yyyy-mm-dd` → `dd/mm/aaaa` para exibição. */
export function formatIsoToBr(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d || y.length !== 4) return ''
  return `${d}/${m}/${y}`
}

/**
 * Interpreta texto digitado como data brasileira.
 * Aceita 8 dígitos (ddmmaaaa) ou 6 dígitos (ddmmaa → 20aa).
 * Retorna ISO `yyyy-mm-dd` ou `null` se inválido.
 */
export function parseBrDate(text: string): string | null {
  const digits = text.replace(/\D/g, '')
  let dd: number
  let mm: number
  let yyyy: number
  if (digits.length === 8) {
    dd = Number(digits.slice(0, 2))
    mm = Number(digits.slice(2, 4))
    yyyy = Number(digits.slice(4, 8))
  } else if (digits.length === 6) {
    dd = Number(digits.slice(0, 2))
    mm = Number(digits.slice(2, 4))
    yyyy = 2000 + Number(digits.slice(4, 6))
  } else {
    return null
  }
  if (yyyy < 1900 || yyyy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return null
  }
  const probe = new Date(Date.UTC(yyyy, mm - 1, dd))
  if (
    probe.getUTCFullYear() !== yyyy ||
    probe.getUTCMonth() !== mm - 1 ||
    probe.getUTCDate() !== dd
  ) {
    return null
  }
  return `${yyyy}-${pad(mm)}-${pad(dd)}`
}

const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const DIAS_SEMANA_PT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function isoFromParts(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

/**
 * Campo de data sempre no padrão brasileiro DD/MM/AAAA, com máscara de
 * digitação e calendário popup em português.
 * Por dentro continua trafegando ISO `yyyy-mm-dd` (mesmo contrato
 * do antigo `<input type="date">`, que varia conforme o idioma do navegador).
 */
export default function DateInput({
  value,
  onChange,
  min,
  className,
  wrapperClassName,
  ariaLabel,
  title,
  placeholder = 'DD/MM/AAAA',
  disabled,
  inputRef,
  onBlur,
  onKeyDown,
  onFocus,
}: DateInputProps) {
  const [text, setText] = useState(() => formatIsoToBr(value))
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() }
  })
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const lastValueRef = useRef(value)
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const innerInputRef = useRef<HTMLInputElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value
      setText(formatIsoToBr(value))
      setInvalid(false)
    }
  }, [value])

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  // Fecha o calendário em clique fora, scroll ou resize
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (
        rootRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }
    function handleScroll() {
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleScroll)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleScroll)
    }
  }, [open ])

  function emit(iso: string) {
    lastValueRef.current = iso
    onChange(iso)
  }

  function openCalendar() {
    if (disabled) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) {
      const POPUP_W = 236
      const POPUP_H = 288
      let top = rect.bottom + 6
      if (top + POPUP_H > window.innerHeight - 8) {
        top = Math.max(8, rect.top - POPUP_H - 6)
      }
      let left = rect.left
      if (left + POPUP_W > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - POPUP_W - 8)
      }
      setPos({ top, left })
    }
    // Centraliza a visão no valor atual (ou hoje)
    const current = parseBrDate(text) ?? (lastValueRef.current || null)
    if (current) {
      const [y, m] = current.split('-').map(Number)
      if (y && m) setView({ y, m: m - 1 })
    } else {
      const now = new Date()
      setView({ y: now.getFullYear(), m: now.getMonth() })
    }
    setOpen(true)
  }

  function pickDate(iso: string) {
    const finalIso = min && iso < min ? min : iso
    setText(formatIsoToBr(finalIso))
    setInvalid(false)
    if (finalIso !== lastValueRef.current) emit(finalIso)
    setOpen(false)
    innerInputRef.current?.focus()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    let next = digits
    if (digits.length > 4) {
      next = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    } else if (digits.length > 2) {
      next = `${digits.slice(0, 2)}/${digits.slice(2)}`
    }
    setText(next)
    setInvalid(false)

    if (digits.length === 0) {
      if (lastValueRef.current !== '') emit('')
      return
    }
    if (digits.length === 8) {
      const iso = parseBrDate(next)
      if (iso) {
        if (min && iso < min) {
          emit(min)
          setText(formatIsoToBr(min))
        } else if (iso !== lastValueRef.current) {
          emit(iso)
        }
      }
    }
  }

  function handleBlur() {
    if (text === '') {
      onBlur?.()
      return
    }
    const iso = parseBrDate(text)
    if (iso) {
      const finalIso = min && iso < min ? min : iso
      setText(formatIsoToBr(finalIso))
      if (finalIso !== lastValueRef.current) emit(finalIso)
    } else {
      // Texto inválido: reverte para o valor atual e sinaliza
      setText(formatIsoToBr(lastValueRef.current))
      setInvalid(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setInvalid(false), 1600)
    }
    onBlur?.()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
      return
    }
    onKeyDown?.(e)
  }

  function handleFocus() {
    onFocus?.()
    if (!open) openCalendar()
  }

  // Mesclagem do ref interno com o ref vindo de fora
  function setRefs(el: HTMLInputElement | null) {
    innerInputRef.current = el
    if (typeof inputRef === 'function') {
      inputRef(el)
    } else if (inputRef && typeof inputRef === 'object') {
      ;(inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
    }
  }

  const todayIso = (() => {
    const now = new Date()
    return isoFromParts(now.getFullYear(), now.getMonth(), now.getDate())
  })()

  function renderCalendar() {
    const firstWeekday = new Date(view.y, view.m, 1).getDay()
    const startOffset = (firstWeekday + 6) % 7 // semana começa na segunda
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
    const daysInPrevMonth = new Date(view.y, view.m, 0).getDate()

    const cells: Array<{ iso: string; label: number; outside: boolean }> = []
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i
      const pm = view.m === 0 ? 11 : view.m - 1
      const py = view.m === 0 ? view.y - 1 : view.y
      cells.push({ iso: isoFromParts(py, pm, d), label: d, outside: true })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ iso: isoFromParts(view.y, view.m, d), label: d, outside: false })
    }
    while (cells.length % 7 !== 0 || cells.length < 35) {
      const last = cells[cells.length - 1]
      const [ly, lm, ld] = last.iso.split('-').map(Number)
      const next = new Date(ly, lm - 1, ld + 1)
      cells.push({
        iso: isoFromParts(next.getFullYear(), next.getMonth(), next.getDate()),
        label: next.getDate(),
        outside: true,
      })
      if (cells.length >= 42) break
    }

    function shiftMonth(delta: number) {
      setView((v) => {
        const next = new Date(v.y, v.m + delta, 1)
        return { y: next.getFullYear(), m: next.getMonth() }
      })
    }

    return createPortal(
      <div
        ref={popupRef}
        onMouseDown={(e) => e.preventDefault()}
        className="fixed z-[300] w-[236px] rounded-xl border border-border bg-popover p-2.5 text-foreground shadow-xl"
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-label="Escolher data"
      >
        <div className="mb-1.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Mês anterior"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <i className="fa-solid fa-chevron-left text-[11px]" />
          </button>
          <span className="text-xs font-bold capitalize">
            {MESES_PT[view.m]} <span className="text-muted-foreground">{view.y}</span>
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Próximo mês"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <i className="fa-solid fa-chevron-right text-[11px]" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-0.5 text-center">
          {DIAS_SEMANA_PT.map((d) => (
            <span key={d} className="py-0.5 text-[10px] font-bold text-muted-foreground">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {cells.map((cell) => {
            const isSelected = lastValueRef.current === cell.iso
            const isToday = todayIso === cell.iso
            const isDisabled = !!min && cell.iso < min
            return (
              <button
                key={cell.iso}
                type="button"
                disabled={isDisabled}
                onClick={() => pickDate(cell.iso)}
                className={`flex size-7 items-center justify-center rounded-md text-xs transition ${
                  isSelected
                    ? 'bg-primary font-bold text-primary-foreground shadow-xs'
                    : isDisabled
                      ? 'cursor-not-allowed text-muted-foreground/30'
                      : cell.outside
                        ? 'text-muted-foreground/50 hover:bg-muted hover:text-foreground'
                        : 'text-foreground hover:bg-muted'
                } ${isToday && !isSelected ? 'font-bold text-[#7b68ee] ring-1 ring-[#7b68ee]/50' : ''}`}
              >
                {cell.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            const now = new Date()
            pickDate(isoFromParts(now.getFullYear(), now.getMonth(), now.getDate()))
          }}
          className="mt-1.5 w-full rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-[#7b68ee] transition hover:bg-[#7b68ee]/10"
        >
          Hoje
        </button>
      </div>,
      document.body,
    )
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${wrapperClassName ?? ''}`}>
      <input
        ref={setRefs}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        maxLength={10}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title ?? 'Digite dia/mês/ano ou clique no calendário'}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onClick={(e) => e.stopPropagation()}
        className={`${className ?? ''} pr-7${invalid ? ' border-destructive text-destructive' : ''}`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          if (open) {
            setOpen(false)
          } else {
            openCalendar()
            innerInputRef.current?.focus()
          }
        }}
        title="Abrir calendário"
        aria-label="Abrir calendário"
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <i className="fa-regular fa-calendar text-xs" />
      </button>
      {open && !disabled && renderCalendar()}
    </div>
  )
}
