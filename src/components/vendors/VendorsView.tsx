// src/components/vendors/VendorsView.tsx
// Seção "Fornecedores / Colaboradores" (ilustradores, autores, parceiros).
// Mesmo esqueleto de LinksView: header, busca, filtros em pill, grid de cards.

import { useMemo, useState } from 'react'
import VendorModal from '@/components/vendors/VendorModal'
import VendorDetailModal from '@/components/vendors/VendorDetailModal'
import ImageLightbox from '@/components/vendors/ImageLightbox'
import { useVendors } from '@/hooks/useVendors'
import { extractLexicalText } from '@/utils/lexical'
import {
  VENDOR_KIND_COLORS,
  VENDOR_KIND_LABELS,
  type Vendor,
  type VendorKind,
} from '@/types/database'
import type { CreateVendorInput } from '@/lib/api/vendors'

type SortMode = 'name' | 'recent'

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function getLinkIcon(url: string): string {
  const domain = getDomainFromUrl(url).toLowerCase()
  if (domain.includes('instagram.com')) return 'fa-brands fa-instagram'
  if (domain.includes('behance.net')) return 'fa-brands fa-behance'
  if (domain.includes('linkedin.com')) return 'fa-brands fa-linkedin'
  if (domain.includes('dribbble.com')) return 'fa-brands fa-dribbble'
  if (domain.includes('github.com')) return 'fa-brands fa-github'
  if (domain.includes('patreon.com') || domain.includes('ko-fi.com'))
    return 'fa-solid fa-mug-hot'
  if (domain.includes('drive.google.com')) return 'fa-brands fa-google-drive'
  return 'fa-arrow-up-right-from-square text-primary'
}

const MAX_THUMBS = 3

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Rótulo de bloco dentro do card (ex.: CONTATO, LINKS, PIX). */
function BlockLabel({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
      <i className={`fa-solid ${icon} text-[9px]`} />
      {children}
    </p>
  )
}

