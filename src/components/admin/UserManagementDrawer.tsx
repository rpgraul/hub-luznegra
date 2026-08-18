import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@heroui/react'
import { useAuth } from '@/hooks/useAuth'
import { userColor } from '@/utils/colors'
import {
  deactivateUser,
  listUsers,
  reactivateUser,
  sendPasswordResetEmail,
  generateRecoveryLink,
  sendCustomEmail,
  type AdminUser,
} from '@/lib/supabaseClient'
import CreateUserModal from '@/components/admin/CreateUserModal'
import EditUserModal from '@/components/admin/EditUserModal'

interface UserManagementDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function UserManagementDrawer({
  open,
  onOpenChange,
}: UserManagementDrawerProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [toDeactivate, setToDeactivate] = useState<AdminUser | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [recoveryModal, setRecoveryModal] = useState<{
    user: AdminUser
    link: string
  } | null>(null)
  const [generatingUserId, setGeneratingUserId] = useState<string | null>(null)

  const {
    data: users = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
    enabled: open && user?.role === 'admin',
  })

  if (!open || user?.role !== 'admin') return null

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  async function handleDeactivate(u: AdminUser) {
    setDeactivating(true)
    const { error: deactivateError } = await deactivateUser(u.id)
    setDeactivating(false)

    if (deactivateError) {
      toast.danger(deactivateError)
      return
    }

    toast.success(`Usuário ${u.username} desativado.`)
    setToDeactivate(null)
    refresh()
  }

  async function handleSendResetPassword(u: AdminUser) {
    setGeneratingUserId(u.id)
    toast.info(`Gerando link de redefinição para @${u.username}...`)

    const { link, error: linkError } = await generateRecoveryLink(u.email)
    setGeneratingUserId(null)

    if (linkError || !link) {
      const { error: emailErr } = await sendPasswordResetEmail(u.email)
      if (emailErr) {
        toast.danger(`Erro: ${emailErr}`)
      } else {
        toast.success(`E-mail de redefinição de senha enviado para ${u.email}!`)
      }
      return
    }

    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link de redefinição copiado para a área de transferência!')
    } catch {
      // ignore
    }

    setRecoveryModal({ user: u, link })
  }

  async function handleReactivate(u: AdminUser) {
    const { error: reactivateError } = await reactivateUser(u.id)
    if (reactivateError) {
      toast.danger(reactivateError)
      return
    }

    toast.success(`Usuário ${u.username} reativado.`)
    refresh()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-over Drawer lateral com largura ampla/ajustável */}
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[960px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-250 select-text">
        {/* Drawer Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <i className="fa-solid fa-users-gear text-xs" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Gerenciar Usuários</h2>
              <p className="text-[11px] text-muted-foreground">
                {users.length} membro(s) cadastrado(s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 cursor-pointer"
            >
              <i className="fa-solid fa-user-plus text-[10px]" />
              <span>Novo Usuário</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar painel"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <p className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              {error instanceof Error ? error.message : 'Erro ao carregar usuários.'}
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <table className="w-full border-collapse text-xs">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-bold text-foreground">Usuário</th>
                  <th className="px-4 py-2.5 text-left font-bold text-foreground">E-mail</th>
                  <th className="px-4 py-2.5 text-left font-bold text-foreground">Papel</th>
                  <th className="px-4 py-2.5 text-left font-bold text-foreground">Status</th>
                  <th className="px-4 py-2.5 text-right font-bold text-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isLoading ? (
                  <tr>
                    <td className="p-6 text-center text-xs text-muted-foreground" colSpan={5}>
                      <i className="fa-solid fa-circle-notch fa-spin mr-2 text-primary" />
                      Carregando usuários...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td className="p-6 text-center text-xs text-muted-foreground" colSpan={5}>
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const banned = u.banned_until !== null
                    const name = u.full_name ?? u.username
                    return (
                      <tr key={u.id} className="transition hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt={name}
                                className="size-7 rounded-lg object-cover ring-1 ring-border shadow-2xs"
                              />
                            ) : (
                              <span
                                className="flex size-7 items-center justify-center rounded-lg text-xs font-bold text-white shadow-2xs"
                                style={{ backgroundColor: userColor(u.id) }}
                              >
                                {name.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <span className="font-semibold text-foreground block truncate">
                                {name}
                              </span>
                              <span className="text-[11px] text-muted-foreground block truncate">
                                @{u.username}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {u.email}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              u.role === 'admin'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {u.role === 'admin' ? 'Admin' : 'Membro'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {banned ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 border border-rose-500/20">
                              <span className="size-1.5 rounded-full bg-rose-500" />
                              Desativado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-500/20">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              Ativo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={generatingUserId === u.id}
                              onClick={() => void handleSendResetPassword(u)}
                              title="Redefinir senha do usuário"
                              className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-60 cursor-pointer shadow-2xs"
                            >
                              {generatingUserId === u.id ? (
                                <i className="fa-solid fa-circle-notch fa-spin" />
                              ) : (
                                <i className="fa-solid fa-key" />
                              )}
                              <span>Senha</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditUser(u)}
                              className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
                            >
                              <i className="fa-solid fa-pen" />
                              <span>Editar</span>
                            </button>
                            {banned ? (
                              <button
                                type="button"
                                onClick={() => void handleReactivate(u)}
                                className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 transition hover:bg-emerald-500/20 cursor-pointer shadow-2xs"
                              >
                                <span>Reativar</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setToDeactivate(u)}
                                className="flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400 transition hover:bg-rose-500/20 cursor-pointer shadow-2xs"
                              >
                                <span>Desativar</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="flex h-14 shrink-0 items-center justify-end border-t border-border bg-card/95 px-6 backdrop-blur">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border bg-background px-4 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
          >
            Fechar
          </button>
        </div>
      </div>

      <CreateUserModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
      />

      {editUser && (
        <EditUserModal
          user={editUser}
          open={editUser !== null}
          onOpenChange={(open) => !open && setEditUser(null)}
          onUpdated={refresh}
        />
      )}

      {/* Confirmação de Desativação */}
      {toDeactivate && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => !deactivating && setToDeactivate(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-500">
              <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10">
                <i className="fa-solid fa-triangle-exclamation text-lg" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Desativar Conta</h3>
                <p className="text-xs text-muted-foreground">@{toDeactivate.username}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              O usuário não conseguirá mais fazer login ou acessar as tarefas da Editora. A conta pode ser reativada a qualquer momento.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={deactivating}
                onClick={() => setToDeactivate(null)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deactivating}
                onClick={() => void handleDeactivate(toDeactivate)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition shadow-xs disabled:opacity-60"
              >
                {deactivating ? 'Desativando...' : 'Sim, Desativar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Link de Redefinição */}
      {recoveryModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setRecoveryModal(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <i className="fa-solid fa-key text-base" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Redefinição de Senha</h3>
                  <p className="text-xs text-muted-foreground">
                    Para @{recoveryModal.user.username} ({recoveryModal.user.email})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecoveryModal(null)}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </div>

            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <i className="fa-solid fa-circle-check text-sm" />
              <span>Link exclusivo gerado com sucesso! Já foi copiado para sua área de transferência.</span>
            </div>

            <div>
              <label className="text-xs font-bold text-foreground">Link de Acesso Direto</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  readOnly
                  value={recoveryModal.link}
                  className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(recoveryModal.link)
                    toast.success('Link copiado!')
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 cursor-pointer"
                >
                  <i className="fa-solid fa-copy text-xs" />
                  <span>Copiar</span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-border gap-2">
              <button
                type="button"
                disabled={isSendingEmail}
                onClick={async () => {
                  if (!recoveryModal?.user?.email || !recoveryModal?.link) return
                  setIsSendingEmail(true)
                  const recipientName = recoveryModal.user.full_name || recoveryModal.user.username
                  const { success, error: sendErr } = await sendCustomEmail({
                    to: recoveryModal.user.email,
                    subject: 'Redefinição de Senha - Hub Luz Negra',
                    html: `
                      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
                        <h2 style="color: #0f172a; margin-bottom: 16px;">Redefinição de Senha</h2>
                        <p>Olá, <strong>${recipientName}</strong>,</p>
                        <p>Foi solicitada a redefinição de senha para sua conta no <strong>Hub da Editora Luz Negra</strong>.</p>
                        <p style="margin: 24px 0;">
                          <a href="${recoveryModal.link}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                            Definir Nova Senha
                          </a>
                        </p>
                        <p style="font-size: 13px; color: #64748b;">
                          Se o botão acima não funcionar, copie e cole o link abaixo no seu navegador:<br/>
                          <a href="${recoveryModal.link}" style="color: #2563eb; word-break: break-all;">${recoveryModal.link}</a>
                        </p>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                        <p style="font-size: 12px; color: #94a3b8;">
                          Se você não solicitou esta alteração, ignore este e-mail. O link expira em 24 horas.
                        </p>
                      </div>
                    `,
                  })
                  setIsSendingEmail(false)
                  if (!success || sendErr) {
                    toast.danger(`Erro ao enviar e-mail: ${sendErr || 'Falha desconhecida'}`)
                  } else {
                    toast.success(`E-mail de redefinição enviado para ${recoveryModal.user.email}!`)
                  }
                }}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
              >
                {isSendingEmail ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                    <span>Enviando e-mail...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-paper-plane text-xs" />
                    <span>Enviar por E-mail</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setRecoveryModal(null)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
