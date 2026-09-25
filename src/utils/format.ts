export function formatDateRange(
  start: string | null,
  end: string | null,
): string {
  if (start === null && end === null) return 'sem datas'
  if (start === null) return formatDate(end ?? '')
  if (end === null) return formatDate(start)

  const [sy, sm, sd] = start.split('-')
  const [ey, em, ed] = end.split('-')

  if (sy === ey && sm === em) {
    return `${sd} a ${ed}/${em}/${ey}`
  }
  if (sy === ey) {
    return `${sd}/${sm} a ${ed}/${em}/${ey}`
  }
  return `${sd}/${sm}/${sy} a ${ed}/${em}/${ey}`
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} às ${hh}:${min}`
}

export function todayIso(): string {
  const today = new Date()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${mm}-${dd}`
}

export function isInFerias(profile: {
  ferias_inicio: string | null
  ferias_fim: string | null
} | null | undefined): boolean {
  if (!profile?.ferias_inicio || !profile.ferias_fim) return false
  const today = todayIso()
  return today >= profile.ferias_inicio && today <= profile.ferias_fim
}
/**
 * Máscara de telefone BR enquanto digita: (11) 99999-9999, aceitando tanto
 * dígitos já pontuados quanto colados. Só completa o que der (celular com 11,
 * fixo com 10).
 */
export function maskPhoneBR(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  if (digits.length <= 2) return `(${ddd}`
  if (rest.length === 0) return `(${ddd}) `
  if (rest.length <= 5) return `(${ddd}) ${rest}`
  if (rest.length <= 10) {
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
  }
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 10)}`
}
