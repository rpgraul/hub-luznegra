import type {
  LexicalEditor as LexicalEditorType,
  LexicalNode,
  RangeSelection,
  SerializedEditorState,
} from 'lexical'
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
} from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { AutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin'
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import {
  $createLinkNode,
  $isLinkNode,
  autoLinkUrlMatcher,
  AutoLinkNode,
  LinkNode,
  TOGGLE_LINK_COMMAND,
} from '@lexical/link'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  ListItemNode,
} from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  extractLexicalText,
  isUrlLike,
  legacyStringToLexicalState,
  normalizeLinkUrl,
  sanitizeLexicalState,
} from '@/utils/lexical'

const EDITOR_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
]

/** Todo link criado pelo editor abre em nova aba. */
const LINK_ATTRS = { target: '_blank', rel: 'noopener noreferrer' } as const

/** E-mails NÃO são links (pedido do produto): só http(s)/www/domínio. */
function validateLinkUrl(url: string): boolean {
  return normalizeLinkUrl(url) !== null
}

function $findLinkParent(selection: RangeSelection): LinkNode | null {
  let node: LexicalNode | null = selection.anchor.getNode()
  while (node) {
    if ($isLinkNode(node)) return node
    node = node.getParent()
  }
  return null
}

interface LinkPopoverData {
  /** Texto selecionado (somente leitura, estilo Notion). */
  text: string
  /** URL inicial do campo (link existente ou '' ). */
  initialUrl: string
  isEditing: boolean
  /** Seleção colapsada na abertura → insere link novo em vez de envolver. */
  collapsed: boolean
  anchor: { top: number; left: number }
}

/** Posição fixa do popover: abaixo da seleção, com fallback na toolbar. */
function computeAnchor(toolbar: HTMLElement | null): { top: number; left: number } {
  const domSel = window.getSelection()
  const rect =
    domSel && domSel.rangeCount > 0 ? domSel.getRangeAt(0).getBoundingClientRect() : null
  let top: number
  let left: number
  if (rect && (rect.top !== 0 || rect.left !== 0 || rect.bottom !== 0)) {
    top = rect.bottom + 8
    left = rect.left
  } else {
    const tb = toolbar?.getBoundingClientRect()
    top = (tb?.bottom ?? 120) + 8
    left = tb?.left ?? 120
  }
  return {
    top: Math.max(8, Math.min(top, window.innerHeight - 220)),
    left: Math.max(8, Math.min(left, window.innerWidth - 336)),
  }
}

/**
 * Popover de link estilo Notion: pequeno, colado na seleção, só o campo URL.
 * Enter aplica, Esc fecha.
 */
function LinkPopover({
  data,
  onClose,
  onApply,
  onRemove,
}: {
  data: LinkPopoverData
  onClose: () => void
  onApply: (url: string) => void
  onRemove: () => void
}) {
  const [url, setUrl] = useState(data.initialUrl)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 30)
  }, [])

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node | null)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  const normalized = normalizeLinkUrl(url)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!normalizeLinkUrl(url)) {
      setError('Cole uma URL válida. Ex.: https://exemplo.com')
      return
    }
    onApply(url)
  }

  return (
    <div
      ref={boxRef}
      className="fixed z-[200] w-80 rounded-xl border border-border bg-popover p-2.5 text-foreground shadow-xl"
      style={{ top: data.anchor.top, left: data.anchor.left }}
      role="dialog"
      aria-label={data.isEditing ? 'Editar link' : 'Inserir link'}
    >
      <form onSubmit={handleSubmit}>
        {data.text && (
          <p className="mb-1.5 truncate px-1 text-[11px] text-muted-foreground">
            Texto: <span className="font-semibold text-foreground">{data.text}</span>
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <i className="fa-solid fa-link text-[11px] text-primary" />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
              }
            }}
            placeholder="Colar link…"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary"
          />
          {data.isEditing && (
            <button
              type="button"
              title="Remover link"
              onClick={onRemove}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <i className="fa-solid fa-link-slash text-[11px]" />
            </button>
          )}
          <button
            type="submit"
            title="Aplicar (Enter)"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90"
          >
            <i className="fa-solid fa-check text-[11px]" />
          </button>
        </div>
        {error ? (
          <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] text-destructive">
            <i className="fa-solid fa-circle-exclamation text-[10px]" />
            {error}
          </p>
        ) : normalized ? (
          <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <i className="fa-solid fa-check text-[10px] text-green-500" />
            <span className="min-w-0 flex-1 truncate">{normalized}</span>
            <a
              href={normalized}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir em nova aba"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline"
            >
              <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" />
            </a>
          </p>
        ) : (
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            Enter aplica · Esc fecha · abre em nova aba
          </p>
        )}
      </form>
    </div>
  )
}

/** Toolbar + popover de link (precisam do mesmo contexto do composer). */
type FormatKey = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code'

