import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Button, TextField, Label, Input, Checkbox } from '@heroui/react'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const { signIn, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: signInError } = await signIn(identifier, password, remember)

    if (signInError) {
      setError(signInError)
      setSubmitting(false)
      return
    }

    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-xl border bg-background p-8 shadow-sm"
      >
        <div className="space-y-1">
          <i className="fa-solid fa-list-check text-2xl text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Hub</h1>
          <p className="text-sm text-muted-foreground">
            Entre com seu usuário ou e-mail
          </p>
        </div>

        <TextField.Root
          value={identifier}
          onChange={setIdentifier}
          autoComplete="username"
          isRequired
          autoFocus
        >
          <Label>Usuário ou E-mail</Label>
          <Input />
        </TextField.Root>

        <TextField.Root
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="current-password"
          isRequired
        >
          <Label>Senha</Label>
          <Input />
        </TextField.Root>

        <Checkbox isSelected={remember} onChange={setRemember}>
          Manter logado
        </Checkbox>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" isDisabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </div>
  )
}