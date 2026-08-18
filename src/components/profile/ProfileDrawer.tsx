import { useEffect, useState, type FormEvent } from 'react'
import { toast, Label, Input } from '@heroui/react'
import { useAuth } from '@/hooks/useAuth'
import { userColor } from '@/utils/colors'
import {
  changePassword,
  checkTasksInPeriod,
  updateFerias,
  updateProfile,
  uploadAvatar,
  type FeriasTask,
} from '@/lib/supabaseClient'
import FeriasAlert from '@/components/profile/FeriasAlert'

interface ProfileDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ProfileDrawer({ open, onOpenChange }: ProfileDrawerProps) {
  const { user, refreshProfile } = useAuth()

  const [fullName, setFullName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [feriasInicio, setFeriasInicio] = useState('')
  const [feriasFim, setFeriasFim] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertTasks, setAlertTasks] = useState<FeriasTask[]>([])
  const [alertPeriod, setAlertPeriod] = useState({ inicio: '', fim: '' })

  useEffect(() => {
    if (open && user) {
      setFullName(user.full_name ?? '')
      setAvatarUrl(user.avatar_url)
      setFile(null)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setFeriasInicio(user.ferias_inicio ?? '')
      setFeriasFim(user.ferias_fim ?? '')
      setError(null)
    }
  }, [open, user])

  if (!open) return null

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setAvatarUrl(URL.createObjectURL(selected))
  }

  function validate(): string | null {
    if (newPassword) {
      if (newPassword.length < 6) {
        return 'A nova senha deve ter no mínimo 6 caracteres.'
      }
      if (newPassword !== confirmPassword) {
        return 'As senhas não coincidem.'
      }
      if (!currentPassword) {
        return 'Informe a senha atual para alterá-la.'
      }
    }
    if ((feriasInicio && !feriasFim) || (!feriasInicio && feriasFim)) {
      return 'Para registrar férias, informe início e fim.'
    }
    if (feriasInicio && feriasFim && feriasInicio > feriasFim) {
      return 'O início das férias não pode ser depois do fim.'
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

    setSaving(true)
    setError(null)

    let newAvatarUrl = avatarUrl
    if (file) {
      const { url, error: uploadError } = await uploadAvatar(file)
      if (uploadError) {
        setError(uploadError)
        setSaving(false)
        return
      }
      newAvatarUrl = url
    }

    const { error: profileError } = await updateProfile({
      full_name: fullName.trim() || null,
      avatar_url: newAvatarUrl,
    })
    if (profileError) {
      setError(profileError)
      setSaving(false)
      return
    }

    if (newPassword) {
      const { error: passwordError } = await changePassword(
        currentPassword,
        newPassword,
      )
      if (passwordError) {
        setError(passwordError)
        setSaving(false)
        return
      }
    }

    if (feriasInicio || feriasFim) {
      const { error: feriasError } = await updateFerias(feriasInicio, feriasFim)
      if (feriasError) {
        setError(feriasError)
        setSaving(false)
        return
      }

      const { tasks, error: checkError } = await checkTasksInPeriod(
        feriasInicio,
        feriasFim,
      )
      if (!checkError && tasks.length > 0) {
        setAlertTasks(tasks)
        setAlertPeriod({ inicio: feriasInicio, fim: feriasFim })
        setAlertOpen(true)
      }
    }

    setSaving(false)
    await refreshProfile()
    toast.success('Perfil atualizado com sucesso.')
    onOpenChange(false)
  }

  const displayName = user?.full_name ?? user?.username ?? 'Usuário'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-over Drawer lateral (mesmo padrão do TaskDrawer) */}
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[540px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-250 select-text">
        {/* Drawer Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <i className="fa-solid fa-user-gear text-xs" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Meu Perfil</h2>
              <p className="text-[11px] text-muted-foreground">Informações da conta, senha e férias</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar painel"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Drawer Body */}
        <form
          id="profile-drawer-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-6"
        >
          {/* Avatar Section */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 p-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Foto de perfil"
                className="size-16 rounded-2xl object-cover ring-2 ring-border shadow-xs"
              />
            ) : (
              <span
                className="flex size-16 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-xs"
                style={{ backgroundColor: userColor(user?.id ?? '') }}
              >
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">{displayName}</span>
                <span className="text-xs text-muted-foreground font-mono">@{user?.username}</span>
              </div>
              <Label
                htmlFor="drawer-avatar-file"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-muted shadow-2xs"
              >
                <i className="fa-solid fa-camera text-[11px]" />
                Alterar foto
              </Label>
              <Input
                id="drawer-avatar-file"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Nome Completo */}
          <div>
            <label className="text-xs font-bold text-foreground">Nome Completo</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-2xs"
            />
          </div>

          {/* Alterar Senha */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <i className="fa-solid fa-key text-primary" />
              <span>Alterar Senha</span>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Senha Atual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Digite para confirmar alteração"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Nova Senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 dígitos"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none shadow-2xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Confirmar Nova Senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Repita a nova senha"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Férias */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <i className="fa-solid fa-umbrella-beach text-amber-500" />
              <span>Período de Férias</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Início</label>
                <input
                  type="date"
                  value={feriasInicio}
                  onChange={(e) => setFeriasInicio(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none shadow-2xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Fim</label>
                <input
                  type="date"
                  value={feriasFim}
                  onChange={(e) => setFeriasFim(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none shadow-2xs"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ao salvar, você será avisado se houver tarefas com prazo atribuídas no período.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation text-xs" />
              <span>{error}</span>
            </div>
          )}
        </form>

        {/* Drawer Footer */}
        <div className="flex h-16 shrink-0 items-center justify-end gap-2 border-t border-border bg-card/95 px-6 backdrop-blur">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="profile-drawer-form"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
          >
            {saving ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                <span>Salvando...</span>
              </>
            ) : (
              <span>Salvar Alterações</span>
            )}
          </button>
        </div>
      </div>

      <FeriasAlert
        open={alertOpen}
        onOpenChange={setAlertOpen}
        inicio={alertPeriod.inicio}
        fim={alertPeriod.fim}
        tasks={alertTasks}
      />
    </>
  )
}