function ToolbarWithLink() {
  const [editor] = useLexicalComposerContext()
  const [isLink, setIsLink] = useState(false)
  // Formatações ativas na seleção: sem isso o usuário não tem como saber o
  // estado real (e acabava clicando de novo, que TOGLA e desligava).
  const [activeFormats, setActiveFormats] = useState<Record<FormatKey, boolean>>({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    code: false,
  })
  const [pop, setPop] = useState<LinkPopoverData | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<LinkPopoverData | null>(null)
  popRef.current = pop

  // Estado reativo: acende o botão quando o cursor está dentro de um link.
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setIsLink(false)
          setActiveFormats((prev) => {
            const allOff =
              !prev.bold && !prev.italic && !prev.underline && !prev.strikethrough && !prev.code
            return allOff
              ? prev
              : { bold: false, italic: false, underline: false, strikethrough: false, code: false }
          })
          return
        }
        setIsLink($findLinkParent(selection) !== null)
        setActiveFormats({
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          underline: selection.hasFormat('underline'),
          strikethrough: selection.hasFormat('strikethrough'),
          code: selection.hasFormat('code'),
        })
      })
    })
  }, [editor])

  function openLink() {
    let snap = { text: '', initialUrl: '', isEditing: false, collapsed: true }
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      const link = $findLinkParent(selection)
      const selectedText = selection.getTextContent().slice(0, 120)
      const linkText = link?.getTextContent().slice(0, 120) ?? ''
      const text = selectedText || linkText
      snap = {
        text,
        initialUrl: link?.getURL() ?? (isUrlLike(text) ? text : ''),
        isEditing: link !== null,
        collapsed: selection.isCollapsed(),
      }
    })
    setPop({ ...snap, anchor: computeAnchor(toolbarRef.current) })
  }

  // Atalho estilo Notion: Ctrl/⌘+K abre o popover de link.
  useEffect(() => {
    return editor.registerCommand<KeyboardEvent>(
      KEY_DOWN_COMMAND,
      (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          openLink()
          return true
        }
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor])

  function closePop() {
    setPop(null)
    editor.focus()
  }

  function applyPop(urlRaw: string) {
    const valid = normalizeLinkUrl(urlRaw)
    if (!valid) return
    const wasCollapsed = popRef.current?.collapsed ?? true
    setPop(null)
    editor.focus()
    if (wasCollapsed) {
      // Cursor parado: insere link novo com a própria URL como texto.
      editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        const linkNode = $createLinkNode(valid, {
          target: LINK_ATTRS.target,
          rel: LINK_ATTRS.rel,
        })
        linkNode.append($createTextNode(valid))
        selection.insertNodes([linkNode])
      })
    } else {
      // Texto selecionado: envolve a seleção (ou atualiza o link existente).
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, {
        url: valid,
        target: LINK_ATTRS.target,
        rel: LINK_ATTRS.rel,
      })
    }
  }

  function removePop() {
    setPop(null)
    editor.focus()
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
  }

  /**
   * Aplica/remove UMA formatação sem tocar nas outras.
   * `FORMAT_TEXT_COMMAND` já é toggle, mas usar `setFormat` (número) com o bit
   * preservado deixa o comportamento explícito: bold+italic+underline juntos.
   */
  function toggleFormat(format: FormatKey) {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
  }

  const btn =
    'flex size-7 items-center justify-center rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground'
  const btnActive = 'bg-accent text-primary'

  return (
    <>
      <div
        ref={toolbarRef}
        className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1"
      >
        <button type="button" title="Negrito (Ctrl+B)" aria-pressed={activeFormats.bold}
          className={`${btn} ${activeFormats.bold ? btnActive : ''}`}
          onMouseDown={(e) => e.preventDefault()} onClick={() => toggleFormat('bold')}>
          <i className="fa-solid fa-bold" />
        </button>
        <button type="button" title="Itálico (Ctrl+I)" aria-pressed={activeFormats.italic}
          className={`${btn} ${activeFormats.italic ? btnActive : ''}`}
          onMouseDown={(e) => e.preventDefault()} onClick={() => toggleFormat('italic')}>
          <i className="fa-solid fa-italic" />
        </button>
        <button type="button" title="Sublinhado (Ctrl+U)" aria-pressed={activeFormats.underline}
          className={`${btn} ${activeFormats.underline ? btnActive : ''}`}
          onMouseDown={(e) => e.preventDefault()} onClick={() => toggleFormat('underline')}>
          <i className="fa-solid fa-underline" />
        </button>
        <button type="button" title="Lista com marcadores" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>
          <i className="fa-solid fa-list-ul" />
        </button>
        <button type="button" title="Lista numerada" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}>
          <i className="fa-solid fa-list-ol" />
        </button>
        <button
          type="button"
          title={isLink ? 'Editar link (Ctrl+K)' : 'Inserir link (Ctrl+K)'}
          className={`${btn} ${isLink ? btnActive : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLink}
        >
          <i className="fa-solid fa-link" />
        </button>
      </div>
      {pop && (
        <LinkPopover
          data={pop}
          onClose={closePop}
          onApply={applyPop}
          onRemove={removePop}
        />
      )}
    </>
  )
}

/**
 * Emite o estado serializado a cada mudança de conteúdo — INCLUSIVE a
 * primeira digitação partindo do editor vazio.
 *
 * O `OnChangePlugin` oficial ignora a transição `empty -> texto`
 * (`prevEditorState.isEmpty()`), o que fazia a descrição nunca chegar ao
 * `onChange` quando a tarefa partia de `null`/vazio. Por isso usamos um
 * listener próprio sem esse filtro.
 */
function EmitChangePlugin({
  onChange,
}: {
  onChange: (json: SerializedEditorState) => void
}) {
  const [editor] = useLexicalComposerContext()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
        onChangeRef.current(editorState.toJSON())
      },
    )
  }, [editor])

  return null
}

/**
 * Normaliza o valor inicial para `SerializedEditorState`. Todo JSON passa
 * pelo `sanitizeLexicalState` (remove nó inválido preservando o texto), de
 * modo que uma descrição corrompida nunca quebra a página — no pior caso o
 * conteúdo volta como texto puro. Retorna `null` quando vazio.
 */
function normalizeInitial(
  value: SerializedEditorState | string | null,
): SerializedEditorState | null {
  if (!value) return null
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return null
    try {
      const parsed = JSON.parse(t) as unknown
      if (parsed && typeof parsed === 'object' && 'root' in parsed) {
        return (
          sanitizeLexicalState(parsed) ??
          legacyStringToLexicalState(extractLexicalText(parsed))
        )
      }
    } catch {
      // texto puro ou HTML: converte abaixo
    }
    return legacyStringToLexicalState(t)
  }
  return (
    sanitizeLexicalState(value) ??
    legacyStringToLexicalState(extractLexicalText(value))
  )
}

export default function LexicalEditor({
  initialValue,
  onChange,
  placeholder = 'Escreva a descrição...',
  namespace = 'hub-task-description',
}: LexicalEditorProps) {
  // Calculado uma única vez por mount: o LexicalComposer só consome
  // `editorState` na construção do editor, e o pai remonta (via `key`) a cada
  // troca de tarefa — então o valor do primeiro render precisa estar correto.
  const initialRef = useRef<SerializedEditorState | null | undefined>(undefined)
  if (initialRef.current === undefined) {
    initialRef.current = normalizeInitial(initialValue)
  }
  const editorStateFn = initialRef.current
    ? (editor: LexicalEditorType) => {
        try {
          editor.setEditorState(
            editor.parseEditorState(
              initialRef.current as SerializedEditorState,
            ),
          )
        } catch {
          // JSON inválido: começa vazio
        }
      }
    : undefined

  return (
    <LexicalComposer
      initialConfig={{
        namespace,
        nodes: EDITOR_NODES,
        theme: {
          // O Lexical só aplica as classes de formatação quando `theme.text`
          // existe ($createTextInnerDOM). Sem este mapa, negrito/itálico/
          // sublinhado eram gravados no estado mas não apareciam.
          text: {
            bold: 'font-bold',
            italic: 'italic',
            underline: 'underline underline-offset-2',
            strikethrough: 'line-through',
            code: 'rounded bg-muted px-1 py-0.5 font-mono text-[11px]',
            highlight: 'rounded bg-yellow-300/50 px-0.5',
            subscript: 'align-sub text-[0.75em]',
            superscript: 'align-super text-[0.75em]',
            lowercase: 'lowercase',
            uppercase: 'uppercase',
            capitalize: 'capitalize',
          },
          paragraph: 'mb-1',
          list: { ul: 'ml-5 list-disc', ol: 'ml-5 list-decimal', listitem: 'mb-0.5' },
          link: 'cursor-pointer text-primary underline underline-offset-2 hover:text-primary/80',
        },
        editorState: editorStateFn,
        onError: (error) => console.error('Lexical error:', error),
      }}
    >
      <ToolbarWithLink />
      <div className="relative min-h-28 px-3 py-2 text-xs text-foreground sm:min-h-32">
        <RichTextPlugin
          contentEditable={<ContentEditable className="min-h-28 text-xs text-foreground caret-foreground outline-none sm:min-h-32" />}
          placeholder={
            <div className="pointer-events-none absolute top-2 left-3 text-xs text-muted-foreground select-none">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <ListPlugin />
      {/*
        Colar URL pura vira link sozinho via `validateUrl` (nativo do LinkPlugin).
        Sem handler custom de paste e sem transforms vivos: eram as causas do
        travamento (writes concorrentes + mutação em node transform).
      */}
      <LinkPlugin validateUrl={validateLinkUrl} attributes={{ ...LINK_ATTRS }} />
      <AutoLinkPlugin matchers={[autoLinkUrlMatcher]} />
      <ClickableLinkPlugin newTab />
      <EmitChangePlugin onChange={onChange} />
    </LexicalComposer>
  )
}

interface LexicalEditorProps {
  initialValue: SerializedEditorState | string | null
  onChange: (json: SerializedEditorState) => void
  placeholder?: string
  /**
   * Namespace único por instância. Obrigatório quando há mais de um editor
   * montado ao mesmo tempo (ex: drawer da tarefa + modal de subtarefa),
   * senão os editores compartilham estado e o conteúdo se perde.
   */
  namespace?: string
}
