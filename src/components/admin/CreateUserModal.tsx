import { useEffect, useState, useRef, type FormEvent } from 'react'
import { toast } from '@heroui/react'
import {
  createUser,
  updateUser,
  uploadAvatarForUser,
  type UserRoleName,
} from '@/lib/supabaseClient'
import { userColor } from '@/utils/colors'

const USERNAME_REGEX = /^[a-z0-9_.]{3,}$/

function generateRandomPassword(length = 12): string {
  const lowercase = 'abcdefghjkmnpqrstuvwxyz'
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const numbers = '23456789'
  const symbols = '!@#$%&*_-'
  const all = lowercase + uppercase + numbers + symbols

  const chars = [
    lowercase[Math.floor(Math.random() * lowercase.length)],
    uppercase[Math.floor(Math.random() * uppercase.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ]

  for (let i = chars.length; i < length; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)])
  }

  return chars.sort(() => Math.random() - 0.5).join('')
}

import { useQueryClient } from '@tanstack/react-query'

interface CreateUserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  initialRole?: UserRoleName
}

export default function CreateUserModal({
  open,
  onOpenChange,
  onCreated,
  initialRole,
}: CreateUserModalProps) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRoleName>(initialRole || 'member')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(true)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [sendPasswordEmail, setSendPasswordEmail] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function reset() {
    setUsername('')
    setEmail('')
    setFullName('')
    setRole(initialRole || 'member')
    setPassword(generateRandomPassword())
    setShowPassword(true)
    setCopiedPassword(false)
    setAvatarFile(null)
    setAvatarPreview(null)
    setSendPasswordEmail(true)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (open) {
      reset()
    }
  }, [open])

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

  function handleRegeneratePassword() {
    const newPass = generateRandomPassword()
    setPassword(newPass)
    setCopiedPassword(false)
    toast.info('Nova senha aleatória gerada.')
  }

  async function handleCopyPassword() {
    if (!password) return
    try {
      await navigator.clipboard.writeText(password)
      setCopiedPassword(true)
      toast.success('Senha copiada para a área de transferência!')
      setTimeout(() => setCopiedPassword(false), 2500)
    } catch {
      toast.danger('Não foi possível copiar a senha automaticamente.')
    }
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

    // 1. Cria usuário
    const { id: createdUserId, error: createError } = await createUser({
      username: username.trim().toLowerCase(),
      email: email.trim(),
      full_name: fullName.trim() || undefined,
      password,
      role,
    })

    if (createError || !createdUserId) {
      setSubmitting(false)
      setError(createError || 'Erro ao criar usuário.')
      return
    }

    // 2. Se houver avatar selecionado, faz upload e atualiza o perfil
    if (avatarFile) {
      try {
        const { url, error: uploadErr } = await uploadAvatarForUser(avatarFile, createdUserId)
        if (uploadErr) {
          console.error('Erro no upload de avatar do novo usuário:', uploadErr)
          toast.warning(`Usuário criado, mas houve erro no upload da foto: ${uploadErr}`)
        } else if (url) {
          await updateUser({
            user_id: createdUserId,
            avatar_url: url,
          })
        }
      } catch (err) {
        console.error('Falha no upload do avatar:', err)
      }
    }

    // 3. Força atualização imediata das queries para aparecer na hora sem Ctrl+F5
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['admin', 'users'], type: 'all' }),
      queryClient.refetchQueries({ queryKey: ['project-members'], type: 'all' }),
    ])

    setSubmitting(false)
    toast.success(`Usuário @${username.trim().toLowerCase()} criado com sucesso!`)

    if (sendPasswordEmail) {
      toast.info('E-mail de boas-vindas / definição de senha agendado.')
    }

    onOpenChange(false)
    onCreated()
  }

  const previewInitial = (fullName.trim() || username.trim() || 'U').charAt(0).toUpperCase()
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
              <p className="text-xs text-muted-foreground">Cadastre um novo membro ou colaborador</p>
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

          {/* Nome Completo */}
          <div>
            <label className="text-xs font-bold text-foreground">
              Nome Completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex: João da Silva"
              className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
            />
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

          {/* Papel no Sistema */}
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

          {/* Senha com geração automática, visualização, edição e cópia */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground">
                Senha Inicial <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-muted-foreground">
                Gerada aleatoriamente (editável)
              </span>
            </div>
            <div className="relative mt-1 flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg border border-border/80 bg-background pl-3 pr-24 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
              />
              <div className="absolute right-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`} />
                </button>
                <button
                  type="button"
                  onClick={handleRegeneratePassword}
                  title="Gerar outra senha aleatória"
                  className="flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <i className="fa-solid fa-arrows-rotate text-xs" />
                </button>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  title="Copiar senha"
                  className={`flex size-6 items-center justify-center rounded transition cursor-pointer ${
                    copiedPassword ? 'text-emerald-500 bg-emerald-500/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <i className={`fa-solid ${copiedPassword ? 'fa-check' : 'fa-copy'} text-xs`} />
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Você pode visualizar, copiar ou digitar uma senha personalizada.
            </p>
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
