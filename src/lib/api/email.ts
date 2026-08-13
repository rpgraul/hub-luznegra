import { supabase } from '@/lib/supabaseClient'

export interface SendEmailResponse {
  success: boolean
  id?: string
  error?: string
}

export async function sendTestEmail(
  to: string,
  subject: string,
  html: string,
): Promise<SendEmailResponse> {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to, subject, html },
  })

  if (error) {
    let message = error.message
    if (error.context instanceof Response) {
      try {
        const bodyText = await error.context.text()
        const parsed = JSON.parse(bodyText) as { error?: string }
        message = parsed.error ?? bodyText
      } catch {
        message = error.context.statusText
      }
    }
    throw new Error(message)
  }

  return data as SendEmailResponse
}