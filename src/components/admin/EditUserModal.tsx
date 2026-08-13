import { useEffect, useState, type FormEvent } from 'react'
import {
  toast,
  Button,
  Modal,
  TextField,
  Label,
  Input,
  Select,
  ListBox,
} from '@heroui/react'
import { updateUser, type AdminUser, type UserRoleName } from '@/lib/supabaseClient'

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

    toast.success('Usuário atualizado.')
    onOpenChange(false)
    onUpdated()
  }

  return (
    <Modal.Root isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.Header>
            <Modal.Heading>Editar Usuário</Modal.Heading>
          </Modal.Header>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Modal.Body>
              <TextField.Root
                value={username}
                onChange={setUsername}
                autoFocus
                isRequired
              >
                <Label>Username</Label>
                <Input />
              </TextField.Root>

              <TextField.Root value={email} onChange={setEmail} type="email" isRequired>
                <Label>E-mail</Label>
                <Input />
              </TextField.Root>

              <TextField.Root value={fullName} onChange={setFullName}>
                <Label>Nome completo</Label>
                <Input />
              </TextField.Root>

              <Select.Root
                selectedKey={role}
                onSelectionChange={(value) => setRole(value as UserRoleName)}
                placeholder="Selecione o papel"
              >
                <Label>Papel</Label>
                <Select.Trigger className="w-full">
                  <Select.Value />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox.Root>
                    <ListBox.Item id="member" textValue="Membro">
                      Membro
                    </ListBox.Item>
                    <ListBox.Item id="admin" textValue="Admin">
                      Admin
                    </ListBox.Item>
                  </ListBox.Root>
                </Select.Popover>
              </Select.Root>

              <TextField.Root
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="new-password"
              >
                <Label>Nova senha (opcional)</Label>
                <Input placeholder="Deixe em branco para manter" />
              </TextField.Root>

              <p className="text-xs text-muted-foreground">
                Deixe a senha em branco para não alterá-la.
              </p>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" type="button" onPress={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" isDisabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </Modal.Footer>
          </form>
          <Modal.CloseTrigger />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Root>
  )
}
