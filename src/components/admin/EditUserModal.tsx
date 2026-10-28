import { useEffect, useState, useRef, type FormEvent } from 'react'
import { toast } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  updateUser,
  uploadAvatarForUser,
  type AdminUser,
  type UserRoleName,
} from '@/lib/supabaseClient'
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
  const queryClient = useQueryClient()
  const [username, setUsername] = useState(user.username)
  const [email, setEmail] = useState(user.email)
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [role, setRole] = useState<UserRoleName>(user.role)
  const [password, setPassword] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url ?? null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setUsername(user.username)
      setEmail(user.email)
      setFullName(user.full_name ?? '')
      setRole(user.role)
      setPassword('')
      setAvatarFile(null)
      setAvatarPreview(user.avatar_url ?? null)
      setError(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [open, user])

  if (!open) return null

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return

    if (!selected.type.startsWith('image/')) {
      toast.danger('O arquivo selecionado deve ser uma imagem (PNG, JPG, WEBP ou GIF).')
      return
    }

    if (selected.size > 2 * 1024 * 1024) {
      toast.danger('A imagem selecionada deve ter no máximo 2MB.')
      return
    }

    setAvatarFile(selected)
    setAvatarPreview(URL.createObjectURL(selected))
  }

  function handleRemoveAvatar() {
    setAvatarFile(null)
    setAvatarPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

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

    let finalAvatarUrl: string | null | undefined = undefined

    // Se houve seleção de novo arquivo de avatar
    if (avatarFile) {
      const { url, error: uploadErr } = await uploadAvatarForUser(avatarFile, user.id)
      if (uploadErr) {
        toast.danger(`Erro ao enviar foto: ${uploadErr}`)
        setSubmitting(false)
        return
      }
      finalAvatarUrl = url
    } else if (avatarPreview === null && user.avatar_url !== null) {
      // Usuário clicou em remover avatar
      finalAvatarUrl = null
    }

    const { error: updateError } = await updateUser({
      user_id: user.id,
      username: username.trim().toLowerCase(),
      email: email.trim(),
      full_name: fullName.trim() || undefined,
      role,
      password: password || undefined,
      avatar_url: finalAvatarUrl,
    })

    setSubmitting(false)

    if (updateError) {
      setError(updateError)
      return
    }

    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['admin', 'users'], type: 'all' }),
      queryClient.refetchQueries({ queryKey: ['project-members'], type: 'all' }),
    ])

    toast.success('Usuário atualizado com sucesso!')
    onOpenChange(false)
    onUpdated()
  }

  const previewColor = userColor(user.id)
  const previewInitial = (fullName.trim() || username.trim() || 'U').charAt(0).toUpperCase()

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
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Avatar Upload (Subir Imagem / Thumb) */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60">
            <label className="text-xs font-bold text-foreground block mb-2">
              Foto de Perfil / Thumbnail
            </label>
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Preview"
                    className="size-13 rounded-full object-cover border-2 border-primary/40 shadow-xs"
                  />
                ) : (
                  <div
                    className="flex size-13 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white shadow-xs"
                    style={{ backgroundColor: previewColor }}
                  >
                    {previewInitial}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted shadow-2xs cursor-pointer"
                  >
                    <i className="fa-solid fa-arrow-up-from-bracket text-[11px]" />
                    <span>{avatarPreview ? 'Trocar foto' : 'Subir imagem'}</span>
                  </button>

                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      title="Remover foto"
                      className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-background px-2 py-1.5 text-xs font-medium text-rose-500 transition hover:bg-rose-500/10 cursor-pointer"
                    >
                      <i className="fa-solid fa-trash-can text-[11px]" />
                      <span>Remover</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  PNG, JPG, WEBP ou GIF (máx. 2MB).
                </p>
              </div>
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
              <option value="member">Membro (Equipe interna - acesso a projetos, docs e fornecedores)</option>
              <option value="collaborator">Colaborador (Autor, Ilustrador, Redator - apenas tarefas designadas)</option>
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
