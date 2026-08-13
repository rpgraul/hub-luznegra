// Edge Function: envio de e-mail via Resend (página de teste).
// A chave RESEND_API_KEY vive apenas nas variáveis de ambiente do Supabase —
// nunca é exposta ao frontend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'
import { json, handleOptions } from '../_shared/cors.ts'

const FROM = 'no-reply@hub.luznegra.com.br'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: false, error: 'Não autorizado.' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: caller } = await admin.auth.getUser(token)
    if (!caller.user) return json({ success: false, error: 'Não autorizado.' }, 401)

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return json({ success: false, error: 'RESEND_API_KEY não configurada.' }, 500)
    }

    const body = (await req.json()) as { to?: string; subject?: string; html?: string }
    const { to, subject, html } = body

    if (!to || !EMAIL_REGEX.test(to)) {
      return json({ success: false, error: 'Informe um e-mail de destino válido.' }, 400)
    }
    if (!subject) {
      return json({ success: false, error: 'O assunto é obrigatório.' }, 400)
    }
    if (!html) {
      return json({ success: false, error: 'A mensagem é obrigatória.' }, 400)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    })

    const data = (await res.json()) as { id?: string; message?: string }

    if (!res.ok) {
      console.error('resend error:', res.status, data)
      return json(
        { success: false, error: data.message ?? 'Falha ao enviar o e-mail.' },
        res.status >= 500 ? 502 : 400,
      )
    }

    return json({ success: true, id: data.id })
  } catch (err) {
    console.error('send-email error:', err)
    return json(
      { success: false, error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
    )
  }
})