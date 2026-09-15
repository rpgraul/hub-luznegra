import type { SerializedEditorState } from 'lexical'

/** Extrai o texto puro de um JSON serializado do Lexical. */
export function extractLexicalText(description: unknown): string {
  if (!description) return ''
  if (typeof description === 'string') return description
  try {
    const root = (description as { root?: { children?: unknown[] } })?.root
    if (!root || !Array.isArray(root.children)) return ''
    const texts: string[] = []
    function traverse(node: unknown) {
      if (!node || typeof node !== 'object') return
      const n = node as { text?: string; children?: unknown[] }
      if (typeof n.text === 'string') texts.push(n.text)
      if (Array.isArray(n.children)) n.children.forEach(traverse)
    }
    traverse(root)
    return texts.join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

/**
 * Normaliza a descrição para salvar no banco: editor vazio (só parágrafos
 * em branco) vira `null` em vez de um blob JSON vazio.
 */
export function normalizeLexicalForSave(
  value: SerializedEditorState | null,
): SerializedEditorState | null {
  if (!value) return null
  return extractLexicalText(value) ? value : null
}
