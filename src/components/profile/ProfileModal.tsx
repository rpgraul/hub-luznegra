import { useEffect, useState, type FormEvent } from 'react'
import { toast, Button, Modal, TextField, Label, Input } from '@heroui/react'
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
      <Modal.Root isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.Header>
              <Modal.Heading>Perfil</Modal.Heading>
              <p className="text-sm text-muted-foreground">
                Atualize suas informações, senha e férias.
              </p>
            </Modal.Header>

            <Modal.Body>
              <form id="profile-form" onSubmit={handleSubmit} className="space-y-6">
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

                <TextField.Root value={fullName} onChange={setFullName}>
                  <Label>Nome completo</Label>
                  <Input />
                </TextField.Root>

                <div className="space-y-3 rounded-md border p-4">
                  <h2 className="text-sm font-medium">Alterar senha</h2>
                  <TextField.Root
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    type="password"
                    autoComplete="current-password"
                  >
                    <Label>Senha atual</Label>
                    <Input />
                  </TextField.Root>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField.Root
                      value={newPassword}
                      onChange={setNewPassword}
                      type="password"
                      autoComplete="new-password"
                    >
                      <Label>Nova senha</Label>
                      <Input />
                    </TextField.Root>
                    <TextField.Root
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      type="password"
                      autoComplete="new-password"
                    >
                      <Label>Confirmar nova senha</Label>
                      <Input />
                    </TextField.Root>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco para não alterar.
                  </p>
                </div>

                <div className="space-y-3 rounded-md border p-4">
                  <h2 className="text-sm font-medium">Férias</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField.Root value={feriasInicio} onChange={setFeriasInicio} type="date">
                      <Label>Início</Label>
                      <Input />
                    </TextField.Root>
                    <TextField.Root value={feriasFim} onChange={setFeriasFim} type="date">
                      <Label>Fim</Label>
                      <Input />
                    </TextField.Root>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ao salvar, você será avisado sobre tarefas atribuídas no
                    período.
                  </p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
              </form>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="outline" onPress={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="profile-form" isDisabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </Modal.Footer>
            <Modal.CloseTrigger />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Root>

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