import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast, Button, Modal, Table } from '@heroui/react'
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
        <Button onPress={() => setCreateOpen(true)}>
          <i className="fa-solid fa-user-plus mr-2" />
          Novo Usuário
        </Button>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Erro ao carregar usuários.'}
        </p>
      )}

      <Table.Root>
        <Table.Content aria-label="Usuários">
          <Table.Header>
            <Table.Column isRowHeader>Usuário</Table.Column>
            <Table.Column>E-mail</Table.Column>
            <Table.Column>Papel</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column className="text-right">Ações</Table.Column>
          </Table.Header>
          <Table.Body>
            {isLoading ? (
              <Table.Row>
                <Table.Cell className="text-center text-sm text-muted-foreground" colSpan={5}>
                  Carregando...
                </Table.Cell>
              </Table.Row>
            ) : users.length === 0 ? (
              <Table.Row>
                <Table.Cell className="text-center text-sm text-muted-foreground" colSpan={5}>
                  Nenhum usuário encontrado.
                </Table.Cell>
              </Table.Row>
            ) : (
              users.map((u) => {
                const banned = u.banned_until !== null
                const name = u.full_name ?? u.username
                return (
                  <Table.Row key={u.id}>
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <span
                          className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: userColor(u.id) }}
                        >
                          {u.username.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="font-medium">{name}</div>
                          <div className="text-xs text-muted-foreground">@{u.username}</div>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{u.email}</Table.Cell>
                    <Table.Cell>
                      {u.role === 'admin' ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Admin
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Membro
                        </span>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {banned ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-destructive">
                          <span className="size-2 rounded-full bg-destructive" />
                          Desativado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                          <span className="size-2 rounded-full bg-emerald-500" />
                          Ativo
                        </span>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={() => setEditUser(u)}
                        >
                          <i className="fa-solid fa-pen mr-2 text-xs" />
                          Editar
                        </Button>
                        {banned ? (
                          <Button size="sm" onPress={() => void handleReactivate(u)}>
                            <i className="fa-solid fa-rotate-left mr-2 text-xs" />
                            Reativar
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            size="sm"
                            onPress={() => setToDeactivate(u)}
                          >
                            <i className="fa-solid fa-user-slash mr-2 text-xs" />
                            Desativar
                          </Button>
                        )}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })
            )}
          </Table.Body>
        </Table.Content>
      </Table.Root>

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

      <Modal.Root
        isOpen={toDeactivate !== null}
        onOpenChange={(open) => !open && setToDeactivate(null)}
      >
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.Header>
              <Modal.Heading>Desativar usuário</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm">
                {toDeactivate
                  ? `${toDeactivate.full_name ?? toDeactivate.username} perderá o acesso imediatamente. Esta ação pode ser revertida em "Reativar".`
                  : ''}
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" onPress={() => setToDeactivate(null)}>
                Cancelar
              </Button>
              <Button
                className="bg-destructive text-white"
                isDisabled={deactivating}
                onPress={() => toDeactivate && void handleDeactivate(toDeactivate)}
              >
                {deactivating ? 'Desativando...' : 'Desativar'}
              </Button>
            </Modal.Footer>
            <Modal.CloseTrigger />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Root>
      </main>
    </DashboardLayout>
  )
}
