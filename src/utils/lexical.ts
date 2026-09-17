import type { SerializedEditorState } from 'lexical'

/**
 * Normaliza um texto para URL válida (http/https).
 * E-mails são propositalmente ignorados (tratados como texto normal).
 * Retorna a URL normalizada ou `null` quando não é link.
 */
export function normalizeLinkUrl(input: string): string | null {
  const t = input.trim()
  if (!t || t.length > 2048 || /\s/.test(t)) return null
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
  // Trava de segurança: entrada gigante vira texto puro fatiado
  // (nunca regex pesada sobre 100k+ caracteres).
  if (t.length > 100_000) {
    return buildParagraph([{ text: t.slice(0, 100_000) }])
  }

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
    // Texto puro — detecta URLs por token (sem regex com quantificador
    // aninhado sobre o texto inteiro: evita backtracking catastrófico).
    const tokens = t.split(/(\s+)/)
    for (const tok of tokens) {
      if (!tok) continue
      if (/^\s+$/.test(tok)) {
        segments.push({ text: tok })
        continue
      }
      let core = tok
      let lead = ''
      let trail = ''
      const leadMatch = tok.match(/^([([{<"']+)(.+)$/)
      if (leadMatch) {
        lead = leadMatch[1]
        core = leadMatch[2]
      }
      const trailMatch = core.match(/^(.*?)[.,;:!?)\]}>]+$/)
      if (trailMatch && trailMatch[1]) {
        trail = core.slice(trailMatch[1].length)
        core = trailMatch[1]
      }
      const url = normalizeLinkUrl(core)
      if (url) {
        if (lead) segments.push({ text: lead })
        segments.push({ text: core, url })
        if (trail) segments.push({ text: trail })
      } else {
        segments.push({ text: tok })
      }
    }
    if (segments.length === 0) return buildParagraph([{ text: t }])
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
export function extractLexicalText(description: unknown): string {  if (!description) return ''
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

function inlineTextNode(text: string): Record<string, unknown> {
  return {
    type: 'text',
    text,
    format: 0,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  }
}

/** Limpa filhos inline (nível de texto/link). Desconhecido dissolve, texto preserva. */
function cleanInlineKids(children: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  if (!Array.isArray(children)) return out
  for (const c of children) {
    if (!c || typeof c !== 'object') continue
    const n = c as Record<string, unknown>
    if (n.type === 'text') {
      if (typeof n.text === 'string' && n.text) out.push(inlineTextNode(n.text))
      continue
    }
    if (
      (n.type === 'link' || n.type === 'autolink') &&
      typeof n.url === 'string' &&
      n.url.trim()
    ) {
      const url = n.url.trim()
      const kids = cleanInlineKids(n.children)
      out.push({
        type: 'link',
        version: 1,
        url,
        target: '_blank',
        rel: 'noopener noreferrer',
        format: '',
        indent: 0,
        direction: 'ltr',
        children: kids.length > 0 ? kids : [inlineTextNode(url)],
      })
      continue
    }
    if (Array.isArray(n.children)) {
      // Container: preserva se for bloco conhecido, senão dissolve o conteúdo.
      if (
        n.type === 'paragraph' ||
        n.type === 'quote' ||
        n.type === 'heading' ||
        n.type === 'list' ||
        n.type === 'listitem'
      ) {
        const kids = cleanInlineKids(n.children)
        out.push({ ...n, children: kids })
      } else {
        out.push(...cleanInlineKids(n.children))
      }
      continue
    }
    if (typeof n.text === 'string' && n.text) out.push(inlineTextNode(n.text))
  }
  return out
}

function cleanBlock(n: Record<string, unknown>): Record<string, unknown> | null {
  const kids = cleanInlineKids(n.children)
  if (n.type === 'paragraph' || n.type === 'quote') {
    return {
      type: n.type,
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      children: kids,
    }
  }
  if (n.type === 'heading' && typeof n.tag === 'string' && /^h[1-6]$/.test(n.tag)) {
    return { type: 'heading', version: 1, tag: n.tag, format: '', indent: 0, direction: 'ltr', children: kids }
  }
  if (
    n.type === 'list' &&
    (n.listType === 'bullet' || n.listType === 'number' || n.listType === 'check')
  ) {
    const items = (Array.isArray(n.children) ? n.children : [])
      .filter(
        (c): c is Record<string, unknown> =>
          !!c && typeof c === 'object' && (c as Record<string, unknown>).type === 'listitem',
      )
      .map((item) => ({
        type: 'listitem',
        version: 1,
        value: typeof item.value === 'number' ? item.value : 1,
        ...(item.checked === true ? { checked: true } : {}),
        format: '',
        indent: 0,
        direction: 'ltr' as const,
        children: cleanInlineKids(item.children),
      }))
    if (items.length === 0) return null
    return {
      type: 'list',
      version: 1,
      listType: n.listType,
      tag: n.listType === 'number' ? 'ol' : 'ul',
      start: typeof n.start === 'number' ? n.start : 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      children: items,
    }
  }
  // Qualquer outra coisa no nível de bloco vira parágrafo (texto preservado).
  if (kids.length === 0) return null
  return { type: 'paragraph', version: 1, format: '', indent: 0, direction: 'ltr', children: kids }
}

/**
 * Higieniza um JSON Lexical antes do `parseEditorState`: remove nós
 * inválidos (link sem URL, tipos desconhecidos, campos fora do formato)
 * preservando o texto, e força `target="_blank"` nos links.
 *
 * É o auto-reparo para descrições que travaram o editor: em vez de quebrar
 * a página, o conteúdo volta como texto (o link pode ser reaplicado à mão).
 * Retorna `null` quando não há conteúdo aproveitável.
 */
export function sanitizeLexicalState(value: unknown): SerializedEditorState | null {
  try {
    const root = (value as { root?: unknown })?.root as
      | Record<string, unknown>
      | undefined
    if (!root || !Array.isArray(root.children)) return null
    const blocks: Record<string, unknown>[] = []
    for (const c of root.children) {
      if (!c || typeof c !== 'object') continue
      const n = c as Record<string, unknown>
      // Inline solto direto na raiz não é válido: embrulha em parágrafo.
      if (n.type === 'text' || n.type === 'link' || n.type === 'autolink') {
        const kids = cleanInlineKids([n])
        if (kids.length > 0) {
          blocks.push({
            type: 'paragraph',
            version: 1,
            format: '',
            indent: 0,
            direction: 'ltr',
            children: kids,
          })
        }
        continue
      }
      const block = cleanBlock(n)
      if (block) blocks.push(block)
    }
    if (blocks.length === 0) return null
    return {
      root: {
        type: 'root',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        children: blocks,
      },
    } as unknown as SerializedEditorState
  } catch {
    return null
  }
}
