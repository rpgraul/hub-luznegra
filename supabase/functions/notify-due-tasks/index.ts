// Edge Function: lembrete de vencimento (24h antes) + dreno da fila de e-mails.
// Agendamentos (supabase functions deploy --no-verify-jwt, depois schedules no
// painel Supabase → Edge Functions → schedule):
//   diário 07:00 America/Sao_Paulo → {"job": "due"}
//   a cada 5 minutos                → {"job": "queue"}
// A chave RESEND_API_KEY vive apenas nas variáveis de ambiente.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, handleOptions } from '../_shared/cors.ts'

const FROM = 'no-reply@hub.luznegra.com.br'
const APP_URL = 'https://hub.site-da-empresa.com.br'
const TZ = 'America/Sao_Paulo'
const MAX_ATTEMPTS = 3
const QUEUE_BATCH = 20

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

function dateInDays(days: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + days * 86_400_000))
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function reminderEmail(
  title: string,
  projectName: string | null,
  taskId: string,
): { subject: string; html: string } {
  return {
    subject: 'Lembrete: tarefa vence amanhã',
    html: [
      '<h2>Lembrete de vencimento</h2>',
      `<p>A tarefa <strong>${escapeHtml(title)}</strong> vence amanhã (${dateInDays(1)}).</p>`,
      projectName ? `<p>Projeto: ${escapeHtml(projectName)}</p>` : '',
      `<p><a href="${APP_URL}/task/${taskId}">Abrir tarefa no Hub</a></p>`,
    ].join(''),
  }
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) throw new Error('RESEND_API_KEY não configurada.')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(data?.message ?? `Resend retornou HTTP ${res.status}`)
  }
}

async function jobDue(): Promise<{ reminders: number }> {
  const tomorrow = dateInDays(1)

  const { data: tasks, error: tasksError } = await admin
    .from('tasks')
    .select('id, title, project_id, assigned_to')
    .eq('due_date', tomorrow)
    .not('status', 'eq', 'done')
    .not('assigned_to', 'is', null)

  if (tasksError) throw new Error(`consultando tarefas: ${tasksError.message}`)
  if (tasks.length === 0) return { reminders: 0 }

  const taskIds = tasks.map((t) => t.id)
  const assignees = [...new Set(tasks.map((t) => t.assigned_to))]

  // Dedupe: já notificados deste vencimento
  const { data: existing } = await admin
    .from('notifications')
    .select('task_id, user_id')
    .eq('type', 'due_date_reminder')
    .in('task_id', taskIds)

  const reminded = new Set(
    (existing ?? []).map((n) => `${n.task_id}|${n.user_id}`),
  )

  // Férias: ignora quem estiver de férias cobrindo amanhã
  const { data: feriasList } = await admin
    .from('profiles')
    .select('id, ferias_inicio, ferias_fim')
    .in('id', assignees)

  const onVacation = new Set(
    (feriasList ?? [])
      .filter(
        (p) =>
          p.ferias_inicio &&
          p.ferias_fim &&
          p.ferias_inicio <= tomorrow &&
          p.ferias_fim >= tomorrow,
      )
      .map((p) => p.id),
  )

  const projectIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))]
  const { data: projects } = await admin
    .from('projects')
    .select('id, name')
    .in('id', projectIds)
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]))

  // E-mails dos destinatários (e-mail mora em auth.users)
  const { data: authUsers } = await admin.auth.admin.listUsers({
    perPage: 1000,
  })
  const emailByUser = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email]),
  )

  let reminders = 0
  for (const task of tasks) {
    const userId = task.assigned_to
    if (onVacation.has(userId)) continue
    if (reminded.has(`${task.id}|${userId}`)) continue

    await admin.from('notifications').insert({
      user_id: userId,
      type: 'due_date_reminder',
      content: `A tarefa "${task.title}" vence amanhã (${tomorrow}).`,
      link: `/task/${task.id}`,
      task_id: task.id,
    })

    const emailTo = emailByUser.get(userId)
    if (emailTo) {
      const { subject, html } = reminderEmail(
        task.title,
        task.project_id ? (projectName.get(task.project_id) ?? null) : null,
        task.id,
      )
      await admin.from('email_queue').insert({
        to_email: emailTo,
        subject,
        html,
        task_id: task.id,
      })
    }

    reminders++
  }

  return { reminders }
}

async function jobQueue(): Promise<{ sent: number; failed: number }> {
  const { data: pending, error } = await admin
    .from('email_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(QUEUE_BATCH)

  if (error) throw new Error(`consultando fila: ${error.message}`)

  let sent = 0
  let failed = 0

  for (const item of pending ?? []) {
    try {
      await sendViaResend(item.to_email, item.subject, item.html)
      await admin.from('email_queue').update({ status: 'sent' }).eq('id', item.id)
      sent++
    } catch (err) {
      const attempts = (item.attempts ?? 0) + 1
      await admin
        .from('email_queue')
        .update({
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
        })
        .eq('id', item.id)
      failed++
      console.error('e-mail falhou:', item.id, err)
    }
  }

  return { sent, failed }
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    const body = (await req.json().catch(() => ({}))) as { job?: string }
    const job = body.job ?? 'due'

    if (job === 'queue') {
      const result = await jobQueue()
      return json({ ok: true, ...result })
    }

    const result = await jobDue()
    return json({ ok: true, ...result })
  } catch (err) {
    console.error('notify-due-tasks error:', err)
    return json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
    )
  }
})