import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@heroui/react'
import { useAuth } from '@/hooks/useAuth'
import { userColor } from '@/utils/colors'
import { supabase } from '@/lib/supabaseClient'
import {
  deactivateUser,
  deleteUser,
  listUsers,
  reactivateUser,
  sendPasswordResetEmail,
  generateRecoveryLink,
  sendCustomEmail,
  type AdminUser,
  type UserRoleName,
} from '@/lib/supabaseClient'
import CreateUserModal from '@/components/admin/CreateUserModal'
import EditUserModal from '@/components/admin/EditUserModal'

interface UserManagementDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type RoleFilter = 'all' | 'collaborator' | 'member' | 'admin'

export default function UserManagementDrawer({
  open,
  onOpenChange,
}: UserManagementDrawerProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [createInitialRole, setCreateInitialRole] = useState<UserRoleName>('member')
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [toDeactivate, setToDeactivate] = useState<AdminUser | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [toDelete, setToDelete] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [recoveryModal, setRecoveryModal] = useState<{
    user: AdminUser
    link: string
  } | null>(null)
  const [generatingUserId, setGeneratingUserId] = useState<string | null>(null)

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const {
    data: users = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
    enabled: open && user?.role === 'admin',
    staleTime: 0,
  })

  // Escuta evento customizado para pré-filtrar (ex: ao clicar em "Colaboradores" na barra lateral)
  useEffect(() => {
    function handleCustomOpen(e: Event) {
      const ce = e as CustomEvent<{ role?: RoleFilter }>
      if (ce.detail?.role) {
        setRoleFilter(ce.detail.role)
      } else {
        setRoleFilter('all')
      }
    }
    window.addEventListener('hub:open-users-drawer', handleCustomOpen)
    return () => window.removeEventListener('hub:open-users-drawer', handleCustomOpen)
  }, [])

  // Realtime: atualiza instantaneamente a lista de usuários quando qualquer profile for inserido/alterado
  useEffect(() => {
    if (!open) return
    const channelId = `admin-users-drawer-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
          void queryClient.invalidateQueries({ queryKey: ['project-members'] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [open, queryClient])

  const collaboratorsCount = users.filter((u) => u.role === 'collaborator').length
  const membersCount = users.filter((u) => u.role === 'member').length
  const adminsCount = users.filter((u) => u.role === 'admin').length

  const filteredUsers = useMemo(() => {
    let list = users
    if (roleFilter !== 'all') {
      list = list.filter((u) => u.role === roleFilter)
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((u) => {
        const name = (u.full_name ?? '').toLowerCase()
        const username = u.username.toLowerCase()
        const email = u.email.toLowerCase()
        return name.includes(q) || username.includes(q) || email.includes(q)
      })
    }
    return list
  }, [users, roleFilter, searchQuery])

  async function handleRefresh() {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['admin', 'users'], type: 'all' }),
      queryClient.refetchQueries({ queryKey: ['project-members'], type: 'all' }),
    ])
    toast.success('Lista de usuários atualizada!')
  }

  async function handleDeactivate(u: AdminUser) {
    if (u.id === user?.id) {
      toast.danger('Você não pode desativar sua própria conta.')
      return
    }
    setDeactivating(true)
    const { error: deactivateError } = await deactivateUser(u.id)
    setDeactivating(false)

    if (deactivateError) {
      toast.danger(deactivateError)
      return
    }

    toast.success(`Usuário ${u.username} desativado.`)
    setToDeactivate(null)
    void handleRefresh()
  }

  async function handleDelete(u: AdminUser) {
    if (u.id === user?.id) {
      toast.danger('Você não pode excluir sua própria conta.')
      return
    }
    setDeleting(true)
    const { error: deleteError } = await deleteUser(u.id)
    setDeleting(false)

    if (deleteError) {
      toast.danger(deleteError)
      return
    }

    toast.success(`Usuário @${u.username} excluído permanentemente.`)
    setToDelete(null)
    void handleRefresh()
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
    void handleRefresh()
  }

  function handleOpenCreate(defaultRole: UserRoleName = 'member') {
    setCreateInitialRole(defaultRole)
    setCreateOpen(true)
  }

  if (!open || user?.role !== 'admin') return null

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
              <h2 className="text-sm font-bold text-foreground">Gerenciar Usuários & Equipe</h2>
              <p className="text-[11px] text-muted-foreground">
                {users.length} usuário(s) cadastrado(s) • {collaboratorsCount} colaborador(es)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              title="Atualizar lista agora"
              disabled={isFetching}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <i className={`fa-solid fa-arrows-rotate text-xs ${isFetching ? 'fa-spin text-primary' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreate(roleFilter === 'collaborator' ? 'collaborator' : 'member')}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 cursor-pointer"
            >
              <i className="fa-solid fa-user-plus text-[10px]" />
              <span>{roleFilter === 'collaborator' ? 'Novo Colaborador' : 'Novo Usuário'}</span>
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

        {/* Filters & Search Header */}
        <div className="border-b border-border/80 bg-muted/20 px-6 py-3 space-y-2.5">
          {/* Tabs por Papel */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`h-7 px-3 rounded-full text-xs font-semibold transition cursor-pointer ${
                  roleFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-background border border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Todos ({users.length})
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter('collaborator')}
                className={`h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  roleFilter === 'collaborator'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-background border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'
                }`}
              >
                <i className="fa-solid fa-user-pen text-[10px]" />
                <span>Colaboradores ({collaboratorsCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter('member')}
                className={`h-7 px-3 rounded-full text-xs font-semibold transition cursor-pointer ${
                  roleFilter === 'member'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-background border border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Membros ({membersCount})
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter('admin')}
                className={`h-7 px-3 rounded-full text-xs font-semibold transition cursor-pointer ${
                  roleFilter === 'admin'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-background border border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Admins ({adminsCount})
              </button>
            </div>

            {roleFilter === 'collaborator' && (
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <i className="fa-solid fa-circle-info text-[10px]" />
                Visualizam apenas tarefas designadas a eles
              </span>
            )}
          </div>

          {/* Campo de Busca */}
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-xs text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por nome, username ou e-mail..."
              className="w-full rounded-lg border border-border bg-background pl-8 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            )}
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
                    <td className="p-8 text-center text-xs text-muted-foreground" colSpan={5}>
                      <i className="fa-solid fa-circle-notch fa-spin mr-2 text-primary" />
                      Carregando usuários...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td className="p-8 text-center text-xs text-muted-foreground" colSpan={5}>
                      <div className="flex flex-col items-center justify-center gap-2">
                        <i className="fa-solid fa-users text-2xl text-muted-foreground/40" />
                        <span className="font-semibold text-foreground">
                          {searchQuery
                            ? 'Nenhum usuário corresponde à busca.'
                            : roleFilter === 'collaborator'
                            ? 'Nenhum colaborador cadastrado ainda.'
                            : 'Nenhum usuário encontrado.'}
                        </span>
                        {roleFilter === 'collaborator' && (
                          <button
                            type="button"
                            onClick={() => handleOpenCreate('collaborator')}
                            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 cursor-pointer"
                          >
                            <i className="fa-solid fa-user-plus text-[10px]" />
                            <span>Cadastrar Primeiro Colaborador</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
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
                                className="size-8 rounded-lg object-cover ring-1 ring-border shadow-2xs"
                              />
                            ) : (
                              <span
                                className="flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white shadow-2xs"
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
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              u.role === 'admin'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : u.role === 'collaborator'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                : 'bg-muted text-muted-foreground border border-border/60'
                            }`}
                          >
                            {u.role === 'collaborator' && <i className="fa-solid fa-user-pen text-[9px]" />}
                            {u.role === 'admin' ? 'Admin' : u.role === 'collaborator' ? 'Colaborador' : 'Membro'}
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
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditUser(u)}
                              title="Editar dados e permissões"
                              className="flex size-7 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer shadow-2xs"
                            >
                              <i className="fa-solid fa-pen text-xs" />
                            </button>

                            <button
                              type="button"
                              disabled={generatingUserId === u.id}
                              onClick={() => handleSendResetPassword(u)}
                              title="Gerar link / redefinir senha"
                              className="flex size-7 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer shadow-2xs"
                            >
                              {generatingUserId === u.id ? (
                                <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                              ) : (
                                <i className="fa-solid fa-key text-xs" />
                              )}
                            </button>

                            {u.id !== user?.id && (
                              <>
                                {banned ? (
                                  <button
                                    type="button"
                                    onClick={() => handleReactivate(u)}
                                    title="Reativar conta"
                                    className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/30 text-emerald-600 transition hover:bg-emerald-500/10 cursor-pointer shadow-2xs"
                                  >
                                    <i className="fa-solid fa-rotate-left text-xs" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setToDeactivate(u)}
                                    title="Desativar conta"
                                    className="flex size-7 items-center justify-center rounded-lg border border-rose-500/30 text-rose-500 transition hover:bg-rose-500/10 cursor-pointer shadow-2xs"
                                  >
                                    <i className="fa-solid fa-user-slash text-xs" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setToDelete(u)}
                                  title="Excluir usuário permanentemente"
                                  className="flex size-7 items-center justify-center rounded-lg border border-destructive/30 text-destructive transition hover:bg-destructive/10 cursor-pointer shadow-2xs"
                                >
                                  <i className="fa-solid fa-trash-can text-xs" />
                                </button>
                              </>
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
        <div className="flex items-center justify-between border-t border-border bg-card/95 px-6 py-3 backdrop-blur">
          <span className="text-xs text-muted-foreground">
            Exibindo <strong>{filteredUsers.length}</strong> de <strong>{users.length}</strong> usuário(s)
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border/80 bg-background px-4 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer shadow-2xs"
          >
            Fechar
          </button>
        </div>
      </div>

      <CreateUserModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void handleRefresh()}
        initialRole={createInitialRole}
      />

      {editUser && (
        <EditUserModal
          user={editUser}
          open={editUser !== null}
          onOpenChange={(open) => !open && setEditUser(null)}
          onUpdated={() => void handleRefresh()}
        />
      )}

      {/* Confirmação de Desativação */}
      {toDeactivate && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => !deactivating && setToDeactivate(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
                <i className="fa-solid fa-user-slash text-base" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Desativar Usuário</h3>
                <p className="text-xs text-muted-foreground">Esta ação bloqueia o acesso à plataforma</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Tem certeza que deseja desativar a conta de{' '}
              <strong className="text-foreground">@{toDeactivate.username}</strong> ({toDeactivate.email})? O usuário não conseguirá mais fazer login.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={deactivating}
                onClick={() => setToDeactivate(null)}
                className="rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deactivating}
                onClick={() => handleDeactivate(toDeactivate)}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
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

      {/* Modal de Confirmação de Exclusão Permanente */}
      {toDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <i className="fa-solid fa-trash-can text-base" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Excluir Usuário</h3>
                <p className="text-xs text-muted-foreground">Esta ação é permanente e irreversível.</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Tem certeza que deseja excluir permanentemente o usuário{' '}
              <strong className="text-foreground">@{toDelete.username}</strong>
              {toDelete.full_name ? ` (${toDelete.full_name})` : ''}?
              <br />
              <br />
              O usuário será completamente removido do sistema e desvinculado de todas as tarefas e projetos.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setToDelete(null)}
                className="rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete(toDelete)}
                className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow-xs transition hover:bg-destructive/90 disabled:opacity-50 cursor-pointer"
              >
                {deleting ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-trash-can text-xs" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Link de Recuperação / Senha */}
      {recoveryModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setRecoveryModal(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <i className="fa-solid fa-key text-xs" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Link de Redefinição de Senha</h3>
                  <p className="text-xs text-muted-foreground">@{recoveryModal.user.username}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecoveryModal(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              O link seguro para definição de senha de <strong>{recoveryModal.user.email}</strong> foi gerado com sucesso:
            </p>

            <div className="relative">
              <textarea
                readOnly
                value={recoveryModal.link}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-muted/40 p-2.5 font-mono text-[11px] text-foreground focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button
                type="button"
                disabled={isSendingEmail}
                onClick={async () => {
                  setIsSendingEmail(true)
                  try {
                    const { error } = await sendCustomEmail({
                      to: recoveryModal.user.email,
                      subject: 'Redefinição de Senha - Hub Luz Negra',
                      html: `
                        <p>Olá <strong>${recoveryModal.user.full_name || recoveryModal.user.username}</strong>,</p>
                        <p>Seu link para definir uma nova senha no Hub da Editora Luz Negra está pronto:</p>
                        <p><a href="${recoveryModal.link}" style="background:#4f46e5;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;">Definir Minha Senha</a></p>
                        <p style="color:#666;font-size:12px;">Se você não solicitou este link, ignore esta mensagem.</p>
                      `,
                    })
                    if (error) {
                      toast.danger(`Erro ao enviar e-mail: ${error}`)
                    } else {
                      toast.success(`E-mail com o link enviado para ${recoveryModal.user.email}!`)
                    }
                  } finally {
                    setIsSendingEmail(false)
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50 cursor-pointer"
              >
                {isSendingEmail ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                    <span>Enviando...</span>
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
                onClick={() => {
                  void navigator.clipboard.writeText(recoveryModal.link)
                  toast.success('Link copiado!')
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 cursor-pointer"
              >
                <i className="fa-solid fa-copy text-xs" />
                <span>Copiar Link</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
