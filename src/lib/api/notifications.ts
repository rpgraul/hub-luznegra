import { supabase } from '@/lib/supabaseClient'
import type { Notification } from '@/types/database'

const NOTIFICATIONS_LIMIT = 10

export async function getNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(NOTIFICATIONS_LIMIT)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('read', false)

  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false)

  if (error) throw new Error(error.message)
}