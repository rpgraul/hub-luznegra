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
  PASTE_COMMAND,
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
import { Button, Modal } from '@heroui/react'
import {
  legacyStringToLexicalState,
  normalizeLinkUrl,
} from '@/utils/lexical'

const EDITOR_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
]

/** Todo link do editor abre em nova aba. */
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

interface LinkSnapshot {
  text: string
  url: string | null
  hasSelection: boolean
}

function readSnapshot(): LinkSnapshot {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return { text: '', url: null, hasSelection: false }
  const link = $findLinkParent(selection)
  const text = selection.getTextContent() || link?.getTextContent() || ''
  return { text, url: link?.getURL() ?? null, hasSelection: true }
}

/** Modal central (shadcn/HeroUI) para inserir ou editar link. */
function LinkModal({
  open,
  onOpenChange,
  initialText,
  initialUrl,
  isEditing,
  onApply,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialText: string
  initialUrl: string
  isEditing: boolean
  onApply: (displayText: string, url: string) => void
  onRemove: () => void
}) {
  const [text, setText] = useState(initialText)
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setText(initialText)
      setUrl(initialUrl)
      setError(null)
      setTimeout(() => urlRef.current?.focus(), 120)
    }
  }, [open, initialText, initialUrl])

  const normalized = normalizeLinkUrl(url)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const valid = normalizeLinkUrl(url)
    if (!valid) {
      setError('Informe uma URL válida. Ex.: https://exemplo.com ou www.exemplo.com')
      return
    }
    onApply(text, valid)
  }

  const inputCls =
    'w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20'

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.Header className="shrink-0 border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <i className="fa-solid fa-link text-sm text-primary" />
              </div>
              <div>
                <Modal.Heading className="text-base font-bold">
                  {isEditing ? 'Editar link' : 'Inserir link'}
                </Modal.Heading>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  O link sempre abre em uma nova aba.
                </p>
              </div>
            </div>
          </Modal.Header>

          <form onSubmit={handleSubmit}>
            <Modal.Body className="space-y-4 py-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold tracking-wide text-foreground/80 uppercase">
                  Texto para exibir
                </label>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ex.: Documentação do projeto"
                  className={inputCls}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold tracking-wide text-foreground/80 uppercase">
                  URL <span className="text-destructive">*</span>
                </label>
                <input
                  ref={urlRef}
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setError(null)
                  }}
                  placeholder="https://exemplo.com"
                  className={inputCls}
                />
                {error ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-destructive">
                    <i className="fa-solid fa-circle-exclamation text-[10px]" />
                    {error}
                  </p>
                ) : normalized ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <i className="fa-solid fa-check text-[10px] text-green-500" />
                    <span className="truncate">{normalized}</span>
                    <a
                      href={normalized}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" />
                      Abrir em nova aba
                    </a>
                  </p>
                ) : url.trim() ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <i className="fa-solid fa-circle-info text-[10px]" />
                    Aceitamos https://, www. ou domínio (ex.: empresa.com.br). E-mails ficam como texto normal.
                  </p>
                ) : null}
              </div>
            </Modal.Body>

            <Modal.Footer className="shrink-0 border-t border-border pt-3">
              {isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mr-auto rounded-xl border-destructive/40 px-4 text-xs font-semibold text-destructive"
                  onPress={onRemove}
                >
                  <i className="fa-solid fa-link-slash mr-2" />
                  Remover link
                </Button>
              )}
              <Button
                variant="outline"
                type="button"
                size="sm"
                className="rounded-xl border-border px-4 text-xs font-semibold"
                onPress={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="rounded-xl bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                <i className="fa-solid fa-check mr-2" />
                Aplicar
              </Button>
            </Modal.Footer>
          </form>
          <Modal.CloseTrigger />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function Toolbar() {
  const [editor] = useLexicalComposerContext()
  const [isLink, setIsLink] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState({ text: '', url: '' })

  // Estado reativo: acende o botão quando o cursor está dentro de um link.
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setIsLink(false)
          return
        }
        setIsLink($findLinkParent(selection) !== null)
      })
    })
  }, [editor])

  // Atalho moderno: Ctrl/⌘+K abre o editor de link.
  useEffect(() => {
    return editor.registerCommand<KeyboardEvent>(
      KEY_DOWN_COMMAND,
      (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          openLinkModal()
          return true
        }
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor])

  function openLinkModal() {
    editor.getEditorState().read(() => {
      const snap = readSnapshot()
      setDraft({ text: snap.text, url: snap.url ?? snap.text })
    })
    setModalOpen(true)
  }

  function applyLink(displayText: string, url: string) {
    const label = displayText.trim() || url
    editor.focus()
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      selection.removeText()
      const linkNode = $createLinkNode(url, {
        target: LINK_ATTRS.target,
        rel: LINK_ATTRS.rel,
      })
      linkNode.append($createTextNode(label))
      selection.insertNodes([linkNode])
    })
    setModalOpen(false)
  }

  function removeLink() {
    editor.focus()
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    setModalOpen(false)
  }

  const btn =
    'flex size-7 items-center justify-center rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground'
  const btnActive = 'bg-accent text-foreground'

  return (
    <>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
        <button type="button" title="Negrito (Ctrl+B)" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>
          <i className="fa-solid fa-bold" />
        </button>
        <button type="button" title="Itálico (Ctrl+I)" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}>
          <i className="fa-solid fa-italic" />
        </button>
        <button type="button" title="Sublinhado (Ctrl+U)" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}>
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
          onClick={openLinkModal}
        >
          <i className="fa-solid fa-link" />
        </button>
      </div>
      <LinkModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialText={draft.text}
        initialUrl={draft.url}
        isEditing={isLink}
        onApply={applyLink}
        onRemove={removeLink}
      />
    </>
  )
}

