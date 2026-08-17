import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router'
import { toast } from '@heroui/react'
import { supabase } from '@/lib/supabaseClient'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // Escuta mudança de auth caso o hash (#access_token=...) seja processado
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        toast.info('Sessão de recuperação validada. Digite sua nova senha.')
      }
    })
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem. Digite a mesma senha nos dois campos.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    setLoading(false)

    if (updateError) {
      setError(updateError.message || 'Erro ao atualizar a senha.')
      return
    }

    setSuccess(true)
    toast.success('Senha redefinida com sucesso!')
    setTimeout(() => {
      navigate('/dashboard', { replace: true })
    }, 2000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
            <i className="fa-solid fa-key text-xl" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Definir Nova Senha
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Digite sua nova senha de acesso ao Hub da Editora Luz Negra
          </p>
        </div>

        {success ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-3">
            <div className="flex size-10 mx-auto items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
              <i className="fa-solid fa-check text-lg" />
            </div>
            <h3 className="text-sm font-bold text-emerald-600">Senha Alterada com Sucesso!</h3>
            <p className="text-xs text-muted-foreground">
              Você será redirecionado para o painel em instantes...
            </p>
            <div className="pt-2">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <span>Acessar agora</span>
                <i className="fa-solid fa-arrow-right text-[10px]" />
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nova Senha */}
            <div>
              <label className="text-xs font-bold text-foreground">
                Nova Senha <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>

            {/* Confirmar Nova Senha */}
            <div>
              <label className="text-xs font-bold text-foreground">
                Confirmar Nova Senha <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 text-xs font-medium text-rose-600">
                <i className="fa-solid fa-circle-exclamation mr-1.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                  <span>Salvando nova senha...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-lock text-xs" />
                  <span>Salvar Nova Senha</span>
                </>
              )}
            </button>

            <div className="pt-2 text-center">
              <Link
                to="/login"
                className="text-xs text-muted-foreground transition hover:text-foreground font-medium"
              >
                Voltar para o login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
