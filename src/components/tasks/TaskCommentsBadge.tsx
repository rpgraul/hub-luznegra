import { openTaskChat } from '@/hooks/useTaskCommentCounts'

interface TaskCommentsBadgeProps {
  taskId: string
  count: number
  className?: string
}

/**
 * Ícone de conversa com o número de comentários. Só aparece quando há
 * comentários (count > 0). O clique abre o drawer + chat via evento global.
 */
export default function TaskCommentsBadge({
  taskId,
  count,
  className,
}: TaskCommentsBadgeProps) {
  if (count <= 0) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openTaskChat(taskId)
      }}
      title={`Abrir conversa (${count} comentário${count !== 1 ? 's' : ''})`}
      className={`inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-[#7b68ee]/10 hover:text-[#7b68ee] ${className ?? ''}`}
    >
      <i className="fa-regular fa-comments text-[11px]" />
      <span>{count}</span>
    </button>
  )
}
