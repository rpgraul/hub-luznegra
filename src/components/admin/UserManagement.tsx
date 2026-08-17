import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@heroui/react'
import { useAuth } from '@/hooks/useAuth'
import { userColor } from '@/utils/colors'
import DashboardLayout from '@/components/layout/DashboardLayout'
import {
  deactivateUser,
  listUsers,
  reactivateUser,
  type AdminUser,
} from '@/lib/supabaseClient'
import CreateUserModal from '@/components/admin/CreateUserModal'
import EditUserModal from '@/components/admin/EditUserModal'

export default function UserManagement() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [toDeactivate, setToDeactivate] = useState<AdminUser | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  const {
    data: users = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
  })

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
    <DashboardLayout>
      <main className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Gerenciar Usuários</h1>
          <p className="text-sm text-muted-foreground">
            {users.length} usuário(s) cadastrado(s)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 cursor-pointer"
        >
          <i className="fa-solid fa-user-plus text-xs" />
          <span>Novo Usuário</span>
        </button>
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
            ) : users.length === 0 ? (
              <tr>
                <td className="p-6 text-center text-sm text-muted-foreground" colSpan={5}>
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const banned = u.banned_until !== null
                const name = u.full_name ?? u.username
                return (
                  <tr key={u.id} className="transition hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-2xs"
                          style={{ backgroundColor: userColor(u.id) }}
                        >
                          {u.username.charAt(0).toUpperCase()}
                        </span>
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
    </main>
    </DashboardLayout>
  )
}
