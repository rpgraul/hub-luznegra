import { supabase } from '@/lib/supabaseClient'

export interface AIMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  action?: {
    type: string
    params?: Record<string, unknown>
  }
  actionResult?: Record<string, unknown> | null
  timestamp?: string
}

export interface SendAIMessageParams {
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  projectId?: string | null
  activeTaskId?: string | null
}

export interface AIResponse {
  reply: string
  action?: {
    type: string
    params?: Record<string, unknown>
  }
  actionResult?: Record<string, unknown> | null
}

export async function sendAIMessage(
  params: SendAIMessageParams,
): Promise<AIResponse> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: {
      message: params.message,
      history: params.history ?? [],
      context: {
        projectId: params.projectId,
        activeTaskId: params.activeTaskId,
      },
    },
  })

  if (error) {
    let msg = error.message
    if (error.context instanceof Response) {
      try {
        const body = (await error.context.json()) as { error?: string }
        if (body.error) msg = body.error
      } catch {
        // ignore
      }
    }
    throw new Error(msg || 'Erro ao comunicar com o Assistente de IA.')
  }

  return data as AIResponse
}
