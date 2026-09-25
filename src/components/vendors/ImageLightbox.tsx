import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ImageLightboxProps {
  /** URLs na ordem em que aparecem na galeria. */
  images: string[]
  /** Índice inicial. */
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  /** Nome exibido no cabeçalho (ex.: nome do fornecedor). */
  title?: string
}

/**
 * Lightbox de imagens (não existia um no projeto — mesmo esqueleto de overlay
 * do DocumentDetailDrawer, porém navegável: setas, miniaturas, Esc).
 */
export default function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  title,
}: ImageLightboxProps) {
  const [loaded, setLoaded] = useState(false)
  const total = images.length
  const safeIndex = total === 0 ? 0 : Math.min(Math.max(index, 0), total - 1)

  const go = useCallback(
    (delta: number) => {
      if (total === 0) return
      onIndexChange((safeIndex + delta + total) % total)
      setLoaded(false)
    },
    [onIndexChange, safeIndex, total],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (total === 0) return null
  const current = images[safeIndex]

  return createPortal(
    <div
      // `stopPropagation` defensivo: o portal fica no `document.body`, mas o
      // React ainda sobe o evento pela árvore — sem isto, um clique na arte
      // fecha o modal que está por trás.
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[80] flex flex-col bg-black/90 backdrop-blur-sm animate-in fade-in"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-white/60">
            {safeIndex + 1} de {total}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar (Esc)"
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Imagem */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2"
        onClick={onClose}
      >
        {total > 1 && (
          <button
            type="button"
            aria-label="Imagem anterior"
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
            className="absolute left-2 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
          >
            <i className="fa-solid fa-chevron-left" />
          </button>
        )}

        {!loaded && (
          <i className="fa-solid fa-spinner fa-spin absolute text-2xl text-white/50" />
        )}
        <img
          key={current}
          src={current}
          alt={title ? `${title} — imagem ${safeIndex + 1}` : `Imagem ${safeIndex + 1}`}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          onClick={(e) => e.stopPropagation()}
          className={`max-h-full max-w-full select-none object-contain transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />

        {total > 1 && (
          <button
            type="button"
            aria-label="Próxima imagem"
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            className="absolute right-2 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
          >
            <i className="fa-solid fa-chevron-right" />
          </button>
        )}
      </div>

      {/* Miniaturas */}
      {total > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-2 overflow-x-auto px-4 py-3">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => {
                onIndexChange(i)
                setLoaded(false)
              }}
              title={`Imagem ${i + 1}`}
              className={`size-12 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition ${
                i === safeIndex ? 'border-white' : 'border-transparent opacity-55 hover:opacity-90'
              }`}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
