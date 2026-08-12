// ATENÇÃO: Este cliente tem privilégios administrativos. Use apenas em funções seguras.
//
// A SUPABASE_SERVICE_ROLE_KEY (formato sb_secret_...) ignora toda a RLS.
// Em produção ela NUNCA deve ser embarcada no bundle do frontend: qualquer
// pessoa com acesso à página poderia extraí-la e ler/escrever o banco inteiro.
//
// O Vite só expõe ao navegador variáveis com prefixo VITE_ — por isso a chave
// aqui SEMPRE deve ficar sem prefixo (SUPABASE_SERVICE_ROLE_KEY). Com isso,
// `import.meta.env.SUPABASE_SERVICE_ROLE_KEY` só resolve fora do bundle:
// scripts locais/tooling (com dotenv), testes ou Edge Functions.
//
// Nas Edge Functions o padrão usado neste repo é Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
// com o createClient do @supabase/supabase-js (ver supabase/functions/_shared/).
// No frontend, operações de admin devem continuar passando pelas Edge Functions
// (admin-users, project-members), e não por este cliente.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY as
  | string
  | undefined

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Variáveis de ambiente ausentes para o cliente admin: defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja .env.example). ' +
      'Lembre-se: sem o prefixo VITE_, esta chave só existe fora do bundle do navegador.',
  )
}

export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})