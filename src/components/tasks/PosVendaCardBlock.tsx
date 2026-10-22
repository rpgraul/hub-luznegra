import { useState } from 'react'
import { toast } from '@heroui/react'
import {
  POS_VENDA_CATEGORIA_META,
  POS_VENDA_URGENCIA_META,
  STATUS_CORREIOS_OPTIONS,
  isPosVendaTask,
} from '@/utils/posVenda'
import type { StatusCorreios, Task } from '@/types/database'

interface PosVendaCardBlockProps {
  task: Task
  onUpdateStatus?: (status: StatusCorreios) => void
  compact?: boolean
}

export default function PosVendaCardBlock({
  task,
  onUpdateStatus,
  compact = false,
}: PosVendaCardBlockProps) {
  const [copiedField, setCopiedField] = useState<'rastreio' | 'pedido' | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  if (!isPosVendaTask(task)) return null

  const catMeta = task.categoria ? POS_VENDA_CATEGORIA_META[task.categoria] : null
  const urgMeta = task.urgencia ? POS_VENDA_URGENCIA_META[task.urgencia] : null
  const currentStatusCorreios = task.status_correios || 'pendente'

  async function handleCopy(text: string, type: 'rastreio' | 'pedido') {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(type)
      toast.success(
        type === 'rastreio'
          ? `Código de rastreio ${text} copiado!`
          : `Número do pedido ${text} copiado!`,
      )
      setTimeout(() => {
        setCopiedField(null)
      }, 2000)
    } catch {
      toast.danger('Não foi possível copiar para a área de transferência.')
    }
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextStatus = e.target.value as StatusCorreios
    if (!onUpdateStatus || nextStatus === currentStatusCorreios) return

    setIsUpdating(true)
    try {
      onUpdateStatus(nextStatus)
      toast.success('Status dos Correios atualizado.')
    } catch {
      toast.danger('Erro ao atualizar status dos Correios.')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`rounded-md border border-sky-500/30 bg-sky-500/5 select-none ${
        compact ? 'mt-1.5 p-1.5 text-[11px]' : 'mt-2.5 p-2 text-xs'
      }`}
    >
      {/* Badges de Categoria, Urgência e Alerta PI Correios */}
      <div className="flex flex-wrap items-center gap-1.5">
        {catMeta && (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${catMeta.className}`}
          >
            <i className={`fa-solid ${catMeta.icon} text-[9px]`} />
            {catMeta.label}
          </span>
        )}

        {urgMeta && (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${urgMeta.className}`}
          >
            <i className={`fa-solid ${urgMeta.icon} text-[9px]`} />
            {urgMeta.label}
          </span>
        )}

        {task.precisa_abrir_pi_correios && (
          <span
            title="Atenção: Abertura de Pedido de Informação (PI) nos Correios requerida para este chamado"
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/60 bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs animate-pulse"
          >
            <i className="fa-solid fa-triangle-exclamation text-[9px]" />
            Abrir PI Correios
          </span>
        )}
      </div>

      {/* Resumo da IA */}
      {task.resumo_ia && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded bg-background/80 p-1.5 text-[11px] leading-snug border border-border/70 text-foreground">
          <i className="fa-solid fa-wand-magic-sparkles shrink-0 text-[10px] text-sky-500 mt-0.5" />
          <p className="line-clamp-3 italic text-foreground/90 font-medium">
            "{task.resumo_ia}"
          </p>
        </div>
      )}

      {/* Remetente se disponível */}
      {task.email_remetente && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground truncate">
          <i className="fa-regular fa-envelope text-[9px]" />
          <span className="truncate">Cliente: {task.email_remetente}</span>
        </div>
      )}

      {/* Botões rápidos de 1-clique para copiar códigos */}
      {(task.codigo_rastreio || task.codigo_pedido) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {task.codigo_rastreio && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void handleCopy(task.codigo_rastreio!, 'rastreio')
              }}
              title="Clique para copiar o código de rastreio"
              className="inline-flex cursor-pointer items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-mono font-semibold text-foreground transition hover:border-sky-500 hover:text-sky-600 shadow-2xs active:scale-95"
            >
              <i className="fa-solid fa-truck-fast text-[9px] text-muted-foreground" />
              <span>{task.codigo_rastreio}</span>
              {copiedField === 'rastreio' ? (
                <span className="ml-0.5 text-[9px] text-emerald-600 font-sans font-bold animate-in fade-in">
                  <i className="fa-solid fa-check text-[9px] mr-0.5" />
                  Copiado!
                </span>
              ) : (
                <i className="fa-regular fa-copy text-[9px] text-muted-foreground/60" />
              )}
            </button>
          )}

          {task.codigo_pedido && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void handleCopy(task.codigo_pedido!, 'pedido')
              }}
              title="Clique para copiar o número do pedido"
              className="inline-flex cursor-pointer items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-mono font-semibold text-foreground transition hover:border-sky-500 hover:text-sky-600 shadow-2xs active:scale-95"
            >
              <i className="fa-solid fa-receipt text-[9px] text-muted-foreground" />
              <span>#{task.codigo_pedido}</span>
              {copiedField === 'pedido' ? (
                <span className="ml-0.5 text-[9px] text-emerald-600 font-sans font-bold animate-in fade-in">
                  <i className="fa-solid fa-check text-[9px] mr-0.5" />
                  Copiado!
                </span>
              ) : (
                <i className="fa-regular fa-copy text-[9px] text-muted-foreground/60" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Dropdown de controle rápido do Status dos Correios */}
      {onUpdateStatus && (
        <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-sky-500/20 pt-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
            <i className="fa-solid fa-truck text-[9px]" />
            Status Correios:
          </span>
          <select
            value={currentStatusCorreios}
            disabled={isUpdating}
            onChange={handleStatusChange}
            onClick={(e) => e.stopPropagation()}
            aria-label="Atualizar status dos Correios"
            className="cursor-pointer rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-2xs transition hover:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {STATUS_CORREIOS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
