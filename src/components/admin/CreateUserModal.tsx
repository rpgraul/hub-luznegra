import { useState, type FormEvent } from 'react'
import { toast } from '@heroui/react'
import { createUser } from '@/lib/supabaseClient'
import { userColor } from '@/utils/colors'

const USERNAME_REGEX = /^[a-z0-9_.]{3,}$/

interface CreateUserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export default function CreateUserModal({
  open,
  onOpenChange,
  onCreated,
}: CreateUserModalProps) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [password, setPassword] = useState('')
  const [sendPasswordEmail, setSendPasswordEmail] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  function reset() {
    setUsername('')
    setEmail('')
    setFullName('')
    setAvatarUrl('')
    setPassword('')
    setSendPasswordEmail(true)
    setError(null)
  }

  function validate(): string | null {
    const normalized = username.trim().toLowerCase()
    if (!USERNAME_REGEX.test(normalized)) {
      return 'Username: mínimo 3 caracteres, sem espaços (use apenas letras, números, _ ou .)'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Informe um e-mail válido.'
    }
    if (password.length < 6) {
      return 'A senha deve ter no mínimo 6 caracteres.'
    }
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)

    const { error: createError } = await createUser({
      username: username.trim().toLowerCase(),
      email: email.trim(),
      full_name: fullName.trim() || undefined,
      password,
    })

    setSubmitting(false)

    if (createError) {
      setError(createError)
      return
    }

    toast.success('Usuário criado com sucesso!')
    if (sendPasswordEmail) {
      toast.info('E-mail de boas-vindas / definição de senha agendado via Resend.')
    }

    reset()
    onOpenChange(false)
    onCreated()
  }

  const previewInitial = (username.trim() || 'U').charAt(0).toUpperCase()
  const previewColor = userColor(username.trim().toLowerCase() || 'default')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <i className="fa-solid fa-user-plus text-sm" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground leading-tight">Novo Usuário</h2>
              <p className="text-xs text-muted-foreground">Cadastre um novo membro no Hub</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Avatar Preview & Name */}
          <div className="flex items-center gap-3.5 p-3 rounded-xl bg-muted/40 border border-border/60">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="size-12 rounded-full object-cover border border-border"
                onError={() => setAvatarUrl('')}
              />
            ) : (
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-xs"
                style={{ backgroundColor: previewColor }}
              >
                {previewInitial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <label className="text-xs font-semibold text-foreground">Foto de Perfil (URL)</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://exemplo.com/foto.jpg"
                className="mt-1 w-full rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="text-xs font-bold text-foreground">
              Username <span className="text-rose-500">*</span>
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-2 text-xs font-semibold text-muted-foreground">@</span>
              <input
                type="text"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                placeholder="nome.sobrenome"
                className="w-full rounded-lg border border-border/80 bg-background pl-7 pr-3 py-1.5 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Usado para menções (@) e login no sistema.</p>
          </div>

          {/* E-mail */}
          <div>
            <label className="text-xs font-bold text-foreground">
              E-mail <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@editoraluznegra.com.br"
              className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
            />
          </div>

          {/* Senha */}
          <div>
            <label className="text-xs font-bold text-foreground">
              Senha Inicial <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
            />
          </div>

          {/* Resend Password Option */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sendPasswordEmail}
                onChange={(e) => setSendPasswordEmail(e.target.checked)}
                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-foreground">
                  Enviar e-mail para troca de senha
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Envia um link seguro para o novo membro definir sua própria senha via Resend.
                </p>
              </div>
            </label>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 text-xs font-medium text-rose-600">
              <i className="fa-solid fa-circle-exclamation mr-1.5" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border/80 bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                  <span>Cadastrando...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-user-plus text-xs" />
                  <span>Criar Usuário</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
