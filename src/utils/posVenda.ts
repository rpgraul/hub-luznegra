import type {
  PosVendaCategoria,
  PosVendaUrgencia,
  StatusCorreios,
  Task,
} from '@/types/database'

export const POS_VENDA_CATEGORIA_META: Record<
  PosVendaCategoria,
  {
    label: string
    icon: string
    className: string
  }
> = {
  extravio: {
    label: 'Extravio',
    icon: 'fa-box-open',
    className:
      'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400',
  },
  avaria: {
    label: 'Avaria',
    icon: 'fa-heart-crack',
    className:
      'border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  atraso: {
    label: 'Atraso',
    icon: 'fa-clock',
    className:
      'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  duvida: {
    label: 'Dúvida',
    icon: 'fa-circle-question',
    className:
      'border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-400',
  },
  desenvolvimento: {
    label: 'Dev / Site',
    icon: 'fa-code',
    className:
      'border-indigo-500/40 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  },
  proposta_jogo: {
    label: 'Proposta de Jogo',
    icon: 'fa-dice-d20',
    className:
      'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  outro: {
    label: 'Pós-Venda',
    icon: 'fa-headset',
    className:
      'border-violet-500/40 bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
}

export const POS_VENDA_URGENCIA_META: Record<
  PosVendaUrgencia,
  {
    label: string
    icon: string
    className: string
  }
> = {
  alta: {
    label: 'Urgência Alta',
    icon: 'fa-fire',
    className:
      'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400',
  },
  media: {
    label: 'Urgência Média',
    icon: 'fa-bolt',
    className:
      'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  baixa: {
    label: 'Urgência Baixa',
    icon: 'fa-arrow-down',
    className:
      'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
}

export const STATUS_CORREIOS_OPTIONS: Array<{
  value: StatusCorreios
  label: string
  shortLabel: string
  className: string
}> = [
  {
    value: 'pendente',
    label: 'Correios: Pendente',
    shortLabel: 'Pendente',
    className:
      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  {
    value: 'chamado_aberto',
    label: 'Correios: Chamado Aberto (PI)',
    shortLabel: 'Chamado Aberto',
    className:
      'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  {
    value: 'resolvido',
    label: 'Correios: Resolvido',
    shortLabel: 'Resolvido',
    className:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
]

export function isPosVendaTask(task: Task | null | undefined): boolean {
  if (!task) return false
  // Propostas de jogos são projetos editoriais próprios e não chamados de SAC/pós-venda
  if (task.categoria === 'proposta_jogo') return false
  return Boolean(
    task.categoria ||
      task.email_remetente ||
      task.resumo_ia ||
      task.codigo_rastreio ||
      task.codigo_pedido ||
      task.precisa_abrir_pi_correios,
  )
}
