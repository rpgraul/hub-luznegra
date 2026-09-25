import type { ReactNode } from 'react'

/** Bits de formatação de texto do Lexical (espelha utils/lexical.ts). */
const BOLD = 1
const ITALIC = 2
const STRIKETHROUGH = 4
const UNDERLINE = 8
const CODE = 16
const SUBSCRIPT = 32
const SUPERSCRIPT = 64
const HIGHLIGHT = 128

interface Node {
  type?: string
  text?: string
  format?: number | string
  url?: string
  listType?: string
  tag?: string
  indent?: number
  children?: Node[]
}

function formatClass(format: number | string | undefined): string {
  if (typeof format !== 'number') return ''
  const classes: string[] = []
  if (format & BOLD) classes.push('font-bold')
  if (format & ITALIC) classes.push('italic')
  if (format & UNDERLINE) classes.push('underline underline-offset-2')
  if (format & STRIKETHROUGH) classes.push('line-through')
  if (format & CODE) classes.push('rounded bg-muted px-1 font-mono text-[11px]')
  if (format & HIGHLIGHT) classes.push('rounded bg-yellow-300/50 px-0.5')
  return classes.join(' ')
}

function wrapText(node: Node, key: React.Key): ReactNode {
  const content: ReactNode = node.text ?? ''
  if (formatClass(node.format)) {
    const className = formatClass(node.format)
    if (node.format && typeof node.format === 'number' && node.format & SUBSCRIPT) {
      return (
        <sub key={key} className={className}>
          {content}
        </sub>
      )
    }
    if (node.format && typeof node.format === 'number' && node.format & SUPERSCRIPT) {
      return (
        <sup key={key} className={className}>
          {content}
        </sup>
      )
    }
    return (
      <span key={key} className={className}>
        {content}
      </span>
    )
  }
  return <span key={key}>{content}</span>
}

/** Filhos inline (texto + links) de um bloco do Lexical. */
function renderInline(nodes: Node[] | undefined, keyPrefix: string): ReactNode[] {
  if (!Array.isArray(nodes)) return []
  return nodes.map((child, i) => {
    const key = `${keyPrefix}-${i}`
    if (child.type === 'text') return wrapText(child, key)
    if (child.type === 'link' || child.type === 'autolink') {
      const href = child.url || '#'
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {renderInline(child.children, key)}
        </a>
      )
    }
    if (Array.isArray(child.children)) return renderInline(child.children, key)
    return null
  })
}

function renderBlock(node: Node, key: string): ReactNode {
  const children = node.children ?? []

  if (node.type === 'list') {
    const ordered = node.listType === 'number'
    const items = children
      .filter((c) => c.type === 'listitem')
      .map((item, i) => (
        <li key={`${key}-li-${i}`}>
          {renderInline(item.children, `${key}-li-${i}`)}
          {/* Sub-listas aninhadas */}
          {item.children
            ?.filter((c) => c.type === 'list')
            .map((sub, j) => (
              <div key={`${key}-sub-${j}`} className="ml-4">
                {renderBlock(sub, `${key}-sub-${j}`)}
              </div>
            ))}
        </li>
      ))
    return ordered ? (
      <ol key={key} className="ml-5 list-decimal">
        {items}
      </ol>
    ) : (
      <ul key={key} className="ml-5 list-disc">
        {items}
      </ul>
    )
  }

  if (node.type === 'heading') {
    const tag = typeof node.tag === 'string' && /^h[1-6]$/.test(node.tag) ? node.tag : 'h4'
    const sizes: Record<string, string> = {
      h1: 'text-base',
      h2: 'text-sm',
      h3: 'text-sm',
      h4: 'text-xs',
      h5: 'text-xs',
      h6: 'text-xs',
    }
    const Tag = tag as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    return (
      <Tag key={key} className={`mb-1 font-semibold text-foreground ${sizes[tag]}`}>
        {renderInline(children, key)}
      </Tag>
    )
  }

  if (node.type === 'quote') {
    return (
      <blockquote
        key={key}
        className="border-l-2 border-primary/40 pl-2 italic text-muted-foreground"
      >
        {renderInline(children, key)}
      </blockquote>
    )
  }

  // paragraph (e qualquer bloco desconhecido com texto)
  return (
    <p key={key} className="whitespace-pre-wrap">
      {renderInline(children, key)}
    </p>
  )
}

/**
 * Renderiza um estado serializado do Lexical (JSONB) como somente leitura.
 * Não existia um renderizador no projeto — só o editor. Usado no modal de
 * detalhes do fornecedor para mostrar descrição/observação formatadas.
 */
export default function LexicalReadOnly({
  value,
  className = '',
}: {
  value: unknown
  className?: string
}) {
  const root = (value as { root?: { children?: Node[] } })?.root
  const blocks = Array.isArray(root?.children) ? root!.children : []
  if (blocks.length === 0) return null

  return (
    <div className={`space-y-1 text-xs text-foreground/90 ${className}`}>
      {blocks.map((block, i) => renderBlock(block, `b${i}`))}
    </div>
  )
}
