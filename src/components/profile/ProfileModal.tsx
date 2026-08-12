import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
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
    toast.success('Perfil atualizado.')
    onOpenChange(false)
  }

  const displayName = user?.full_name ?? user?.username ?? 'Usuário'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Perfil</DialogTitle>
            <DialogDescription>
              Atualize suas informações, senha e férias.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Foto de perfil"
                  className="size-16 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex size-16 items-center justify-center rounded-full text-xl font-semibold text-white"
                  style={{ backgroundColor: userColor(user?.id ?? '') }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="space-y-1">
                <Label
                  htmlFor="avatar-file"
                  className="cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium"
                >
                  <i className="fa-solid fa-camera mr-2" />
                  Alterar foto
                </Label>
                <p className="text-xs text-muted-foreground">
                  JPG ou PNG, máximo 2MB
                </p>
                <Input
                  id="avatar-file"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-fullname">Nome completo</Label>
              <Input
                id="p-fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <h2 className="text-sm font-medium">Alterar senha</h2>
              <div className="space-y-2">
                <Label htmlFor="p-current-password">Senha atual</Label>
                <Input
                  id="p-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="p-new-password">Nova senha</Label>
                  <Input
                    id="p-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-confirm-password">Confirmar nova senha</Label>
                  <Input
                    id="p-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Deixe em branco para não alterar.
              </p>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <h2 className="text-sm font-medium">Férias</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="p-ferias-inicio">Início</Label>
                  <Input
                    id="p-ferias-inicio"
                    type="date"
                    value={feriasInicio}
                    onChange={(e) => setFeriasInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-ferias-fim">Fim</Label>
                  <Input
                    id="p-ferias-fim"
                    type="date"
                    value={feriasFim}
                    onChange={(e) => setFeriasFim(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Ao salvar, você será avisado sobre tarefas atribuídas no
                período.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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