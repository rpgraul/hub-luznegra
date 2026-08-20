// src/components/documents/DocumentDetailDrawer.tsx
// Modal em tela cheia para visualização completa do documento original (PDF/Imagem/Texto) lado a lado com a base da IA

import { useState, useEffect } from 'react'
import { toast } from '@heroui/react'
import type { HubDocument } from '@/types/database'
import { formatFileSize, getFileIconClass } from '@/lib/extractors'

interface DocumentDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: HubDocument | null
  onDelete?: (doc: HubDocument) => void
}

type ViewMode = 'split' | 'original' | 'text'

export default function DocumentDetailDrawer({
  open,
  onOpenChange,
  document: doc,
  onDelete,
}: DocumentDetailDrawerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [iframeError, setIframeError] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  // Reseta estados ao abrir outro documento
  useEffect(() => {
    if (doc) {
      setSearchTerm('')
      setIframeError(false)
    }
  }, [doc?.id])

  if (!open || !doc) return null

  const iconClass = getFileIconClass(doc.file_type)
  const isPdf = doc.file_type.toLowerCase() === 'pdf' || doc.file_name.toLowerCase().endsWith('.pdf')
  const isImage = ['image', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(doc.file_type.toLowerCase()) ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.file_name)

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
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Full-Screen Modal Viewer */}
      <div className="fixed inset-2 md:inset-4 z-[70] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          {/* Document Title & Meta */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 text-base shadow-2xs">
              <i className={iconClass} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-bold text-foreground">
                  {doc.title}
                </h2>
                <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground border border-border/60">
                  {doc.file_type}
                </span>
              </div>
              <p className="truncate text-[11px] text-muted-foreground font-mono">
                {doc.file_name} • {formatFileSize(doc.file_size)} • {new Date(doc.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Center Mode Switcher (Desktop) */}
          <div className="flex items-center rounded-lg bg-muted/60 p-0.5 border border-border/80 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-background text-primary shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <i className="fa-solid fa-table-columns text-xs" />
              <span className="hidden sm:inline">Lado a Lado</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('original')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'original'
                  ? 'bg-background text-primary shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <i className="fa-solid fa-file-lines text-xs" />
              <span>Documento Original</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('text')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'text'
                  ? 'bg-background text-primary shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <i className="fa-solid fa-wand-magic-sparkles text-xs" />
              <span>Texto da IA</span>
            </button>
          </div>

          {/* Quick Action Buttons & Close */}
          <div className="flex items-center gap-2">
            <a
              href={doc.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition cursor-pointer"
              title="Abrir arquivo original em nova aba"
            >
              <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
              <span className="hidden sm:inline">Abrir em Nova Aba</span>
            </a>

            <a
              href={doc.file_url}
              download={doc.file_name}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted transition cursor-pointer shadow-2xs"
              title="Baixar arquivo original"
            >
              <i className="fa-solid fa-download text-xs" />
              <span className="hidden sm:inline">Baixar</span>
            </a>

            <button
              type="button"
              onClick={handleCopyShortcut}
              className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer shadow-2xs"
              title="Copiar atalho (#doc:...)"
            >
              <i className="fa-solid fa-hashtag text-xs" />
            </button>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
          {/* LEFT PANE: Visualizador do Documento Original */}
          {(viewMode === 'split' || viewMode === 'original') && (
            <div
              className={`flex flex-col h-full overflow-hidden bg-muted/20 border-r border-border ${
                viewMode === 'split' ? 'w-full lg:w-3/5' : 'w-full'
              }`}
            >
              {/* Header do Visualizador Original */}
              <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2 text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <i className="fa-solid fa-eye text-primary text-xs" />
                  Visualização do Arquivo Original
                </span>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium text-[11px] flex items-center gap-1"
                >
                  <span>Tela cheia</span>
                  <i className="fa-solid fa-arrow-up-right-from-square text-[9px]" />
                </a>
              </div>

              {/* Renderizador por Tipo de Arquivo */}
              <div className="flex-1 min-h-0 relative p-2 overflow-hidden bg-neutral-900/5 dark:bg-neutral-950/40">
                {isPdf ? (
                  !iframeError ? (
                    <iframe
                      src={`${doc.file_url}#toolbar=1&navpanes=1`}
                      title={doc.title}
                      className="w-full h-full border-0 rounded-xl bg-white shadow-inner"
                      onError={() => setIframeError(true)}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-card rounded-xl border border-border">
                      <i className="fa-solid fa-file-pdf text-4xl text-red-500 mb-3" />
                      <h3 className="text-sm font-bold text-foreground">PDF Pronto para Visualização</h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                        O navegador impediu o carregamento direto no quadro. Clique abaixo para abrir o PDF em nova aba:
                      </p>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
                      >
                        <i className="fa-solid fa-arrow-up-right-from-square" />
                        <span>Abrir PDF em Nova Guia</span>
                      </a>
                    </div>
                  )
                ) : isImage ? (
                  <div className="flex h-full items-center justify-center p-4 overflow-auto">
                    <img
                      src={doc.file_url}
                      alt={doc.title}
                      className="max-h-full max-w-full rounded-lg object-contain shadow-lg border border-border"
                    />
                  </div>
                ) : (
                  /* Fallback para DOCX / XLSX / Arquivos diversos */
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-card rounded-xl border border-border">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 text-2xl mb-4 shadow-sm">
                      <i className={iconClass} />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">{doc.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md">
                      Arquivo {doc.file_type.toUpperCase()} ({formatFileSize(doc.file_size)}). Você pode visualizá-lo em nova guia ou consultar todo o conteúdo extraído no painel da IA ao lado.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2 justify-center">
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
                      >
                        <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
                        <span>Abrir Arquivo em Nova Aba</span>
                      </a>
                      <a
                        href={doc.file_url}
                        download={doc.file_name}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
                      >
                        <i className="fa-solid fa-download text-xs" />
                        <span>Baixar Arquivo</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RIGHT PANE: Texto Extraído da IA & Metadados */}
          {(viewMode === 'split' || viewMode === 'text') && (
            <div
              className={`flex flex-col h-full overflow-hidden bg-card ${
                viewMode === 'split' ? 'w-full lg:w-2/5' : 'w-full'
              }`}
            >
              {/* Header do Painel da IA */}
              <div className="flex flex-col gap-2 border-b border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground flex items-center gap-1.5 text-xs">
                    <i className="fa-solid fa-wand-magic-sparkles text-primary text-xs" />
                    Texto Extraído (Base da IA Lorde Camarão)
                  </span>

                  {doc.extracted_text && (
                    <button
                      type="button"
                      onClick={handleCopyText}
                      className="flex items-center gap-1 rounded bg-muted/80 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                    >
                      <i className="fa-solid fa-copy text-[10px]" />
                      <span>Copiar Texto</span>
                    </button>
                  )}
                </div>

                {/* Busca no Texto */}
                {doc.extracted_text && (
                  <div className="relative flex items-center">
                    <i className="fa-solid fa-magnifying-glass absolute left-2.5 text-[11px] text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Buscar termos dentro deste documento..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background pl-7 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
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
                )}
              </div>

              {/* Corpo do Texto Extraído */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                {doc.extracted_text ? (
                  <div className="rounded-xl border border-border bg-background p-4 font-mono text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap select-text shadow-inner">
                    {renderHighlightedText(doc.extracted_text)}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-xs text-muted-foreground">
                    <i className="fa-solid fa-file-circle-exclamation text-xl mb-2 text-muted-foreground/60" />
                    <p className="font-semibold text-foreground">Nenhum texto extraído</p>
                    <p className="mt-1 text-[11px]">Este arquivo é visual ou não contém texto legível.</p>
                  </div>
                )}

                {/* Tags do Documento */}
                {doc.tags && doc.tags.length > 0 && (
                  <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">
                      Tags e Categorias:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {doc.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer de Ações do Painel Direito */}
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
                    className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition cursor-pointer"
                  >
                    <i className="fa-solid fa-trash text-xs" />
                    <span>Excluir Documento</span>
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer shadow-2xs"
                >
                  <i className="fa-solid fa-link text-xs" />
                  <span>Copiar Link Direto</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
