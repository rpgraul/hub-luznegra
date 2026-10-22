import { useState } from 'react'
import { toast, Label } from '@heroui/react'
import {
  POS_VENDA_CATEGORIA_META,
  POS_VENDA_URGENCIA_META,
  STATUS_CORREIOS_OPTIONS,
  isPosVendaTask,
} from '@/utils/posVenda'
import type { StatusCorreios, Task } from '@/types/database'

interface PosVendaDrawerSectionProps {
  task: Task
  onPatch: (patch: Partial<Task>) => void
}

export default function PosVendaDrawerSection({
  task,
  onPatch,
}: PosVendaDrawerSectionProps) {
  const [copiedField, setCopiedField] = useState<'rastreio' | 'pedido' | null>(null)

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
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast.danger('Não foi possível copiar.')
    }
  }

  function handleCorreiosStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as StatusCorreios
    onPatch({ status_correios: next })
    toast.success('Status dos Correios atualizado.')
  }

  function handleTogglePiCorreios() {
    const next = !task.precisa_abrir_pi_correios
    onPatch({ precisa_abrir_pi_correios: next })
    toast.success(
      next
        ? 'Marcado como requer Pedido de Informação (PI) nos Correios.'
        : 'Removido alerta de PI dos Correios.',
    )
  }

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 shadow-xs space-y-3">
      {/* Header com Título e Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <i className="fa-solid fa-headset text-xs" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-foreground">
              Triagem de Pós-Venda (Gmail IA)
            </h3>
            {task.email_remetente && (
              <p className="text-[10px] text-muted-foreground truncate">
                {task.email_remetente}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {catMeta && (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${catMeta.className}`}
            >
              <i className={`fa-solid ${catMeta.icon} text-[9px]`} />
              {catMeta.label}
            </span>
          )}

          {urgMeta && (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${urgMeta.className}`}
            >
              <i className={`fa-solid ${urgMeta.icon} text-[9px]`} />
              {urgMeta.label}
            </span>
          )}
        </div>
      </div>

      {/* Alerta de Abertura de PI nos Correios */}
      <div className="flex items-center justify-between gap-2 rounded-lg bg-card/80 p-2 border border-border/80">
        <div className="flex items-center gap-2">
          <i
            className={`fa-solid fa-triangle-exclamation text-sm ${
              task.precisa_abrir_pi_correios ? 'text-rose-500' : 'text-muted-foreground/40'
            }`}
          />
          <div className="text-xs">
            <span className="font-semibold text-foreground block">
              Pedido de Informação (PI) Correios
            </span>
            <span className="text-[10px] text-muted-foreground">
              {task.precisa_abrir_pi_correios
                ? 'Extravio ou atraso crítico identificado pelo cliente.'
                : 'Não requer abertura de chamado imediato.'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleTogglePiCorreios}
          className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-bold transition shadow-2xs ${
            task.precisa_abrir_pi_correios
              ? 'border-rose-500/50 bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25'
              : 'border-border bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          {task.precisa_abrir_pi_correios ? 'Exigir PI (Ativo)' : 'Marcar para PI'}
        </button>
      </div>

      {/* Resumo da IA */}
      {task.resumo_ia && (
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <i className="fa-solid fa-wand-magic-sparkles text-[10px] text-sky-500" />
            Diagnóstico / Resumo da IA:
          </Label>
          <div className="rounded-lg bg-card p-2.5 text-xs text-foreground leading-relaxed border border-border/80 italic font-medium shadow-2xs">
            "{task.resumo_ia}"
          </div>
        </div>
      )}

      {/* Assunto original do e-mail */}
      {task.assunto_email && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
          <i className="fa-solid fa-envelope text-[10px] text-muted-foreground/60" />
          <span className="font-medium text-foreground/80 truncate">
            Assunto: {task.assunto_email}
          </span>
        </div>
      )}

      {/* Rastreio e Pedido com Botões de 1-Clique */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {/* Rastreio */}
        <div className="rounded-lg bg-card p-2 border border-border/80 space-y-1">
          <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
            <i className="fa-solid fa-truck-fast text-[10px]" />
            Código de Rastreio:
          </span>
          {task.codigo_rastreio ? (
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-xs font-bold text-foreground truncate">
                {task.codigo_rastreio}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(task.codigo_rastreio!, 'rastreio')}
                  className="cursor-pointer rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted"
                  title="Copiar código"
                >
                  {copiedField === 'rastreio' ? (
                    <span className="text-emerald-600 font-bold">Copiado!</span>
                  ) : (
                    <i className="fa-regular fa-copy" />
                  )}
                </button>
                <a
                  href={`https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(
                    task.codigo_rastreio,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                  title="Rastrear nos Correios"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" />
                </a>
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/60 italic">
              Não identificado no e-mail
            </span>
          )}
        </div>

        {/* Pedido */}
        <div className="rounded-lg bg-card p-2 border border-border/80 space-y-1">
          <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
            <i className="fa-solid fa-receipt text-[10px]" />
            Código do Pedido / Apoio:
          </span>
          {task.codigo_pedido ? (
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-xs font-bold text-foreground truncate">
                #{task.codigo_pedido}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(task.codigo_pedido!, 'pedido')}
                className="cursor-pointer rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted shrink-0"
                title="Copiar número"
              >
                {copiedField === 'pedido' ? (
                  <span className="text-emerald-600 font-bold">Copiado!</span>
                ) : (
                  <i className="fa-regular fa-copy" />
                )}
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/60 italic">
              Não mencionado no e-mail
            </span>
          )}
        </div>
      </div>

      {/* Status Correios no Drawer */}
      <div className="flex items-center justify-between gap-2 border-t border-sky-500/20 pt-2.5">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <i className="fa-solid fa-box text-xs text-sky-600 dark:text-sky-400" />
          Status nos Correios:
        </span>
        <select
          value={currentStatusCorreios}
          onChange={handleCorreiosStatusChange}
          aria-label="Status nos Correios"
          className="cursor-pointer rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-2xs transition hover:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {STATUS_CORREIOS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
