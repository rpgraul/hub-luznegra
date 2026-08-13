import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Dropdown } from '@heroui/react'
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

interface NotificationBellProps {
  tone?: 'light' | 'dark'
}

export default function NotificationBell({
  tone = 'dark',
}: NotificationBellProps) {
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

  const iconColor =
    tone === 'dark' ? 'text-primary-foreground/90' : 'text-muted-foreground'

  return (
    <Dropdown.Root>
      <Dropdown.Trigger>
        <Button
          variant="ghost"
          isIconOnly
          aria-label="Notificações"
          className="relative"
        >
          <i className={`fa-solid fa-bell text-base ${iconColor}`} />
          {unread > 0 && (
            <span
              className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                tone === 'dark'
                  ? 'bg-white text-primary'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Popover className="w-80 max-w-[calc(100vw-2rem)]">
        <Dropdown.Menu>
          <Dropdown.Item key="__header" isDisabled className="cursor-default opacity-100">
            <span className="flex w-full items-center justify-between">
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
            </span>
          </Dropdown.Item>
          {notifications.length === 0 && (
            <Dropdown.Item key="__empty" isDisabled className="cursor-default opacity-100">
              <span className="px-2 py-4 text-center text-sm text-muted-foreground">
                Nenhuma notificação.
              </span>
            </Dropdown.Item>
          )}
          {notifications.map((notification) => {
            const type = TYPE_ICONS[notification.type]
            return (
              <Dropdown.Item
                key={notification.id}
                className="items-start gap-3 py-2"
                onAction={() => void handleOpen(notification)}
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
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                )}
              </Dropdown.Item>
            )
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  )
}