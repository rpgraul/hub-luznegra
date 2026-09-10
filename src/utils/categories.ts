/**
 * Categorias livres das tarefas (ex: ig, youtube, rpg, quadrinho, wargame).
 * Valores em aberto — a lista abaixo é só sugestão (datalist/placeholder).
 */

export const CATEGORY_SUGGESTIONS = [
  'ig',
  'youtube',
  'tiktok',
  'blog',
  'newsletter',
  'rpg',
  'quadrinho',
  'wargame',
  'evento',
  'impresso',
] as const

export function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash
}

/** Cor determinística por categoria (fundo claro + texto escuro). */
export function categoryColors(category: string): { bg: string; fg: string; border: string } {
  const hue = hashString(category.toLowerCase()) % 360
  return {
    bg: `hsl(${hue}, 70%, 92%)`,
    fg: `hsl(${hue}, 55%, 28%)`,
    border: `hsl(${hue}, 60%, 75%)`,
  }
}

/** "ig, youtube" -> ["ig", "youtube"] (minúsculas, sem duplicadas). */
export function parseCategoriesText(text: string): string[] {
  const seen = new Set<string>()
  for (const part of text.split(',')) {
    const clean = part.trim().toLowerCase().replace(/\s+/g, '-')
    if (clean && !seen.has(clean)) seen.add(clean)
  }
  return [...seen]
}
