// src/components/links/LinksView.tsx
// Visualização principal de Links Úteis com busca, filtros por tags e projetos, abertura em nova aba e atalhos

import { useState, useMemo } from 'react'
import { toast } from '@heroui/react'
import { useLinks } from '@/hooks/useLinks'
import type { HubLink, Project } from '@/types/database'
import LinkModal from './LinkModal'

interface LinksViewProps {
  projects: Project[]
  activeProjectId: string | null
  onProjectChange?: (projectId: string | null) => void
}

export default function LinksView({
  projects,
  activeProjectId,
  onProjectChange,
}: LinksViewProps) {
  const { links, isLoading, createLink, updateLink, deleteLink } = useLinks(activeProjectId)
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<HubLink | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Coleta todas as tags únicas presentes nos links
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    links.forEach((l) => {
      ;(l.tags || []).forEach((t) => tagSet.add(t))
    })
    return Array.from(tagSet).sort()
  }, [links])

  // Filtra links por busca de texto e tag selecionada
  const filteredLinks = useMemo(() => {
    return links.filter((l) => {
      const q = search.toLowerCase().trim()
      const matchSearch =
        !q ||
        l.title.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q)) ||
        l.url.toLowerCase().includes(q) ||
        (l.tags || []).some((t) => t.toLowerCase().includes(q))

      const matchTag = !selectedTag || (l.tags || []).includes(selectedTag)

      return matchSearch && matchTag
    })
  }, [links, search, selectedTag])

  function getProject(projectId: string | null) {
    if (!projectId) return null
    return projects.find((p) => p.id === projectId) || null
  }

  function getDomainFromUrl(url: string) {
    try {
      const parsed = new URL(url)
      return parsed.hostname.replace(/^www\./, '')
    } catch {
      return url
    }
  }

  function getLinkIcon(url: string) {
    const lower = url.toLowerCase()
    if (lower.includes('drive.google.com') || lower.includes('docs.google.com')) {
      return 'fa-brands fa-google-drive text-amber-500'
    }
    if (lower.includes('dropbox.com')) {
      return 'fa-brands fa-dropbox text-blue-500'
    }
    if (lower.includes('figma.com')) {
      return 'fa-brands fa-figma text-purple-500'
    }
    if (lower.includes('github.com')) {
      return 'fa-brands fa-github text-foreground'
    }
    if (lower.includes('catarse.me')) {
      return 'fa-solid fa-bullhorn text-emerald-500'
    }
    if (lower.includes('notion.so') || lower.includes('notion.site')) {
      return 'fa-solid fa-book-bookmark text-foreground'
    }
    return 'fa-solid fa-arrow-up-right-from-square text-primary'
  }

  async function handleCopyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('URL copiada para a área de transferência!')
    } catch {
      toast.danger('Não foi possível copiar a URL.')
    }
  }

  async function handleCopyShortcut(link: HubLink) {
    const shortcut = `#link:${link.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    try {
      await navigator.clipboard.writeText(shortcut)
      toast.success(`Atalho ${shortcut} copiado!`)
    } catch {
      toast.danger('Não foi possível copiar o atalho.')
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir este link?')) {
      setDeletingId(id)
      try {
        await deleteLink(id)
      } finally {
        setDeletingId(null)
      }
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-3 border-b border-border bg-card/40 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <i className="fa-solid fa-link text-sm" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">Links Úteis</h1>
              <p className="text-[11px] text-muted-foreground">
                Central de acessos rápidos, pastas do Drive, artes e referências da equipe.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Seletor de Projeto */}
            <select
              value={activeProjectId || ''}
              onChange={(e) => onProjectChange?.(e.target.value || null)}
              className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Todos os Projetos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Botão Novo Link */}
            <button
              type="button"
              onClick={() => {
                setEditingLink(null)
                setModalOpen(true)
              }}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition cursor-pointer"
            >
              <i className="fa-solid fa-plus text-xs" />
              <span>Novo Link</span>
            </button>
          </div>
        </div>

        {/* Barra de Busca e Filtro de Tags */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-muted-foreground text-xs pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por título, descrição, tags ou URL..."
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

          {/* Tags Pills */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-full sm:max-w-md">
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition cursor-pointer ${
                  selectedTag === null
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Todas as tags
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition cursor-pointer ${
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
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
            <i className="fa-solid fa-spinner fa-spin mr-2 text-primary" />
            Carregando links...
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <i className="fa-solid fa-link-slash text-lg" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Nenhum link encontrado</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {search || selectedTag
                ? 'Tente alterar os termos de busca ou remover o filtro de tags.'
                : 'Cadastre links importantes para a sua equipe, como pastas do Google Drive, campanhas ou referências.'}
            </p>
            {!search && !selectedTag && (
              <button
                type="button"
                onClick={() => {
                  setEditingLink(null)
                  setModalOpen(true)
                }}
                className="mt-4 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition cursor-pointer"
              >
                <i className="fa-solid fa-plus text-xs" />
                <span>Adicionar Primeiro Link</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredLinks.map((link) => {
              const project = getProject(link.project_id)
              const domain = getDomainFromUrl(link.url)
              const iconClass = getLinkIcon(link.url)

              return (
                <div
                  key={link.id}
                  className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 shadow-xs transition hover:border-primary/40 hover:shadow-md"
                >
                  {/* Top: Icon + Title + Open Link */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted border border-border/70 text-xs">
                          <i className={iconClass} />
                        </div>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir em nova aba"
                          className="truncate text-xs font-bold text-foreground hover:text-primary transition hover:underline"
                        >
                          {link.title}
                        </a>
                      </div>

                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir link em nova aba"
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
                      >
                        <i className="fa-solid fa-arrow-up-right-from-square text-[11px]" />
                      </a>
                    </div>

                    {/* Domain & Project Pill */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="truncate max-w-[150px] font-mono text-muted-foreground/80">
                        {domain}
                      </span>

                      {project && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.2 font-medium"
                          style={{
                            backgroundColor: `${project.color || '#7b68ee'}18`,
                            color: project.color || '#7b68ee',
                          }}
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: project.color || '#7b68ee' }}
                          />
                          {project.name}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {link.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/90">
                        {link.description}
                      </p>
                    )}

                    {/* Tags */}
                    {link.tags && link.tags.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {link.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setSelectedTag(tag)}
                            className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-primary/15 hover:text-primary transition cursor-pointer"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2.5 text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(link.url)}
                        title="Copiar URL"
                        className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
                      >
                        <i className="fa-solid fa-copy text-[10px]" />
                        <span>Copiar URL</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyShortcut(link)}
                        title="Copiar atalho (#link:...)"
                        className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
                      >
                        <i className="fa-solid fa-hashtag text-[10px]" />
                        <span>Atalho</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLink(link)
                          setModalOpen(true)
                        }}
                        title="Editar link"
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
                      >
                        <i className="fa-solid fa-pen-to-square text-[11px]" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(link.id)}
                        disabled={deletingId === link.id}
                        title="Excluir link"
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition cursor-pointer"
                      >
                        {deletingId === link.id ? (
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

      {/* Modal de Criação / Edição */}
      <LinkModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        linkToEdit={editingLink}
        projects={projects}
        activeProjectId={activeProjectId}
        onSave={async (data) => {
          if (data.id) {
            await updateLink({
              id: data.id,
              title: data.title,
              url: data.url,
              description: data.description,
              tags: data.tags,
              project_id: data.project_id,
            })
          } else {
            await createLink({
              title: data.title,
              url: data.url,
              description: data.description,
              tags: data.tags,
              project_id: data.project_id,
            })
          }
        }}
      />
    </div>
  )
}
