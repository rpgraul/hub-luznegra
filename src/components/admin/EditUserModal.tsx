import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
          <DialogDescription>
            Deixe a senha em branco para não alterá-la.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="eu-username">Username</Label>
            <Input
              id="eu-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="eu-email">E-mail</Label>
            <Input
              id="eu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="eu-fullname">Nome completo</Label>
            <Input
              id="eu-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="eu-role">Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRoleName)}>
              <SelectTrigger id="eu-role">
                <SelectValue placeholder="Selecione o papel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Membro</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eu-password">Nova senha (opcional)</Label>
            <Input
              id="eu-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Deixe em branco para manter"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}