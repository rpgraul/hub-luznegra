// src/components/vendors/VendorDetailModal.tsx
// Modal somente-leitura com TUDO do fornecedor + botão de editar.
// O card da listagem fica enxuto (nome, tipo, PIX, links); o resto vive aqui.

import { useEffect, useState } from 'react'
import LexicalReadOnly from '@/components/ui/LexicalReadOnly'
import ImageLightbox from '@/components/vendors/ImageLightbox'
import {
  VENDOR_KIND_COLORS,
  VENDOR_KIND_LABELS,
  type Vendor,
} from '@/types/database'

interface VendorDetailModalProps {
  vendor: Vendor | null
  onClose: () => void
  onEdit: (vendor: Vendor) => void
}

function getDomain(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '') + (u.pathname && u.pathname !== '/' ? u.pathname : '')
  } catch {
    return url
  }
}

function getLinkIcon(url: string): string {
  const domain = (() => {
    try {
      return new URL(url).hostname.toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  })()
  if (domain.includes('instagram.com')) return 'fa-brands fa-instagram'
  if (domain.includes('behance.net')) return 'fa-brands fa-behance'
  if (domain.includes('linkedin.com')) return 'fa-brands fa-linkedin'
  if (domain.includes('dribbble.com')) return 'fa-brands fa-dribbble'
  if (domain.includes('github.com')) return 'fa-brands fa-github'
  if (domain.includes('patreon.com') || domain.includes('ko-fi.com'))
    return 'fa-solid fa-mug-hot'
  if (domain.includes('drive.google.com')) return 'fa-brands fa-google-drive'
  if (domain.includes('behance')) return 'fa-brands fa-behance'
  if (domain.includes('youtube.com')) return 'fa-brands fa-youtube'
  if (domain.includes('twitter.com') || domain.includes('x.com')) return 'fa-brands fa-x-twitter'
  return 'fa-solid fa-globe'
}

const LINKS = ['link1', 'link2', 'link3'] as const

function Section({
  icon,
  title,
  children,
  action,
}: {
  icon: string
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="border-t border-border/70 pt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <i className={`fa-solid ${icon} mr-1.5 text-[10px]`} />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export default function VendorDetailModal({
  vendor,
  onClose,
  onEdit,
}: VendorDetailModalProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [copiedPix, setCopiedPix] = useState(false)

  useEffect(() => {
    setLightboxIndex(null)
    setCopiedPix(false)
  }, [vendor?.id])

  if (!vendor) return null

  const kindColor = VENDOR_KIND_COLORS[vendor.kind] ?? '#6B7280'
  const links = LINKS.map((key) => vendor[key]).filter((l): l is string => !!l)
  const images = vendor.images ?? []

  async function handleCopyPix() {
    if (!vendor?.pix) return
    try {
      await navigator.clipboard.writeText(vendor.pix)
      setCopiedPix(true)
      setTimeout(() => setCopiedPix(false), 1600)
    } catch {
      /* clipboard bloqueado: o valor continua visível no campo */
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
        <div
          className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4"
            style={{ boxShadow: `inset 4px 0 0 0 ${kindColor}` }}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-bold text-foreground">{vendor.name}</h2>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: `${kindColor}18`, color: kindColor }}
                >
                  {VENDOR_KIND_LABELS[vendor.kind] ?? vendor.kind}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Cadastrado em {new Date(vendor.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onEdit(vendor)}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/15"
              >
                <i className="fa-solid fa-pen-to-square text-[11px]" />
                Editar
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 text-xs">
            {/* Contato */}
            <Section icon="fa-address-book" title="Contato">
              {vendor.phone || vendor.email ? (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {vendor.phone && (
                    <a
                      href={`tel:${vendor.phone.replace(/\D/g, '')}`}
                      className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-foreground transition hover:border-primary/50"
                    >
                      <i className="fa-solid fa-mobile-screen w-3.5 text-center text-muted-foreground" />
                      <span className="truncate">{vendor.phone}</span>
                    </a>
                  )}
                  {vendor.email && (
                    <a
                      href={`mailto:${vendor.email}`}
                      className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-foreground transition hover:border-primary/50"
                    >
                      <i className="fa-solid fa-envelope w-3.5 text-center text-muted-foreground" />
                      <span className="truncate">{vendor.email}</span>
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Sem contato cadastrado.</p>
              )}
            </Section>

            {/* Links */}
            <Section icon="fa-link" title="Links">
              {links.length > 0 ? (
                <div className="space-y-1.5">
                  {links.map((url, i) => (
                    <a
                      key={`${url}-${i}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={url}
                      className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 transition hover:border-primary/50"
                    >
                      <i className={`${getLinkIcon(url)} w-3.5 text-center text-muted-foreground`} />
                      <span className="flex-1 truncate font-mono text-[11px] text-foreground">
                        {getDomain(url)}
                      </span>
                      <i className="fa-solid fa-arrow-up-right-from-square text-[10px] text-muted-foreground" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum link cadastrado.</p>
              )}
            </Section>

            {/* Descrição */}
            <Section icon="fa-align-left" title="Descrição">
              {vendor.description ? (
                <LexicalReadOnly value={vendor.description} />
              ) : (
                <p className="text-muted-foreground">Sem descrição.</p>
              )}
            </Section>

            {/* Observação */}
            <Section icon="fa-comment-dots" title="Observação">
              {vendor.note ? (
                <p className="whitespace-pre-wrap text-foreground/90">{vendor.note}</p>
              ) : (
                <p className="text-muted-foreground">Sem observação.</p>
              )}
            </Section>

            {/* Artes */}
            <Section
              icon="fa-image"
              title={`Artes de exemplo${images.length > 0 ? ` (${images.length})` : ''}`}
            >
              {images.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {images.map((url, i) => (
                    <button
                      key={`${url}-${i}`}
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      title="Ampliar"
                      className="size-20 cursor-zoom-in overflow-hidden rounded-lg border border-border transition hover:border-primary/60"
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhuma arte enviada.</p>
              )}
            </Section>

            {/* PIX */}
            <Section
              icon="fa-qrcode"
              title="Chave PIX"
              action={
                vendor.pix ? (
                  <button
                    type="button"
                    onClick={handleCopyPix}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 transition hover:bg-emerald-500/20"
                  >
                    <i className={`fa-solid ${copiedPix ? 'fa-check' : 'fa-copy'}`} />
                    {copiedPix ? 'Copiado' : 'Copiar'}
                  </button>
                ) : null
              }
            >
              {vendor.pix ? (
                <p className="break-all rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-2 font-mono text-[11px] text-foreground">
                  {vendor.pix}
                </p>
              ) : (
                <p className="text-muted-foreground">Sem chave PIX cadastrada.</p>
              )}
            </Section>
          </div>
        </div>
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          title={vendor.name}
        />
      )}
    </>
  )
}
