import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { sendTestEmail } from '@/lib/api/email'

export default function EmailTest() {
  const [to, setTo] = useState('rpgraul@gmail.com')
  const [subject, setSubject] = useState('Teste Hub - Email')
  const [html, setHtml] = useState('Olá! Este é um teste de e-mail do Hub.')
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSending(true)

    try {
      const res = await sendTestEmail(to.trim(), subject.trim(), html.trim())
      toast.success(
        res.id
          ? `E-mail enviado com sucesso (id: ${res.id}).`
          : 'E-mail enviado com sucesso.',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar o e-mail.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-6 rounded-xl border bg-background p-8 shadow-sm"
      >
        <div className="space-y-1">
          <i className="fa-solid fa-envelope text-2xl text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Teste de E-mail</h1>
          <p className="text-sm text-muted-foreground">
            Página temporária para validar o envio via Resend
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-to">E-mail para</Label>
          <Input
            id="email-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-subject">Assunto</Label>
          <Input
            id="email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-html">Mensagem</Label>
          <Textarea
            id="email-html"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={5}
            required
          />
        </div>

        <Button type="submit" disabled={sending} className="w-full">
          {sending ? 'Enviando...' : 'Enviar e-mail de teste'}
        </Button>
      </form>
    </div>
  )
}