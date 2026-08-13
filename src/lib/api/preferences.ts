import { supabase } from '@/lib/supabaseClient'
import type { DefaultView } from '@/types/database'

export interface UserPreferences {
  user_id: string
  default_view: DefaultView
  active_project_id: string | null
  show_all_tasks: boolean
  updated_at: string
}

export const DEFAULT_PREFERENCES: Omit<UserPreferences, 'user_id'> = {
  default_view: 'gantt',
  active_project_id: null,
  show_all_tasks: false,
  updated_at: '',
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (!data) {
    return { user_id: userId, ...DEFAULT_PREFERENCES }
  }

  return data
}

export type PreferencesPatch = Partial<
  Pick<UserPreferences, 'default_view' | 'active_project_id' | 'show_all_tasks'>
>

export async function updatePreferences(
  userId: string,
  patch: PreferencesPatch,
): Promise<void> {
  const { error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })

  if (error) throw new Error(error.message)
}