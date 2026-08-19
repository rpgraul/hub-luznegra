import { useEffect, useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@heroui/react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  deleteAllNotifications,
} from '@/lib/api/notifications'
import type { Notification, NotificationType } from '@/types/database'
import { formatDateTime } from '@/utils/format'

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: string; bg: string; color: string; label: string }
> = {
  task_assigned: {
    icon: 'fa-user-check',
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    color: 'text-blue-600 dark:text-blue-400',
    label: 'Atribuição',
  },
  due_date_reminder: {
    icon: 'fa-clock',
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    color: 'text-amber-600 dark:text-amber-400',
    label: 'Prazo',
  },
  mention: {
    icon: 'fa-at',
    bg: 'bg-purple-500/10 dark:bg-purple-500/20',
    color: 'text-purple-600 dark:text-purple-400',
    label: 'Menção',
  },
}

function taskIdFromNotification(n: Notification): string | null {
  if (n.task_id) return n.task_id
  if (!n.link) return null
  return n.link.replace(/^\/task\//, '').replace(/^\/dashboard\/task\//, '')
}

// Reproduz um bip sonoro suave de notificação usando Web Audio API
function playNotificationSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12) // A5

    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.25)
  } catch {
    // Audio context may be restricted by browser policy before interaction
  }
}

interface NotificationBellProps {
  tone?: 'light' | 'dark'
}

export default function NotificationBell({
  tone = 'dark',
}: NotificationBellProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [, startTransition] = useTransition()

  // Queries
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled: !!user,
  })

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadCount,
    enabled: !!user,
  })

  // Supabase Realtime Listener
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`realtime:notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })

          // Toca som e exibe Toast instantâneo
          playNotificationSound()
          const config = TYPE_CONFIG[newNotif.type] || TYPE_CONFIG.mention
          toast.info(`[${config.label}] ${newNotif.content}`)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, queryClient])

  // Fecha o dropdown se clicar fora
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-notification-panel]')) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  function refetchAll() {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function handleOpen(notification: Notification) {
    if (!notification.read) {
      await markNotificationRead(notification.id)
      refetchAll()
    }

    const taskId = taskIdFromNotification(notification)
    if (taskId) {
      setIsOpen(false)
      // Dispara evento customizado para o TaskWorkspace abrir o drawer imediatamente sem reload
      window.dispatchEvent(
        new CustomEvent('hub:open-task-drawer', { detail: { taskId } }),
      )
    }
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead()
      refetchAll()
      toast.success('Todas marcadas como lidas.')
    } catch {
      toast.danger('Erro ao marcar notificações.')
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    try {
      await deleteNotification(id)
      refetchAll()
    } catch {
      toast.danger('Erro ao remover notificação.')
    }
  }

  async function handleClearAll() {
    try {
      await deleteAllNotifications()
      refetchAll()
      toast.success('Notificações limpas.')
    } catch {
      toast.danger('Erro ao limpar notificações.')
    }
  }

  const filteredNotifications =
    tab === 'unread'
      ? notifications.filter((n) => !n.read)
      : notifications

  const iconColor =
    tone === 'dark' ? 'text-primary-foreground/90' : 'text-muted-foreground'

  return (
    <div className="relative" data-notification-panel>
      {/* Sininho Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Notificações"
        className="relative flex size-8 items-center justify-center rounded-lg transition hover:bg-muted/80 cursor-pointer focus:outline-none"
      >
        <i className={`fa-solid fa-bell text-sm transition-transform active:scale-95 ${iconColor}`} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs animate-in zoom-in-75 duration-200"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Painel Flutuante de Notificações */}
      {isOpen && (
        <div className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-full mt-1 w-[calc(100vw-1rem)] sm:w-96 max-w-sm rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl z-[9999] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Header do Painel */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">Notificações</span>
              {unread > 0 && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {unread} nova{unread > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  title="Marcar todas como lidas"
                  className="rounded-md p-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
                >
                  <i className="fa-solid fa-check-double text-xs" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  title="Limpar tudo"
                  className="rounded-md p-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition cursor-pointer"
                >
                  <i className="fa-regular fa-trash-can text-xs" />
                </button>
              )}
            </div>
          </div>

          {/* Abas: Todas / Não Lidas */}
          <div className="flex border-b border-border bg-muted/10 px-3 pt-1 gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => startTransition(() => setTab('all'))}
              className={`pb-2 px-2 border-b-2 transition cursor-pointer ${
                tab === 'all'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Todas ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => setTab('unread'))}
              className={`pb-2 px-2 border-b-2 transition cursor-pointer ${
                tab === 'unread'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Não lidas ({unread})
            </button>
          </div>

          {/* Lista de Notificações */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/60 overscroll-contain">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground">
                <i className="fa-solid fa-circle-notch fa-spin text-lg mb-2 text-primary" />
                <span>Carregando notificações...</span>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted/60 mb-2">
                  <i className="fa-solid fa-bell-slash text-base text-muted-foreground/60" />
                </div>
                <span className="font-medium text-foreground">Tudo em dia!</span>
                <span className="text-[11px] text-muted-foreground mt-0.5">
                  {tab === 'unread'
                    ? 'Nenhuma notificação não lida.'
                    : 'Você não tem notificações recentes.'}
                </span>
              </div>
            ) : (
              filteredNotifications.map((n) => {
                const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.mention
                return (
                  <div
                    key={n.id}
                    onClick={() => void handleOpen(n)}
                    className={`group relative flex items-start gap-3 p-3 text-xs transition cursor-pointer hover:bg-muted/50 ${
                      !n.read ? 'bg-primary/[0.03]' : ''
                    }`}
                  >
                    {/* Indicador visual de não lido */}
                    {!n.read && (
                      <span className="absolute left-1 top-4 size-1.5 rounded-full bg-primary" />
                    )}

                    {/* Ícone de Categoria */}
                    <div
                      className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${config.bg} ${config.color}`}
                    >
                      <i className={`fa-solid ${config.icon} text-xs`} />
                    </div>

                    {/* Conteúdo */}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
                          {config.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateTime(n.created_at)}
                        </span>
                      </div>
                      <p className={`text-xs leading-snug ${!n.read ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        {n.content}
                      </p>
                    </div>

                    {/* Ação de Excluir individual */}
                    <button
                      type="button"
                      onClick={(e) => void handleDelete(e, n.id)}
                      title="Remover notificação"
                      className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition cursor-pointer"
                    >
                      <i className="fa-solid fa-xmark text-xs" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}