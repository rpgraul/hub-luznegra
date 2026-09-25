// src/components/vendors/VendorModal.tsx
// Cadastro/edição de Fornecedor ou Colaborador (ilustrador, autor, ...).
// Shell no mesmo padrão de LinkModal (z-50, animate-in, blur no backdrop).

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import LexicalEditor from '@/components/tasks/LexicalEditor'
import ImageLightbox from '@/components/vendors/ImageLightbox'
import {
  MAX_VENDOR_IMAGES,
  removeVendorImage,
  uploadVendorImage,
  validateVendor,
  type CreateVendorInput,
} from '@/lib/api/vendors'
import {
  VENDOR_KIND_COLORS,
  VENDOR_KIND_LABELS,
  VENDOR_KINDS,
  type Json,
  type Vendor,
  type VendorKind,
} from '@/types/database'
import type { SerializedEditorState } from 'lexical'
import { maskPhoneBR } from '@/utils/format'

interface VendorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendorToEdit?: Vendor | null
  onSave: (data: CreateVendorInput & { id?: string }) => Promise<void>
}

interface ImageItem {
  url: string
  key: string
  /** true = upada nesta sessão (cancelar o modal remove o arquivo). */
  isNew: boolean
}

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'
const labelClass = 'mb-1 block font-semibold text-foreground'

