import type { SerializedEditorState } from 'lexical'
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND } from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { $createLinkNode, LinkNode } from '@lexical/link'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListNode, ListItemNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

const EDITOR_NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode]

interface LexicalEditorProps {
  initialValue: SerializedEditorState | null
  onChange: (json: SerializedEditorState) => void
  placeholder?: string
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

export default function LexicalEditor({
  initialValue,
  onChange,
  placeholder = 'Escreva a descrição...',
}: LexicalEditorProps) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'hub-task-description',
        nodes: EDITOR_NODES,
        theme: {
          paragraph: 'mb-1',
          list: { ul: 'ml-5 list-disc', ol: 'ml-5 list-decimal', listitem: 'mb-0.5' },
          link: 'text-primary underline',
        },
        editorState:
          initialValue && Object.keys(initialValue).length > 0
            ? (editor) => {
                try {
                  editor.setEditorState(editor.parseEditorState(initialValue))
                } catch {
                  // JSON inválido: começa vazio
                }
              }
            : undefined,
        onError: (error) => console.error('Lexical error:', error),
      }}
    >
      <Toolbar />
      <div className="relative min-h-28 px-3 py-2 text-xs sm:min-h-32">
        <RichTextPlugin
          contentEditable={<ContentEditable className="min-h-28 outline-none text-xs sm:min-h-32" />}
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
      <OnChangePlugin onChange={(editorState) => onChange(editorState.toJSON())} />
    </LexicalComposer>
  )
}