import type { LexicalEditor as LexicalEditorType, SerializedEditorState } from 'lexical'
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND } from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { $createLinkNode, LinkNode } from '@lexical/link'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListNode, ListItemNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect, useRef } from 'react'

const EDITOR_NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode]

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

function Toolbar() {
  const [editor] = useLexicalComposerContext()

  function insertLink() {
    const url = window.prompt('URL do link (https://...)')
    if (!url) return

    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection) || selection.isCollapsed()) return
      const link = $createLinkNode(url.trim())
      selection.insertNodes([link])
    })
  }

  const btn =
    'flex size-7 items-center justify-center rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground'

  return (
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
      <button type="button" title="Inserir link" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={insertLink}>
        <i className="fa-solid fa-link" />
      </button>
    </div>
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
 * Normaliza o valor inicial (objeto Lexical, string JSON ou texto puro
 * legado) para `SerializedEditorState`. Retorna `null` quando vazio.
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
      // texto puro: converte abaixo
    }
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
            children: [
              {
                type: 'text',
                text: t,
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
            direction: 'ltr',
          },
        ],
        direction: 'ltr',
      },
    } as unknown as SerializedEditorState
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
          link: 'text-primary underline',
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
      <LinkPlugin />
      <EmitChangePlugin onChange={onChange} />
    </LexicalComposer>
  )
}