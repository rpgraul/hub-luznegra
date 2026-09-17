import type { SerializedEditorState } from 'lexical'

/**
 * Normaliza um texto para URL válida (http/https).
 * E-mails são propositalmente ignorados (tratados como texto normal).
 * Retorna a URL normalizada ou `null` quando não é link.
 */
export function normalizeLinkUrl(input: string): string | null {
  const t = input.trim()
  if (!t || /\s/.test(t)) return null
  const withProtocol = /^https?:\/\//i.test(t) ? t : `https://${t}`
  // Domínio com TLD obrigatório (evita "versão 2.0", "item 3.5" etc.)
  if (!/^https?:\/\/([\w-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/\S*)?$/.test(withProtocol)) {
    return null
  }
  try {
    const u = new URL(withProtocol)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

/** Verdadeiro quando o texto é uma URL colável/linkável (não e-mail). */
export function isUrlLike(text: string): boolean {
  return normalizeLinkUrl(text) !== null
}

/**
 * Converte string legada (texto puro, URL pura ou HTML com <a href>)
 * para `SerializedEditorState`, preservando links (sempre nova aba).
 */
export function legacyStringToLexicalState(
  raw: string,
): SerializedEditorState | null {
  const t = raw.trim()
  if (!t) return null

  type Seg = { text: string; url?: string }
  const segments: Seg[] = []

  const anchorRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  if (anchorRe.test(t)) {
    let last = 0
    const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').trim()
    while ((m = re.exec(t)) !== null) {
      const before = stripTags(t.slice(last, m.index))
      if (before) segments.push({ text: before })
      const url = normalizeLinkUrl(m[1] ?? '')
      const label = stripTags(m[2] ?? '') || m[1]
      if (url) segments.push({ text: label, url })
      else if (label) segments.push({ text: label })
      last = m.index + m[0].length
    }
    const after = stripTags(t.slice(last))
    if (after) segments.push({ text: after })
    if (segments.length === 0) return null
  } else if (!/<[a-z][\s\S]*>/i.test(t)) {
    // Texto puro — pode ser URL pura ou conter URLs no meio
    const urlRe = /(https?:\/\/[^\s<]+|www\.[^\s<]+|(?:[\w-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s<]*)?)/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = urlRe.exec(t)) !== null) {
      if (m.index > last) segments.push({ text: t.slice(last, m.index) })
      const url = normalizeLinkUrl(m[0])
      if (url) segments.push({ text: m[0], url })
      else segments.push({ text: m[0] })
      last = m.index + m[0].length
    }
    if (segments.length === 0) return buildParagraph([{ text: t }])
    if (last < t.length) segments.push({ text: t.slice(last) })
  } else {
    // Outro HTML (ex: <b>, <p>): extrai só o texto e reaproveita a lógica acima
    const plain = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!plain) return null
    return legacyStringToLexicalState(plain)
  }

  return buildParagraph(segments.filter((s) => s.text))
}

function buildParagraph(
  segments: { text: string; url?: string }[],
): SerializedEditorState {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          children: segments.map((s) =>
            s.url
              ? {
                  type: 'link',
                  url: s.url,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  version: 1,
                  children: [
                    {
                      type: 'text',
                      text: s.text,
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                      version: 1,
                    },
                  ],
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                }
              : {
                  type: 'text',
                  text: s.text,
                  format: 0,
                  detail: 0,
                  mode: 'normal',
                  style: '',
                  version: 1,
                },
          ),
          direction: 'ltr',
        },
      ],
      direction: 'ltr',
    },
  } as unknown as SerializedEditorState
}
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
