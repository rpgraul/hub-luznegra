import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@heroui/react'
import { useAuth } from '@/hooks/useAuth'
import { userColor } from '@/utils/colors'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { supabase } from '@/lib/supabaseClient'
import type { UserRole } from '@/types/database'
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

type RoleFilter = 'all' | 'collaborator' | 'member' | 'admin'

export default function UserManagement() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const paramRole = searchParams.get('role') as RoleFilter | null
  const initialRole: RoleFilter =
    paramRole && ['all', 'collaborator', 'member', 'admin'].includes(paramRole)
      ? paramRole
      : 'all'

  const [roleFilter, setRoleFilter] = useState<RoleFilter>(initialRole)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [roleToCreate, setRoleToCreate] = useState<UserRole>('member')
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
  })

  // Sincroniza se o param role mudar na URL
  useEffect(() => {
    if (paramRole && ['all', 'collaborator', 'member', 'admin'].includes(paramRole)) {
      setRoleFilter(paramRole)
    }
  }, [paramRole])

  // Realtime: atualiza instantaneamente a lista de usuários quando qualquer profile for inserido/alterado
  useEffect(() => {
    const channelId = `admin-users-page-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void queryClient.refetchQueries({ queryKey: ['admin', 'users'], type: 'all' })
          void queryClient.refetchQueries({ queryKey: ['project-members'], type: 'all' })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  // Contagens por papel
  const counts = useMemo(() => {
    return {
      all: users.length,
      collaborator: users.filter((u) => u.role === 'collaborator').length,
      member: users.filter((u) => u.role === 'member' || !u.role).length,
      admin: users.filter((u) => u.role === 'admin').length,
    }
  }, [users])

  // Lista filtrada por papel e termo de busca
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter === 'collaborator' && u.role !== 'collaborator') return false
      if (roleFilter === 'member' && u.role !== 'member' && u.role) return false
      if (roleFilter === 'admin' && u.role !== 'admin') return false

      if (!q) return true
      const name = (u.full_name ?? '').toLowerCase()
      const uname = u.username.toLowerCase()
      const email = u.email.toLowerCase()
      return name.includes(q) || uname.includes(q) || email.includes(q)
    })
  }, [users, roleFilter, search])

  if (user?.role !== 'admin') {
    return (
      <DashboardLayout>
        <main className="p-8 text-center text-sm text-muted-foreground">
          <i className="fa-solid fa-lock mr-2" />
          Acesso restrito a administradores.
        </main>
      </DashboardLayout>
    )
  }

  async function refresh() {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['admin', 'users'], type: 'all' }),
      queryClient.refetchQueries({ queryKey: ['project-members'], type: 'all' }),
    ])
  }

  function handleSelectRoleFilter(filter: RoleFilter) {
    setRoleFilter(filter)
    if (filter === 'all') {
      searchParams.delete('role')
    } else {
      searchParams.set('role', filter)
    }
    setSearchParams(searchParams, { replace: true })
  }

  function handleOpenCreate(defaultRole: UserRole = 'member') {
    setRoleToCreate(defaultRole)
    setCreateOpen(true)
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
    void refresh()
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
    void refresh()
  }

  return (
    <DashboardLayout>
      <main className="p-6">
      {/* Header com Ações Rápidas */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Gerenciar Usuários & Colaboradores</h1>
          <p className="text-sm text-muted-foreground">
            {users.length} usuário(s) cadastrado(s) • Atualização em tempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            title="Atualizar lista agora"
            className="flex size-9 items-center justify-center rounded-lg border border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer shadow-2xs"
          >
            <i className="fa-solid fa-arrows-rotate text-xs" />
          </button>
          <button
            type="button"
            onClick={() => handleOpenCreate('collaborator')}
            className="flex items-center gap-2 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3.5 py-2 text-sm font-semibold text-amber-600 dark:text-amber-400 shadow-xs transition hover:bg-amber-500/25 cursor-pointer"
          >
            <i className="fa-solid fa-user-pen text-xs" />
            <span>Novo Colaborador</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenCreate('member')}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 cursor-pointer"
          >
            <i className="fa-solid fa-user-plus text-xs" />
            <span>Novo Usuário</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Abas / Pills por Papel */}
        <div className="inline-flex rounded-lg border border-border/80 bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => handleSelectRoleFilter('all')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              roleFilter === 'all'
                ? 'bg-background text-foreground shadow-2xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Todos</span>
            <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectRoleFilter('collaborator')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              roleFilter === 'collaborator'
                ? 'bg-amber-500 text-white shadow-2xs font-bold'
                : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            <i className="fa-solid fa-user-pen text-[11px]" />
            <span>Colaboradores</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                roleFilter === 'collaborator'
                  ? 'bg-amber-700/60 text-white'
                  : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold'
              }`}
            >
              {counts.collaborator}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectRoleFilter('member')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              roleFilter === 'member'
                ? 'bg-background text-foreground shadow-2xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Membros</span>
            <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
              {counts.member}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectRoleFilter('admin')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              roleFilter === 'admin'
                ? 'bg-background text-foreground shadow-2xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Admins</span>
            <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
              {counts.admin}
            </span>
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative min-w-64">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome, username ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border/80 bg-background py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <i className="fa-solid fa-xmark text-xs" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Erro ao carregar usuários.'}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <table className="w-full border-collapse text-xs">
          <thead className="border-b border-border bg-slate-100 dark:bg-slate-800">
            <tr className="text-slate-800 dark:text-slate-100">
              <th className="px-4 py-3 text-left font-bold text-slate-800 dark:text-slate-100">Usuário</th>
              <th className="px-4 py-3 text-left font-bold text-slate-800 dark:text-slate-100">E-mail</th>
              <th className="px-4 py-3 text-left font-bold text-slate-800 dark:text-slate-100">Papel</th>
              <th className="px-4 py-3 text-left font-bold text-slate-800 dark:text-slate-100">Status</th>
              <th className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-100">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr>
                <td className="p-6 text-center text-sm text-muted-foreground" colSpan={5}>
                  <i className="fa-solid fa-circle-notch fa-spin mr-2" />
                  Carregando usuários...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td className="p-6 text-center text-sm text-muted-foreground" colSpan={5}>
                  {search
                    ? 'Nenhum usuário corresponde à busca.'
                    : roleFilter === 'collaborator'
                      ? 'Nenhum colaborador cadastrado ainda. Clique em "Novo Colaborador" para adicionar.'
                      : 'Nenhum usuário encontrado.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const banned = u.banned_until !== null
                const name = u.full_name ?? u.username
                return (
                  <tr key={u.id} className="transition hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white shadow-2xs"
                          style={{ backgroundColor: userColor(u.id) }}
                        >
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt={name}
                              className="size-full object-cover"
                            />
                          ) : (
                            u.username.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground text-xs">{name}</div>
                          <div className="text-[11px] text-muted-foreground">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.role === 'admin' ? (
                        <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">
                          Admin
                        </span>
                      ) : u.role === 'collaborator' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          <i className="fa-solid fa-user-pen text-[9px]" />
                          Colaborador
                        </span>
                      ) : (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-border/60">
                          Membro
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {banned ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-600 border border-rose-500/20">
                          <span className="size-1.5 rounded-full bg-rose-500" />
                          Desativado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 border border-emerald-500/20">
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
                          title="Gerar link de redefinição para enviar por WhatsApp"
                          className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-60 cursor-pointer shadow-2xs"
                        >
                          {generatingUserId === u.id ? (
                            <>
                              <i className="fa-solid fa-circle-notch fa-spin text-[10px]" />
                              <span>Gerando...</span>
                            </>
                          ) : (
                            <>
                              <i className="fa-solid fa-key text-[10px]" />
                              <span>Redefinir Senha</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditUser(u)}
                          className="flex items-center gap-1 rounded-md border border-border/80 bg-background px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
                        >
                          <i className="fa-solid fa-pen text-[10px]" />
                          <span>Editar</span>
                        </button>
                        {banned ? (
                          <button
                            type="button"
                            onClick={() => void handleReactivate(u)}
                            className="flex items-center gap-1 rounded-md border border-border/80 bg-background px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
                          >
                            <i className="fa-solid fa-rotate-left text-[10px]" />
                            <span>Reativar</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setToDeactivate(u)}
                            className="flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/20 cursor-pointer shadow-2xs"
                          >
                            <i className="fa-solid fa-user-slash text-[10px]" />
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

      <CreateUserModal
        open={createOpen}
        initialRole={roleToCreate}
        onOpenChange={setCreateOpen}
        onCreated={() => void refresh()}
      />

      {editUser && (
        <EditUserModal
          user={editUser}
          open={editUser !== null}
          onOpenChange={(open) => !open && setEditUser(null)}
          onUpdated={refresh}
        />
      )}

      {toDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
                <i className="fa-solid fa-triangle-exclamation text-base" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Desativar Usuário</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confirmar bloqueio de acesso
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs text-foreground/80 leading-relaxed">
              Tem certeza de que deseja desativar o usuário{' '}
              <strong className="text-foreground">
                {toDeactivate.full_name ?? toDeactivate.username} (@{toDeactivate.username})
              </strong>
              ? Ele perderá o acesso ao sistema imediatamente. Esta ação poderá ser revertida a qualquer momento.
            </p>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setToDeactivate(null)}
                className="rounded-lg border border-border/80 bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deactivating}
                onClick={() => toDeactivate && void handleDeactivate(toDeactivate)}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {deactivating ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                    <span>Desativando...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-user-slash text-xs" />
                    <span>Confirmar Desativação</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {recoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <i className="fa-solid fa-key text-base" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Link de Redefinição de Senha</h3>
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
                  className="flex-1 rounded-lg border border-border/80 bg-muted/40 px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none select-all"
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

            {/* Actions: Send Email & Close */}
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
                    toast.success(`E-mail de redefinição enviado com sucesso para ${recoveryModal.user.email}!`)
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
                className="rounded-lg border border-border/80 bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </DashboardLayout>
  )
}
