// src/components/links/LinkModal.tsx
// Modal para adicionar ou editar um Link Útil (globais no Hub)

import { useState, useEffect } from 'react'
import type { HubLink } from '@/types/database'

interface LinkModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  linkToEdit?: HubLink | null
  onSave: (data: {
    id?: string
    title: string
    url: string
    description?: string | null
    tags?: string[]
  }) => Promise<void>
}

export default function LinkModal({
  open,
  onOpenChange,
  linkToEdit,
  onSave,
}: LinkModalProps) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (linkToEdit) {
      setTitle(linkToEdit.title)
      setUrl(linkToEdit.url)
      setDescription(linkToEdit.description || '')
      setTags(linkToEdit.tags || [])
    } else {
      setTitle('')
      setUrl('')
      setDescription('')
      setTags([])
    }
    setTagInput('')
    setError(null)
  }, [linkToEdit, open])

  if (!open) return null

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
    if (!title.trim()) {
      setError('O título é obrigatório.')
      return
    }
    if (!url.trim()) {
      setError('A URL é obrigatória.')
      return
    }

    let finalUrl = url.trim()
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`
    }

    try {
      setLoading(true)
      setError(null)
      await onSave({
        id: linkToEdit?.id,
        title: title.trim(),
        url: finalUrl,
        description: description.trim() || null,
        tags,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar link.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                <i className="fa-solid fa-link text-xs" />
              </div>
              <h2 className="text-sm font-bold text-foreground">
                {linkToEdit ? 'Editar Link Útil' : 'Novo Link Útil'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>

          {/* Form Body */}
          <div className="space-y-4 p-5 text-xs">
            {error && (
              <div className="rounded-md bg-destructive/15 p-2.5 text-xs text-destructive border border-destructive/30 flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation" />
                <span>{error}</span>
              </div>
            )}

            {/* Título */}
            <div>
              <label className="mb-1 block font-semibold text-foreground">
                Título <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Google Drive - Artes dos Posts de Financiamento"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {/* URL */}
            <div>
              <label className="mb-1 block font-semibold text-foreground">
                URL / Link <span className="text-destructive">*</span>
              </label>
              <div className="relative flex items-center">
                <i className="fa-solid fa-globe absolute left-3 text-muted-foreground text-xs pointer-events-none" />
                <input
                  type="text"
                  placeholder="https://drive.google.com/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className="mb-1 block font-semibold text-foreground">
                Descrição (opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Pasta contendo as imagens em alta resolução para divulgação no Catarse e redes sociais."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-none rounded-md border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
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
                    placeholder="Adicione uma tag e tecle Enter..."
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
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <i className="fa-solid fa-spinner fa-spin text-xs" />
              ) : (
                <i className="fa-solid fa-check text-xs" />
              )}
              <span>{linkToEdit ? 'Salvar Alterações' : 'Adicionar Link'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
