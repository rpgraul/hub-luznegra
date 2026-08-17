import { useEffect, useState, type FormEvent } from 'react'
import { toast } from '@heroui/react'
import { updateUser, type AdminUser, type UserRoleName } from '@/lib/supabaseClient'
import { userColor } from '@/utils/colors'

const USERNAME_REGEX = /^[a-z0-9_.]{3,}$/

interface EditUserModalProps {
  user: AdminUser
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

export default function EditUserModal({
  user,
  open,
  onOpenChange,
  onUpdated,
}: EditUserModalProps) {
  const [username, setUsername] = useState(user.username)
  const [email, setEmail] = useState(user.email)
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [role, setRole] = useState<UserRoleName>(user.role)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setUsername(user.username)
      setEmail(user.email)
      setFullName(user.full_name ?? '')
      setRole(user.role)
      setPassword('')
      setError(null)
    }
  }, [open, user])

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!USERNAME_REGEX.test(username.trim().toLowerCase())) {
      setError('Username: mínimo 3 caracteres, sem espaços (letras, números, _ e .)')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Informe um e-mail válido.')
      return
    }
    if (password.length > 0 && password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.')
      return
    }

    setSubmitting(true)

    const { error: updateError } = await updateUser({
      user_id: user.id,
      username: username.trim().toLowerCase(),
      email: email.trim(),
      full_name: fullName.trim() || undefined,
      role,
      password: password || undefined,
    })

    setSubmitting(false)

    if (updateError) {
      setError(updateError)
      return
    }

    toast.success('Usuário atualizado com sucesso!')
    onOpenChange(false)
    onUpdated()
  }

  const previewColor = userColor(user.id)
  const previewInitial = (username.trim() || 'U').charAt(0).toUpperCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div
              className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs"
              style={{ backgroundColor: previewColor }}
            >
              {previewInitial}
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground leading-tight">Editar Usuário</h2>
              <p className="text-xs text-muted-foreground">Atualize os dados e permissões</p>
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
          {/* Username */}
          <div>
            <label className="text-xs font-bold text-foreground">
              Username <span className="text-rose-500">*</span>
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-2 text-xs font-semibold text-muted-foreground">@</span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                className="w-full rounded-lg border border-border/80 bg-background pl-7 pr-3 py-1.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>
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
              className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs"
            />
          </div>

          {/* Nome Completo */}
          <div>
            <label className="text-xs font-bold text-foreground">Nome Completo</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome e sobrenome"
              className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
            />
          </div>

          {/* Papel */}
          <div>
            <label className="text-xs font-bold text-foreground">Papel no Sistema</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRoleName)}
              className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none shadow-2xs cursor-pointer"
            >
              <option value="member">Membro (Visualiza e edita projetos atribuídos)</option>
              <option value="admin">Administrador (Acesso total e gestão de usuários)</option>
            </select>
          </div>

          {/* Nova Senha */}
          <div>
            <label className="text-xs font-bold text-foreground">Nova Senha (Opcional)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Deixe em branco para manter a senha atual"
              className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
            />
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
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-check text-xs" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
