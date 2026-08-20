// src/components/documents/DocumentDetailDrawer.tsx
// Gaveta lateral para visualização de detalhes e leitura do texto extraído do documento

import { useState } from 'react'
import { toast } from '@heroui/react'
import type { HubDocument } from '@/types/database'
import { formatFileSize, getFileIconClass } from '@/lib/extractors'

interface DocumentDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: HubDocument | null
  onDelete?: (doc: HubDocument) => void
}

export default function DocumentDetailDrawer({
  open,
  onOpenChange,
  document: doc,
  onDelete,
}: DocumentDetailDrawerProps) {
  const [searchTerm, setSearchTerm] = useState('')

  if (!open || !doc) return null

  const iconClass = getFileIconClass(doc.file_type)

  async function handleCopyUrl() {
    if (!doc) return
    try {
      await navigator.clipboard.writeText(doc.file_url)
      toast.success('Link direto copiado!')
    } catch {
      toast.danger('Erro ao copiar link.')
    }
  }

  async function handleCopyShortcut() {
    if (!doc) return
    const shortcut = `#doc:${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    try {
      await navigator.clipboard.writeText(shortcut)
      toast.success(`Atalho ${shortcut} copiado!`)
    } catch {
      toast.danger('Erro ao copiar atalho.')
    }
  }

  async function handleCopyText() {
    if (!doc?.extracted_text) return
    try {
      await navigator.clipboard.writeText(doc.extracted_text)
      toast.success('Texto extraído copiado!')
    } catch {
      toast.danger('Erro ao copiar texto.')
    }
  }

  // Realce de texto pesquisado
  function renderHighlightedText(text: string) {
    if (!searchTerm.trim()) {
      return text
    }

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-300 text-black px-0.5 rounded font-semibold">
          {part}
        </mark>
      ) : (
        part
      ),
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-over Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[560px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-250 select-text">
        {/* Header */}
        <div className="flex flex-col gap-2 border-b border-border p-4 bg-muted/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background border border-border text-lg shadow-2xs">
                <i className={iconClass} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-foreground">
                  {doc.title}
                </h2>
                <p className="truncate text-[11px] text-muted-foreground font-mono">
                  {doc.file_name}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>

          {/* Metadata Badges */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
              {formatFileSize(doc.file_size)}
            </span>

            <span className="rounded-md bg-muted px-2 py-0.5 font-medium uppercase text-muted-foreground">
              {doc.file_type}
            </span>

            <span className="text-muted-foreground text-[10px] ml-auto">
              {new Date(doc.created_at).toLocaleDateString('pt-BR')}
            </span>
          </div>

          {/* Tags */}
          {doc.tags && doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {doc.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-primary/10 border border-primary/20 px-1.5 py-0.2 text-[10px] font-medium text-primary"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Quick Actions Bar */}
          <div className="grid grid-cols-3 gap-2">
            <a
              href={doc.file_url}
              download={doc.file_name}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20 cursor-pointer"
            >
              <i className="fa-solid fa-download text-xs" />
              <span>Baixar Arquivo</span>
            </a>

            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2 text-xs font-medium text-foreground transition hover:bg-muted cursor-pointer"
            >
              <i className="fa-solid fa-link text-xs text-muted-foreground" />
              <span>Copiar Link</span>
            </button>

            <button
              type="button"
              onClick={handleCopyShortcut}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2 text-xs font-medium text-foreground transition hover:bg-muted cursor-pointer"
            >
              <i className="fa-solid fa-hashtag text-xs text-muted-foreground" />
              <span>Atalho (#)</span>
            </button>
          </div>

          {/* Search in Extracted Text */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground flex items-center gap-1.5 text-xs">
                <i className="fa-solid fa-file-lines text-primary" />
                Texto Extraído (Base da IA):
              </span>
              {doc.extracted_text && (
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition cursor-pointer"
                >
                  <i className="fa-solid fa-copy text-[10px]" />
                  <span>Copiar Texto</span>
                </button>
              )}
            </div>

            {doc.extracted_text ? (
              <>
                <div className="relative flex items-center">
                  <i className="fa-solid fa-magnifying-glass absolute left-2.5 text-[11px] text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Pesquisar dentro deste documento..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-md border border-border bg-background pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 text-muted-foreground hover:text-foreground text-xs cursor-pointer"
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-background p-3.5 font-mono text-[11px] leading-relaxed text-foreground/90 max-h-96 overflow-y-auto whitespace-pre-wrap select-text shadow-inner">
                  {renderHighlightedText(doc.extracted_text)}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                <i className="fa-solid fa-file-circle-exclamation text-base mb-2 text-muted-foreground/60" />
                <p>Nenhum texto legível foi extraído deste arquivo.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-3 flex justify-between items-center bg-muted/10">
          {onDelete ? (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Deseja realmente excluir o documento "${doc.title}"?`)) {
                  onDelete(doc)
                  onOpenChange(false)
                }
              }}
              className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition cursor-pointer"
            >
              <i className="fa-solid fa-trash text-xs" />
              <span>Excluir Documento</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </>
  )
}