export default function VendorModal({
  open,
  onOpenChange,
  vendorToEdit,
  onSave,
}: VendorModalProps) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<VendorKind>('ilustrador')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [links, setLinks] = useState({ link1: '', link2: '', link3: '' })
  // Descrição = campo rico (Lexical); Observação = texto curto, sem formatação.
  // O conteúdo vivo da descrição mora num REF, sem re-render: um setState por
  // tecla re-renderiza o modal inteiro (com thumbs, links, editor) e trava a
  // digitação — foi exatamente o que trava ao clicar em Descrição.
  const descriptionRef = useRef<SerializedEditorState | null>(null)
  // Valor inicial congelado na abertura/edição: é o que o Lexical lê no mount.
  const [descriptionInitial, setDescriptionInitial] = useState<SerializedEditorState | null>(
    null,
  )
  const [note, setNote] = useState('')
  const [pix, setPix] = useState('')
  /** Rede de segurança: avisa antes de descartar o que foi digitado. */
  const dirtyRef = useRef(false)
  const [images, setImages] = useState<ImageItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  // Callback estável: o LexicalEditor é memoizado e só re-renderiza se isto
  // mudar de identidade.
  const handleDescriptionChange = useCallback((json: SerializedEditorState) => {
    dirtyRef.current = true
    descriptionRef.current = json
  }, [])
  const [copiedPix, setCopiedPix] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Chaves das artes já persistidas: removidas do storage ao excluir aqui.
  const originalKeysRef = useRef<string[]>([])

  useEffect(() => {
    if (vendorToEdit) {
      setName(vendorToEdit.name ?? '')
      setKind(vendorToEdit.kind ?? 'ilustrador')
      setPhone(vendorToEdit.phone ?? '')
      setEmail(vendorToEdit.email ?? '')
      setLinks({
        link1: vendorToEdit.link1 ?? '',
        link2: vendorToEdit.link2 ?? '',
        link3: vendorToEdit.link3 ?? '',
      })
      setPix(vendorToEdit.pix ?? '')
      const initialDesc = (vendorToEdit.description as unknown as SerializedEditorState) ?? null
      descriptionRef.current = initialDesc
      setDescriptionInitial(initialDesc)
      setNote(vendorToEdit.note ?? '')
      setImages(
        (vendorToEdit.images ?? []).map((url, i) => ({
          url,
          key: vendorToEdit.image_keys?.[i] ?? url,
          isNew: false,
        })),
      )
      originalKeysRef.current = vendorToEdit.image_keys ?? []
    } else {
      setName('')
      setKind('ilustrador')
      setPhone('')
      setEmail('')
      setLinks({ link1: '', link2: '', link3: '' })
      descriptionRef.current = null
      setDescriptionInitial(null)
      setNote('')
      setPix('')
      setImages([])
      originalKeysRef.current = []
    }
    setError(null)
    setFieldErrors({})
    setUploading(false)
    setCopiedPix(false)
    dirtyRef.current = false
  }, [vendorToEdit, open])

  if (!open) return null

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const room = MAX_VENDOR_IMAGES - images.length
    if (room <= 0) {
      setError(`Máximo de ${MAX_VENDOR_IMAGES} imagens por fornecedor.`)
      return
    }
    setUploading(true)
    dirtyRef.current = true
    setError(null)
    const added: ImageItem[] = []
    for (const file of files.slice(0, room)) {
      try {
        const up = await uploadVendorImage(file)
        added.push({ url: up.url, key: up.key, isNew: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao enviar a imagem.')
      }
    }
    if (added.length > 0) setImages((prev) => [...prev, ...added])
    setUploading(false)
  }

  function handleRemoveImage(index: number) {
    const target = images[index]
    if (!target) return
    dirtyRef.current = true
    setImages((prev) => prev.filter((_, i) => i !== index))
    // Arte upada agora vira lixo se o usuário cancelar: apaga na hora.
    if (target.isNew) void removeVendorImage(target.key)
  }

  function handleCancel() {
    // Nunca perde o que foi digitado sem perguntar.
    if (dirtyRef.current && !window.confirm('Descartar as alterações não salvas?')) {
      return
    }
    // Limpa apenas o que foi upado nesta sessão (nada foi salvo no banco).
    const orphans = images.filter((img) => img.isNew)
    if (orphans.length > 0) {
      for (const img of orphans) void removeVendorImage(img.key)
    }
    onOpenChange(false)
  }

  async function handleCopyPix() {
    if (!pix.trim()) return
    try {
      await navigator.clipboard.writeText(pix.trim())
      setCopiedPix(true)
      setTimeout(() => setCopiedPix(false), 1600)
    } catch {
      setError('Não foi possível copiar a chave PIX.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (uploading) {
      setError('Aguarde o envio das imagens terminar.')
      return
    }
    const errors = validateVendor({
      name,
      email,
      link1: links.link1,
      link2: links.link2,
      link3: links.link3,
    })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    try {
      setLoading(true)
      setError(null)
      await onSave({
        id: vendorToEdit?.id,
        name: name.trim(),
        kind,
        phone: phone.trim() || null,
        email: email.trim() || null,
        link1: links.link1.trim() || null,
        link2: links.link2.trim() || null,
        link3: links.link3.trim() || null,
        description: descriptionRef.current as unknown as Json,
        note: note.trim() || null,
        pix: pix.trim() || null,
        images: images.map((i) => i.url),
        image_keys: images.map((i) => i.key),
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar fornecedor.')
    } finally {
      setLoading(false)
    }
  }

  const kindColor = VENDOR_KIND_COLORS[kind]

  return (
    <>
      {/* Sem `onClick` de fechar: clicar fora NÃO fecha o modal (perde dados
          de um cadastro longo). Só o X e o Cancelar fecham. */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex max-h-[92vh] flex-col">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-3.5">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <i className="fa-solid fa-user-group text-xs" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  {vendorToEdit ? 'Editar Fornecedor' : 'Novo Fornecedor / Colaborador'}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  Contato, links, estilo, artes de exemplo e chave PIX
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              aria-label="Fechar"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/15 p-2.5 text-xs text-destructive">
                <i className="fa-solid fa-triangle-exclamation" />
                <span>{error}</span>
              </div>
            )}

            {/* Nome + Tipo */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Nome <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Marina Alves"
                  value={name}
                  onChange={(e) => {
                    dirtyRef.current = true
                    setName(e.target.value)
                  }}
                  required
                  className={`${inputClass} ${fieldErrors.name ? 'border-destructive' : ''}`}
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-[10px] text-destructive">{fieldErrors.name}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Tipo</label>
                <select
                  value={kind}
                  onChange={(e) => {
                    dirtyRef.current = true
                    setKind(e.target.value as VendorKind)
                  }}
                  className={`${inputClass} cursor-pointer`}
                >
                  {VENDOR_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {VENDOR_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                <div
                  className="mt-1 h-1 w-full rounded-full"
                  style={{ backgroundColor: `${kindColor}55` }}
                />
              </div>
            </div>

            {/* Contato */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Celular</label>
                <div className="relative flex items-center">
                  <i className="fa-solid fa-mobile-screen pointer-events-none absolute left-3 text-xs text-muted-foreground" />
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="(11) 99999-0000"
                    value={phone}
                    onChange={(e) => {
                      dirtyRef.current = true
                      setPhone(maskPhoneBR(e.target.value))
                    }}
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>E-mail</label>
                <div className="relative flex items-center">
                  <i className="fa-solid fa-envelope pointer-events-none absolute left-3 text-xs text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="contato@exemplo.com"
                    value={email}
                    onChange={(e) => {
                      dirtyRef.current = true
                      setEmail(e.target.value)
                    }}
                    className={`${inputClass} pl-8 ${fieldErrors.email ? 'border-destructive' : ''}`}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="mt-1 text-[10px] text-destructive">{fieldErrors.email}</p>
                )}
              </div>
            </div>

            {/* Links */}
            <div>
              <label className={labelClass}>
                <i className="fa-solid fa-link mr-1 text-[10px] text-muted-foreground" />
                Links
              </label>
              <div className="space-y-2">
                {(['link1', 'link2', 'link3'] as const).map((key) => (
                  <div key={key}>
                    <div className="relative flex items-center">
                      <span className="pointer-events-none absolute left-3 text-[10px] font-semibold text-muted-foreground">
                        {key.replace('link', 'Link ')}
                      </span>
                      <i className="fa-solid fa-globe pointer-events-none absolute left-11 text-xs text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="https://instagram.com/...  (opcional)"
                        value={links[key]}
                        onChange={(e) => {
                          dirtyRef.current = true
                          setLinks((prev) => ({ ...prev, [key]: e.target.value }))
                        }}
                        className={`${inputClass} pl-[5.5rem] ${fieldErrors[key] ? 'border-destructive' : ''}`}
                      />
                    </div>
                    {fieldErrors[key] && (
                      <p className="mt-1 text-[10px] text-destructive">{fieldErrors[key]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Descrição (campo rico — guarda o que antes era "Estilo" + "Observação") */}
            <div>
              <label className={labelClass}>
                <i className="fa-regular fa-file-lines mr-1 text-[10px] text-muted-foreground" />
                Descrição
              </label>
              <div className="overflow-hidden rounded-lg border border-border bg-background">
                <LexicalEditor
                  key={`vendor-desc-${vendorToEdit?.id ?? 'new'}-${open ? 'open' : 'closed'}`}
                  namespace="hub-vendor-description"
                  initialValue={descriptionInitial}
                  onChange={handleDescriptionChange}
                  placeholder="Estilo de traço, técnica, prazos, preferências de trabalho..."
                />
              </div>
            </div>

            {/* Observação (curta, texto simples) */}
            <div>
              <label className={labelClass}>
                <i className="fa-solid fa-comment-dots mr-1 text-[10px] text-muted-foreground" />
                Observação
              </label>
              <textarea
                rows={2}
                placeholder="Anotação rápida (sem formatação)."
                value={note}
                onChange={(e) => {
                  dirtyRef.current = true
                  setNote(e.target.value)
                }}
                className="w-full resize-none rounded-md border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {/* Exemplo (artes) */}
            <div>
              <label className={labelClass}>
                <i className="fa-regular fa-image mr-1 text-[10px] text-muted-foreground" />
                Exemplo (artes)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFiles}
              />
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div
                    key={`${img.key}-${i}`}
                    className="group/img relative size-20 overflow-hidden rounded-lg border border-border"
                  >
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      title="Ampliar"
                      className="h-full w-full cursor-zoom-in"
                    >
                      <img src={img.url} alt="" className="h-full w-full object-cover" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(i)}
                      title="Remover imagem"
                      className="absolute right-0.5 top-0.5 flex size-5 cursor-pointer items-center justify-center rounded bg-black/70 text-[10px] text-white opacity-0 transition group-hover/img:opacity-100"
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                ))}

                {images.length < MAX_VENDOR_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[10px] text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {uploading ? (
                      <i className="fa-solid fa-spinner fa-spin text-sm" />
                    ) : (
                      <i className="fa-solid fa-plus text-sm" />
                    )}
                    <span>{uploading ? 'Enviando…' : 'Adicionar'}</span>
                  </button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {images.length}/{MAX_VENDOR_IMAGES} imagens · clique para ampliar
              </p>
            </div>

            {/* PIX */}
            <div>
              <label className={labelClass}>
                <i className="fa-solid fa-qrcode mr-1 text-[10px] text-muted-foreground" />
                Chave PIX
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória"
                  value={pix}
                  onChange={(e) => {
                    dirtyRef.current = true
                    setPix(e.target.value)
                  }}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={handleCopyPix}
                  disabled={!pix.trim()}
                  title="Copiar chave PIX"
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-muted/60 px-3 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <i
                    className={`fa-solid ${copiedPix ? 'fa-check text-emerald-500' : 'fa-copy'}`}
                  />
                  {copiedPix ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/10 px-5 py-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? (
                <i className="fa-solid fa-spinner fa-spin text-xs" />
              ) : (
                <i className="fa-solid fa-check text-xs" />
              )}
              <span>{vendorToEdit ? 'Salvar Alterações' : 'Adicionar Fornecedor'}</span>
            </button>
          </div>
        </form>
      </div>

      </div>

      {/* Fora do overlay: o portal do lightbox ainda propaga o evento pela
          árvore React, então ficar DENTRO do overlay clicável chamava
          `handleCancel` e derrubava o modal junto com o cadastro preenchido. */}
      <ImageLightbox
        images={images.map((i) => i.url)}
        index={lightboxIndex ?? 0}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        title={name || 'Artes'}
      />
    </>
  )
}