/** Linha de dado: ícone fixo + conteúdo, com o mesmo alinhamento em todo o card. */
function InfoRow({
  icon,
  children,
  muted = false,
}: {
  /** Classe completa do ícone (ex.: 'fa-brands fa-instagram'). */
  icon: string
  children: React.ReactNode
  muted?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
        muted ? 'bg-transparent' : 'border border-border/60 bg-muted/25'
      }`}
    >
      <i
        className={`${icon.startsWith('fa-brands') ? '' : 'fa-solid '} ${icon} w-3.5 shrink-0 text-center text-[11px] ${
          muted ? 'text-muted-foreground/50' : 'text-muted-foreground'
        }`}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export default function VendorsView() {
  const { vendors, isLoading, createVendor, updateVendor, deleteVendor, isDeleting } =
    useVendors()

  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<VendorKind | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [modalOpen, setModalOpen] = useState(false)
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const kindCounts = useMemo(() => {
    const counts: Partial<Record<VendorKind, number>> = {}
    for (const v of vendors) counts[v.kind] = (counts[v.kind] ?? 0) + 1
    return counts
  }, [vendors])

  const filteredVendors = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = vendors

    if (kindFilter) {
      list = list.filter((v) => v.kind === kindFilter)
    }

    if (term) {
      list = list.filter((v) => {
        const haystack = [
          v.name,
          v.phone,
          v.email,
          v.note,
          v.pix,
          v.link1,
          v.link2,
          v.link3,
          VENDOR_KIND_LABELS[v.kind] ?? v.kind,
          extractLexicalText(v.description),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(term)
      })
    }

    return [...list].sort((a, b) =>
      sortMode === 'name'
        ? a.name.localeCompare(b.name, 'pt-BR')
        : b.created_at.localeCompare(a.created_at),
    )
  }, [vendors, search, kindFilter, sortMode])

  function openNew() {
    setEditingVendor(null)
    setModalOpen(true)
  }

  function openEdit(vendor: Vendor) {
    setDetailVendor(null)
    setEditingVendor(vendor)
    setModalOpen(true)
  }

  async function handleSave(data: CreateVendorInput & { id?: string }) {
    if (data.id) {
      const { id, ...rest } = data
      await updateVendor({ id, ...rest })
    } else {
      await createVendor(data)
    }
  }

  async function handleDelete(vendor: Vendor) {
    if (!confirm(`Excluir "${vendor.name}"? As artes de exemplo também serão apagadas.`)) {
      return
    }
    await deleteVendor({ id: vendor.id, imageKeys: vendor.image_keys ?? [] })
    setLightbox(null)
  }

  async function handleCopyPix(vendor: Vendor) {
    if (!vendor.pix) return
    try {
      await navigator.clipboard.writeText(vendor.pix)
      setCopiedId(vendor.id)
      setTimeout(() => setCopiedId(null), 1600)
    } catch {
      /* clipboard bloqueado: silencioso, o campo continua visível no card */
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/40 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <i className="fa-solid fa-user-group text-sm" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">
                Fornecedores / Colaboradores
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Ilustradores, autores e parceiros — com contatos, links, estilo e chave PIX
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
          >
            <i className="fa-solid fa-plus text-xs" />
            <span>Novo Fornecedor</span>
          </button>
        </div>

        {/* Busca + filtros */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-2.5 text-[11px] text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome, contato, estilo, observação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-2.5 flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition hover:text-foreground"
              >
                <i className="fa-solid fa-xmark text-[10px]" />
              </button>
            )}
          </div>

          {/* Filtro por tipo */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Tipo:</span>
            <button
              type="button"
              onClick={() => setKindFilter(null)}
              className={`h-7 cursor-pointer rounded-full border px-2.5 text-[11px] font-semibold transition ${
                kindFilter === null
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Todos ({vendors.length})
            </button>
            {(Object.keys(VENDOR_KIND_LABELS) as VendorKind[])
              .filter((k) => (kindCounts[k] ?? 0) > 0 || k === kindFilter)
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(kindFilter === k ? null : k)}
                  className={`h-7 cursor-pointer rounded-full border px-2.5 text-[11px] font-semibold transition ${
                    kindFilter === k ? 'text-white' : 'hover:opacity-80'
                  }`}
                  style={
                    kindFilter === k
                      ? { backgroundColor: VENDOR_KIND_COLORS[k], borderColor: VENDOR_KIND_COLORS[k] }
                      : {
                          color: VENDOR_KIND_COLORS[k],
                          borderColor: `${VENDOR_KIND_COLORS[k]}55`,
                          backgroundColor: `${VENDOR_KIND_COLORS[k]}12`,
                        }
                  }
                >
                  {VENDOR_KIND_LABELS[k]} ({kindCounts[k] ?? 0})
                </button>
              ))}
          </div>

          {/* Ordenação */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background/80 p-0.5">
            {(
              [
                { id: 'name' as const, label: 'A–Z', icon: 'fa-arrow-down-a-z' },
                { id: 'recent' as const, label: 'Recentes', icon: 'fa-clock' },
              ]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                title={
                  opt.id === 'name' ? 'Ordenar por nome' : 'Ordenar por data de cadastro'
                }
                onClick={() => setSortMode(opt.id)}
                className={`flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[10px] font-medium transition ${
                  sortMode === opt.id
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <i className={`fa-solid ${opt.icon} text-[10px]`} />
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
            <i className="fa-solid fa-spinner fa-spin mr-2 text-primary" />
            Carregando fornecedores...
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <i className="fa-solid fa-user-slash text-lg" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Nenhum fornecedor encontrado
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {search || kindFilter
                ? 'Tente outros termos de busca ou remova o filtro de tipo.'
                : 'Cadastre ilustradores, autores e parceiros com contatos, links, estilo e chave PIX.'}
            </p>
            {!search && !kindFilter && (
              <button
                type="button"
                onClick={openNew}
                className="mt-4 flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
              >
                <i className="fa-solid fa-plus text-xs" />
                <span>Adicionar Primeiro Fornecedor</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredVendors.map((vendor) => {
              const kindColor = VENDOR_KIND_COLORS[vendor.kind] ?? '#6B7280'
              const links = [vendor.link1, vendor.link2, vendor.link3].filter(
                (l): l is string => !!l,
              )
              const images = vendor.images ?? []
              const description = extractLexicalText(vendor.description)

              return (
                <div
                  key={vendor.id}
                  onClick={() => setDetailVendor(vendor)}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs transition hover:border-primary/50 hover:shadow-md"
                >
                  {/* Faixa com a cor do tipo */}
                  <span className="h-1 w-full shrink-0" style={{ backgroundColor: kindColor }} />

                  <div className="flex flex-1 flex-col gap-3.5 p-4">
                    {/* Nome + tipo + ações */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-foreground group-hover:text-primary transition">
                          {vendor.name}
                        </h3>
                        <span
                          className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: `${kindColor}18`, color: kindColor }}
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: kindColor }}
                          />
                          {VENDOR_KIND_LABELS[vendor.kind] ?? vendor.kind}
                        </span>
                      </div>
                      <div
                        className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => openEdit(vendor)}
                          title="Editar"
                          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        >
                          <i className="fa-solid fa-pen-to-square text-xs" />
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => void handleDelete(vendor)}
                          title="Excluir"
                          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                        >
                          <i className="fa-solid fa-trash text-xs" />
                        </button>
                      </div>
                    </div>

                    {/* Contato */}
                    <div>
                      <BlockLabel icon="fa-address-book">Contato</BlockLabel>
                      <div className="space-y-1">
                        {vendor.phone ? (
                          <InfoRow icon="fa-mobile-screen">
                            <a
                              href={`tel:${vendor.phone.replace(/\D/g, '')}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate text-[11px] text-foreground transition hover:text-primary"
                            >
                              {vendor.phone}
                            </a>
                          </InfoRow>
                        ) : (
                          <InfoRow icon="fa-mobile-screen" muted>
                            <span className="text-[11px] text-muted-foreground/60">
                              Sem celular
                            </span>
                          </InfoRow>
                        )}
                        {vendor.email ? (
                          <InfoRow icon="fa-envelope">
                            <a
                              href={`mailto:${vendor.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate text-[11px] text-foreground transition hover:text-primary"
                            >
                              {vendor.email}
                            </a>
                          </InfoRow>
                        ) : (
                          <InfoRow icon="fa-envelope" muted>
                            <span className="text-[11px] text-muted-foreground/60">
                              Sem e-mail
                            </span>
                          </InfoRow>
                        )}
                      </div>
                    </div>

                    {/* Links (domínio legível, nunca só o ícone) */}
                    <div>
                      <BlockLabel icon="fa-link">
                        Links{links.length > 0 ? ` (${links.length})` : ''}
                      </BlockLabel>
                      {links.length > 0 ? (
                        <div className="space-y-1">
                          {links.map((url, i) => (
                            <InfoRow key={`${url}-${i}`} icon={getLinkIcon(url)}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={url}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5"
                              >
                                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/85 transition group-hover:text-primary">
                                  {getDomainFromUrl(url)}
                                </span>
                                <i className="fa-solid fa-arrow-up-right-from-square shrink-0 text-[9px] text-muted-foreground" />
                              </a>
                            </InfoRow>
                          ))}
                        </div>
                      ) : (
                        <InfoRow icon="fa-link" muted>
                          <span className="text-[11px] text-muted-foreground/60">
                            Sem links
                          </span>
                        </InfoRow>
                      )}
                    </div>

                    {/* PIX: o valor à vista */}
                    <div>
                      <BlockLabel icon="fa-qrcode">PIX</BlockLabel>
                      {vendor.pix ? (
                        <div className="flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/8 px-2 py-1.5">
                          <span
                            title={vendor.pix}
                            className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                          >
                            {vendor.pix}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleCopyPix(vendor)
                            }}
                            title="Copiar chave PIX"
                            className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 transition hover:bg-emerald-500/20"
                          >
                            <i
                              className={`fa-solid ${copiedId === vendor.id ? 'fa-check' : 'fa-copy'}`}
                            />
                            {copiedId === vendor.id ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                      ) : (
                        <p className="px-2 py-1 text-[11px] text-muted-foreground/60">
                          Sem chave PIX
                        </p>
                      )}
                    </div>

                    {/* Artes (miniatura compacta; o resto fica no modal) */}
                    {images.length > 0 && (
                      <div>
                        <BlockLabel icon="fa-image">
                          Artes{images.length > 1 ? ` (${images.length})` : ''}
                        </BlockLabel>
                        <div className="flex items-center gap-1.5">
                          {images.slice(0, MAX_THUMBS).map((url, i) => (
                            <button
                              key={`${url}-${i}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setLightbox({ images, index: i })
                              }}
                              title="Ampliar"
                              className="size-10 cursor-zoom-in overflow-hidden rounded-md border border-border transition hover:border-primary/60"
                            >
                              <img src={url} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                          {images.length > MAX_THUMBS && (
                            <span className="flex size-10 items-center justify-center rounded-md border border-border bg-muted text-[10px] font-semibold text-muted-foreground">
                              +{images.length - MAX_THUMBS}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rodapé: acesso aos detalhes */}
                  <div className="mt-auto border-t border-border/70 bg-muted/20 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/70">
                        {description ? truncate(description, 48) : 'Sem descrição'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setDetailVendor(vendor)}
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold text-primary transition hover:bg-primary/10"
                      >
                        Ver detalhes
                        <i className="fa-solid fa-chevron-right text-[9px]" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <VendorDetailModal
        vendor={detailVendor}
        onClose={() => setDetailVendor(null)}
        onEdit={openEdit}
      />

      <VendorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        vendorToEdit={editingVendor}
        onSave={handleSave}
      />

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setLightbox(null)}
          title={
            filteredVendors.find((v) => (v.images ?? []).includes(lightbox.images[0]))?.name ??
            'Artes'
          }
        />
      )}
    </div>
  )
}