/**
 * Garante `target="_blank" rel="noopener noreferrer"` em todo link —
 * inclusive nós antigos e links vindos de HTML colado.
 */
function LinkTargetPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const fix = (node: LinkNode) => {
      if (node.getTarget() !== '_blank') node.setTarget('_blank')
      if (node.getRel() !== 'noopener noreferrer') node.setRel('noopener noreferrer')
    }
    const offLink = editor.registerNodeTransform(LinkNode, fix)
    const offAuto = editor.registerNodeTransform(AutoLinkNode, fix)
    return () => {
      offLink()
      offAuto()
    }
  }, [editor])

  return null
}

/**
 * Colar inteligente:
 * - URL pura (texto) com cursor parado vira link clicável (texto = URL);
 * - HTML com `<a href>` usa a importação padrão (o LinkTargetPlugin
 *   garante nova aba) — por isso retornamos `false` nesse caso.
 */
function PasteLinkPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboard =
          event instanceof ClipboardEvent ? event.clipboardData : null
        if (!clipboard) return false
        const html = clipboard.getData('text/html')
        if (html && /<a\s[^>]*href=/i.test(html)) return false
        const plain = (clipboard.getData('text/plain') ?? '').trim()
        if (!plain || /\s/.test(plain)) return false
        const url = normalizeLinkUrl(plain)
        if (!url) return false
        event.preventDefault()
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return
          selection.removeText()
          const linkNode = $createLinkNode(url, {
            target: LINK_ATTRS.target,
            rel: LINK_ATTRS.rel,
          })
          linkNode.append($createTextNode(plain))
          selection.insertNodes([linkNode])
        })
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor])

  return null
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
 * Normaliza o valor inicial (objeto Lexical, string JSON, texto puro ou
 * HTML legado com `<a href>`) para `SerializedEditorState`.
 * Retorna `null` quando vazio.
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
        return parsed as SerializedEditorState
      }
    } catch {
      // texto puro ou HTML: converte abaixo
    }
    return legacyStringToLexicalState(t)
  }
  return Object.keys(value).length > 0 ? value : null
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
          paragraph: 'mb-1',
          list: { ul: 'ml-5 list-disc', ol: 'ml-5 list-decimal', listitem: 'mb-0.5' },
          link: 'cursor-pointer text-primary underline underline-offset-2 hover:text-primary/80',
        },
        editorState: editorStateFn,
        onError: (error) => console.error('Lexical error:', error),
      }}
    >
      <Toolbar />
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
      <LinkPlugin validateUrl={validateLinkUrl} attributes={{ ...LINK_ATTRS }} />
      <AutoLinkPlugin matchers={[autoLinkUrlMatcher]} />
      <ClickableLinkPlugin newTab />
      <LinkTargetPlugin />
      <PasteLinkPlugin />
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
