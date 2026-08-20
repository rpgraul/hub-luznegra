// src/components/documents/DocumentUploadModal.tsx
// Modal de upload de documentos com extração de texto em tempo real para a IA (Lorde Camarão)

import { useState, useRef } from 'react'
import type { Project } from '@/types/database'
import {
  extractTextFromFile,
  formatFileSize,
  getFileIconClass,
  type ExtractionResult,
} from '@/lib/extractors'

interface DocumentUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  activeProjectId?: string | null
  onUpload: (data: {
    file: File
    title: string
    tags: string[]
    project_id: string | null
  }) => Promise<void>
}

export default function DocumentUploadModal({
  open,
  onOpenChange,
  projects,
  activeProjectId,
  onUpload,
}: DocumentUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function resetState() {
    setSelectedFile(null)
    setTitle('')
    setTagInput('')
    setTags([])
    setProjectId(activeProjectId || null)
    setIsExtracting(false)
    setExtractionResult(null)
    setIsUploading(false)
    setError(null)
    setIsDragging(false)
  }

  if (!open) return null

  async function handleFileSelected(file: File) {
    setSelectedFile(file)
    setTitle(file.name.replace(/\.[^/.]+$/, ''))
    setError(null)
    setIsExtracting(true)

    try {
      const result = await extractTextFromFile(file)
      setExtractionResult(result)
    } catch (err) {
      console.error('Erro na extração:', err)
      setExtractionResult(null)
    } finally {
      setIsExtracting(false)
    }
  }

  function handleAddTag() {
    const clean = tagInput.trim().replace(/^#/, '').toLowerCase()
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean])
      setTagInput('')
    }
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  function handleKeyDownTag(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddTag()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) {
      setError('Selecione um arquivo para enviar.')
      return
    }
    if (!title.trim()) {
      setError('O título do documento é obrigatório.')
      return
    }

    try {
      setIsUploading(true)
      setError(null)
      await onUpload({
        file: selectedFile,
        title: title.trim(),
        tags,
        project_id: projectId || null,
      })
      onOpenChange(false)
      resetState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no envio do documento.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
      onClick={() => {
        onOpenChange(false)
        resetState()
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                <i className="fa-solid fa-cloud-arrow-up text-xs" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Enviar Novo Documento</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                resetState()
              }}
              aria-label="Fechar"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>

          {/* Form Body */}
          <div className="space-y-4 p-5 text-xs max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="rounded-md bg-destructive/15 p-2.5 text-xs text-destructive border border-destructive/30 flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation" />
                <span>{error}</span>
              </div>
            )}

            {/* Drag & Drop File Area */}
            {!selectedFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleFileSelected(file)
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
                  isDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelected(file)
                  }}
                />
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 mb-3">
                  <i className="fa-solid fa-file-arrow-up text-lg" />
                </div>
                <p className="text-xs font-semibold text-foreground">
                  Clique para selecionar ou arraste o arquivo aqui
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Suporta PDF, DOCX (Word), XLSX/CSV (Excel), TXT, MD, Imagens e mais.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-base border border-border/80">
                    <i className={getFileIconClass(extractionResult?.fileType || selectedFile.name.split('.').pop() || '')} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatFileSize(selectedFile.size)} • {selectedFile.type || 'Arquivo'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null)
                    setExtractionResult(null)
                  }}
                  className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                  title="Trocar arquivo"
                >
                  <i className="fa-solid fa-xmark text-xs" />
                </button>
              </div>
            )}

            {/* Extração de Texto Preview */}
            {isExtracting && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 p-2.5 text-xs text-primary font-medium">
                <i className="fa-solid fa-spinner fa-spin" />
                <span>Extraindo texto e indexando para o Lorde Camarão...</span>
              </div>
            )}

            {extractionResult && !isExtracting && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <i className="fa-solid fa-wand-magic-sparkles text-primary text-xs" />
                    Indexação para a IA:
                  </span>
                  <span className="text-muted-foreground">
                    {extractionResult.charCount.toLocaleString('pt-BR')} caracteres lidos
                    {extractionResult.truncated && ' (resumido)'}
                  </span>
                </div>
                <div className="max-h-24 overflow-y-auto rounded bg-background p-2 font-mono text-[11px] text-muted-foreground border border-border/60 select-text">
                  {extractionResult.text || '(Nenhum texto legível encontrado neste arquivo)'}
                </div>
              </div>
            )}

            {/* Título do Documento */}
            <div>
              <label className="mb-1 block font-semibold text-foreground">
                Título do Documento <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Contrato de Cessão de Direitos Autorais 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {/* Projeto Vinculado */}
            <div>
              <label className="mb-1 block font-semibold text-foreground">
                Projeto Vinculado
              </label>
              <select
                value={projectId || ''}
                onChange={(e) => setProjectId(e.target.value || null)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">(Geral / Todos os Projetos)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1 block font-semibold text-foreground">
                Tags / Categorias
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <i className="fa-solid fa-hashtag absolute left-3 top-2 text-muted-foreground text-xs pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Adicione tags (ex: contratos, financeiro, catarse) e tecle Enter..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleKeyDownTag}
                    className="w-full rounded-md border border-border bg-background pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="rounded-md border border-border bg-muted/60 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition cursor-pointer"
                >
                  Adicionar
                </button>
              </div>

              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-destructive text-primary/70 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-xmark text-[10px]" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3 bg-muted/10">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                resetState()
              }}
              disabled={isUploading}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isUploading || isExtracting || !selectedFile}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <i className="fa-solid fa-spinner fa-spin text-xs" />
              ) : (
                <i className="fa-solid fa-cloud-arrow-up text-xs" />
              )}
              <span>{isUploading ? 'Enviando...' : 'Salvar Documento'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
