import { supabase } from '@/lib/supabaseClient'
import type { DefaultView } from '@/types/database'

export interface UserPreferences {
  user_id: string
  default_view: DefaultView
  active_project_id: string | null
  show_all_tasks: boolean
  hide_done_tasks?: boolean
  updated_at: string
}

export const DEFAULT_PREFERENCES: Omit<UserPreferences, 'user_id'> = {
  default_view: 'gantt',
  active_project_id: null,
  show_all_tasks: false,
  hide_done_tasks: false,
  updated_at: '',
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
  let localHideDone = false
  try {
    const stored = localStorage.getItem(`hub_hide_done_${userId}`)
    if (stored !== null) {
      localHideDone = JSON.parse(stored)
    }
  } catch {
    // ignore
  }

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (!data) {
    return { user_id: userId, ...DEFAULT_PREFERENCES, hide_done_tasks: localHideDone }
  }

  return { ...data, hide_done_tasks: localHideDone }
}

export type PreferencesPatch = Partial<
  Pick<UserPreferences, 'default_view' | 'active_project_id' | 'show_all_tasks' | 'hide_done_tasks'>
>

export async function updatePreferences(
  userId: string,
  patch: PreferencesPatch,
): Promise<void> {
  if (patch.hide_done_tasks !== undefined) {
    try {
      localStorage.setItem(`hub_hide_done_${userId}`, JSON.stringify(patch.hide_done_tasks))
    } catch {
      // ignore
    }
  }

  // Pick DB columns only to avoid schema cache error if column is not yet in DB
  const dbPatch: Record<string, unknown> = {}
  if (patch.default_view !== undefined) dbPatch.default_view = patch.default_view
  if (patch.active_project_id !== undefined) dbPatch.active_project_id = patch.active_project_id
  if (patch.show_all_tasks !== undefined) dbPatch.show_all_tasks = patch.show_all_tasks

  if (Object.keys(dbPatch).length > 0) {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, ...dbPatch }, { onConflict: 'user_id' })

    if (error) throw new Error(error.message)
  }
}