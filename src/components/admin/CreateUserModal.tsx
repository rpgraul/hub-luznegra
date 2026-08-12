import { useState, type FormEvent } from 'react'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Usuário</DialogTitle>
          <DialogDescription>
            A conta será criada com senha temporária. O e-mail de boas-vindas
            será enviado em breve.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cu-username">Username</Label>
            <Input
              id="cu-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ex: joao.silva"
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cu-email">E-mail</Label>
            <Input
              id="cu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="joao@editora.com.br"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cu-fullname">Nome completo</Label>
            <Input
              id="cu-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="João da Silva"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cu-password">Senha temporária</Label>
            <Input
              id="cu-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
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
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Criando...' : 'Criar usuário'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}