// src/components/documents/DocumentsView.tsx
// Visualização principal da Central de Documentos (Cloudflare R2 + IA Lorde Camarão)

import { useState, useMemo } from 'react'
import { toast } from '@heroui/react'
import { useDocuments } from '@/hooks/useDocuments'
import type { HubDocument } from '@/types/database'
import { formatFileSize, getFileIconClass } from '@/lib/extractors'
import DocumentUploadModal from './DocumentUploadModal'
import DocumentDetailDrawer from './DocumentDetailDrawer'

interface DocumentsViewProps {
  // Central de Documentos global do Hub
}

type FileTypeFilter = 'all' | 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'other'

export default function DocumentsView({}: DocumentsViewProps = {}) {
  const { documents, isLoading, uploadDocument, deleteDocument } = useDocuments()
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<HubDocument | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Coleta todas as tags presentes nos documentos
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    documents.forEach((d) => {
      ;(d.tags || []).forEach((t) => tagSet.add(t))
    })
    return Array.from(tagSet).sort()
  }, [documents])

  // Filtra documentos por busca textual, tipo de arquivo e tags
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const q = search.toLowerCase().trim()

      const matchSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        doc.file_name.toLowerCase().includes(q) ||
        (doc.extracted_text && doc.extracted_text.toLowerCase().includes(q)) ||
        (doc.tags || []).some((t) => t.toLowerCase().includes(q))

      const matchType =
        typeFilter === 'all' ||
        (typeFilter === 'pdf' && doc.file_type === 'pdf') ||
        (typeFilter === 'docx' && (doc.file_type === 'docx' || doc.file_type === 'doc')) ||
        (typeFilter === 'xlsx' && (doc.file_type === 'xlsx' || doc.file_type === 'xls')) ||
        (typeFilter === 'csv' && doc.file_type === 'csv') ||
        (typeFilter === 'txt' && (doc.file_type === 'txt' || doc.file_type === 'md')) ||
        (typeFilter === 'other' && !['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md'].includes(doc.file_type))

      const matchTag = !selectedTag || (doc.tags || []).includes(selectedTag)

      return matchSearch && matchType && matchTag
    })
  }, [documents, search, typeFilter, selectedTag])



  async function handleCopyShortcut(doc: HubDocument) {
    const shortcut = `#doc:${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    try {
      await navigator.clipboard.writeText(shortcut)
      toast.success(`Atalho ${shortcut} copiado!`)
    } catch {
      toast.danger('Erro ao copiar atalho.')
    }
  }

  async function handleDelete(doc: HubDocument) {
    if (confirm(`Deseja realmente excluir o documento "${doc.title}"?`)) {
      setDeletingId(doc.id)
      try {
        await deleteDocument(doc)
        if (selectedDoc?.id === doc.id) {
          setDrawerOpen(false)
          setSelectedDoc(null)
        }
      } finally {
        setDeletingId(null)
      }
    }
  }

  function handleOpenDetails(doc: HubDocument) {
    setSelectedDoc(doc)
    setDrawerOpen(true)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-3 border-b border-border bg-card/40 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <i className="fa-solid fa-folder-open text-sm" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">Central de Documentos</h1>
              <p className="text-[11px] text-muted-foreground">
                Arquivos da equipe (PDF, Word, Excel, Texto) indexados automaticamente para o Lorde Camarão.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão Enviar Documento */}
            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition cursor-pointer"
            >
              <i className="fa-solid fa-cloud-arrow-up text-xs" />
              <span>Enviar Documento</span>
            </button>
          </div>
        </div>

        {/* Busca e Filtros de Tipo */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-muted-foreground text-xs pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por título, nome do arquivo ou conteúdo dentro do texto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground text-xs cursor-pointer"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>

          {/* Filtros rápidos de extensão */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('pdf')}
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer ${
                typeFilter === 'pdf'
                  ? 'bg-red-500 text-white font-semibold'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <i className="fa-solid fa-file-pdf text-[10px]" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('docx')}
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer ${
                typeFilter === 'docx'
                  ? 'bg-blue-500 text-white font-semibold'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <i className="fa-solid fa-file-word text-[10px]" />
              <span>Word</span>
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('xlsx')}
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer ${
                typeFilter === 'xlsx'
                  ? 'bg-emerald-500 text-white font-semibold'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <i className="fa-solid fa-file-excel text-[10px]" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('txt')}
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer ${
                typeFilter === 'txt'
                  ? 'bg-amber-500 text-white font-semibold'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <i className="fa-solid fa-file-lines text-[10px]" />
              <span>Texto</span>
            </button>
          </div>
        </div>

        {/* Tags Filtro */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <span className="text-[10px] uppercase font-bold text-muted-foreground mr-1 shrink-0">
              Tags:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              className={`shrink-0 rounded-full px-2 py-0.2 text-[10px] font-medium transition cursor-pointer ${
                selectedTag === null
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Todas
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`shrink-0 rounded-full px-2 py-0.2 text-[10px] font-medium transition cursor-pointer ${
                  selectedTag === tag
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid de Documentos */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
            <i className="fa-solid fa-spinner fa-spin mr-2 text-primary" />
            Carregando documentos...
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <i className="fa-solid fa-folder-open text-lg" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Nenhum documento encontrado</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {search || selectedTag || typeFilter !== 'all'
                ? 'Nenhum documento corresponde aos filtros aplicados.'
                : 'Envie PDFs, planilhas, contratos ou documentos para que a equipe e o Lorde Camarão possam consultá-los.'}
            </p>
            {!search && !selectedTag && typeFilter === 'all' && (
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="mt-4 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition cursor-pointer"
              >
                <i className="fa-solid fa-cloud-arrow-up text-xs" />
                <span>Enviar Primeiro Documento</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredDocuments.map((doc) => {
              const iconClass = getFileIconClass(doc.file_type)

              return (
                <div
                  key={doc.id}
                  onClick={() => handleOpenDetails(doc)}
                  className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 shadow-xs transition hover:border-primary/40 hover:shadow-md cursor-pointer"
                >
                  {/* Top: Icon + Title + Size */}
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted border border-border/80 text-base">
                        <i className={iconClass} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-xs font-bold text-foreground group-hover:text-primary transition">
                          {doc.title}
                        </h3>
                        <p className="truncate text-[10px] text-muted-foreground font-mono">
                          {doc.file_name} • {formatFileSize(doc.file_size)}
                        </p>
                      </div>
                    </div>

                    {/* Extracted Text Snippet */}
                    {doc.extracted_text && (
                      <p className="mt-2 line-clamp-2 font-mono text-[10px] text-muted-foreground bg-muted/30 p-1.5 rounded border border-border/40">
                        {doc.extracted_text.slice(0, 150)}...
                      </p>
                    )}

                    {/* Tags */}
                    {doc.tags && doc.tags.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {doc.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div
                    className="mt-3 flex items-center justify-between border-t border-border/70 pt-2.5 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      <a
                        href={doc.file_url}
                        download={doc.file_name}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Baixar arquivo"
                        className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
                      >
                        <i className="fa-solid fa-download text-[10px]" />
                        <span>Baixar</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => handleCopyShortcut(doc)}
                        title="Copiar atalho (#doc:...)"
                        className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
                      >
                        <i className="fa-solid fa-hashtag text-[10px]" />
                        <span>Atalho</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenDetails(doc)}
                        title="Ver detalhes e texto extraído"
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
                      >
                        <i className="fa-solid fa-eye text-[11px]" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id}
                        title="Excluir documento"
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition cursor-pointer"
                      >
                        {deletingId === doc.id ? (
                          <i className="fa-solid fa-spinner fa-spin text-[11px]" />
                        ) : (
                          <i className="fa-solid fa-trash text-[11px]" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de Upload */}
      <DocumentUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUpload={async (data) => {
          await uploadDocument({
            file: data.file,
            title: data.title,
            tags: data.tags,
          })
        }}
      />

      {/* Gaveta de Detalhes */}
      <DocumentDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        document={selectedDoc}
        onDelete={handleDelete}
      />
    </div>
  )
}
