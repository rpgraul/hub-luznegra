import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, clearPersistedSession } from '@/lib/supabaseClient'
import type { Profile } from '@/types/database'

export interface SignInResult {
  error: string | null
}

export interface AuthContextValue {
  user: Profile | null
  isAuthenticated: boolean
  loading: boolean
  signIn: (identifier: string, password: string, remember?: boolean) => Promise<SignInResult>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export { AuthContext }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!session?.user) {
      setUser(null)
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setUser(data ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session])

  const signIn = useCallback(
    async (identifier: string, password: string, remember = true) => {
      const trimmed = identifier.trim()
      const isEmail = trimmed.includes('@')

      let email = isEmail ? trimmed : null

      if (!isEmail) {
        const { data, error } = await supabase.rpc('resolve_login_email', {
          p_username: trimmed,
        })
        if (error || !data) {
          return { error: error?.message ?? 'Usuário não encontrado.' }
        }
        email = String(data)
      }

      if (!email) {
        return { error: 'Usuário não encontrado.' }
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        return { error: error.message }
      }

      if (!remember) {
        clearPersistedSession()
      }

      return { error: null }
    },
    [],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = useCallback(async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    if (!authUser) {
      setUser(null)
      return
    }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle()
    setUser(data ?? null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: session !== null,
      loading,
      signIn,
      signOut,
      refreshProfile,
    }),
    [user, session, loading, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}