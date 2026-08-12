import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api/notifications'
import type { Notification, NotificationType } from '@/types/database'
import { formatDateTime } from '@/utils/format'

const TYPE_ICONS: Record<NotificationType, { icon: string; color: string }> = {
  task_assigned: { icon: 'fa-user-plus', color: 'text-blue-500' },
  due_date_reminder: { icon: 'fa-bell-exclamation', color: 'text-amber-500' },
  mention: { icon: 'fa-at', color: 'text-purple-500' },
}

function taskIdFromLink(link: string | null): string | null {
  if (!link) return null
  return link.replace(/^\/task\//, '')
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
  })

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadCount,
  })

  function refetchAll() {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function handleOpen(notification: Notification) {
    if (!notification.read) {
      await markNotificationRead(notification.id)
      refetchAll()
    }

    const taskId = taskIdFromLink(notification.link)
    if (taskId) {
      navigate(`/dashboard/task/${taskId}`)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
          <i className="fa-solid fa-bell text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificações</span>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                void markAllNotificationsRead()
                refetchAll()
              }}
            >
              Marcar todas como lidas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação.
            </p>
          )}
          {notifications.map((notification) => {
            const type = TYPE_ICONS[notification.type]
            return (
              <DropdownMenuItem
                key={notification.id}
                className="cursor-pointer items-start gap-3 py-2"
                onSelect={(e) => {
                  e.preventDefault()
                  void handleOpen(notification)
                }}
              >
                <i
                  className={`fa-solid ${type.icon} mt-0.5 text-sm ${type.color}`}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm">{notification.content}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(notification.created_at)}
                  </p>
                </div>
                {!notification.read && (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />
                )}
              </DropdownMenuItem>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}