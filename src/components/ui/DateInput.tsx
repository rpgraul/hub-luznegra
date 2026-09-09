import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

interface DateInputProps {
  /** Data em ISO `yyyy-mm-dd` ou `''` */
  value: string
  onChange: (iso: string) => void
  min?: string
  className?: string
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

/**
 * Campo de data sempre no padrão brasileiro DD/MM/AAAA.
 * Por dentro continua trafegando ISO `yyyy-mm-dd` (mesmo contrato
 * do antigo `<input type="date">`, que varia conforme o idioma do navegador).
 */
export default function DateInput({
  value,
  onChange,
  min,
  className,
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
  const lastValueRef = useRef(value)
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

  function emit(iso: string) {
    lastValueRef.current = iso
    onChange(iso)
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

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      value={text}
      maxLength={10}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title ?? 'Data no formato dia/mês/ano'}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onClick={(e) => e.stopPropagation()}
      className={`${className ?? ''}${invalid ? ' border-destructive text-destructive' : ''}`}
    />
  )
}
