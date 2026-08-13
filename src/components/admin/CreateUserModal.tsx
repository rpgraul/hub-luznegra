import { useState, type FormEvent } from 'react'
import {
  toast,
  Button,
  Modal,
  TextField,
  Label,
  Input,
} from '@heroui/react'
import { createUser } from '@/lib/supabaseClient'

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
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setUsername('')
    setEmail('')
    setFullName('')
    setPassword('')
    setError(null)
  }

  function validate(): string | null {
    const normalized = username.trim().toLowerCase()
    if (!USERNAME_REGEX.test(normalized)) {
      return 'Username: mínimo 3 caracteres, sem espaços (letras, números, _ e .)'
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

    toast.success('Usuário criado com sucesso.')
    reset()
    onOpenChange(false)
    onCreated()
  }

  return (
    <Modal.Root isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.Header>
            <Modal.Heading>Novo Usuário</Modal.Heading>
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
                <Input placeholder="ex: joao.silva" />
              </TextField.Root>

              <TextField.Root value={email} onChange={setEmail} type="email" isRequired>
                <Label>E-mail</Label>
                <Input placeholder="joao@editora.com.br" />
              </TextField.Root>

              <TextField.Root value={fullName} onChange={setFullName}>
                <Label>Nome completo</Label>
                <Input placeholder="João da Silva" />
              </TextField.Root>

              <TextField.Root
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="new-password"
                isRequired
              >
                <Label>Senha temporária</Label>
                <Input />
              </TextField.Root>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" type="button" onPress={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" isDisabled={submitting}>
                {submitting ? 'Criando...' : 'Criar usuário'}
              </Button>
            </Modal.Footer>
          </form>
          <Modal.CloseTrigger />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Root>
  )
}
