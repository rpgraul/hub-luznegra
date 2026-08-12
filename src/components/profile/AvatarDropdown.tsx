import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/hooks/useAuth'
import { userColor } from '@/utils/colors'
import { isInFerias } from '@/utils/format'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ProfileModal from '@/components/profile/ProfileModal'

export default function AvatarDropdown() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)

  const displayName = user?.full_name ?? user?.username ?? 'Usuário'
  const onFerias = isInFerias(user)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full text-sm font-semibold text-white outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: userColor(user?.id ?? '') }}
            aria-label="Menu do usuário"
          >
            {displayName.charAt(0).toUpperCase()}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <p className="font-medium">{displayName}</p>
            <p className="text-xs font-normal text-muted-foreground">
              @{user?.username}
            </p>
            {onFerias && (
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                <i className="fa-solid fa-umbrella-beach" />
                Em Férias
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
            <i className="fa-solid fa-user mr-2" />
            Perfil
          </DropdownMenuItem>
          {!onFerias && (
            <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
              <i className="fa-solid fa-umbrella-beach mr-2" />
              Férias
            </DropdownMenuItem>
          )}
          {user?.role === 'admin' && (
            <DropdownMenuItem onSelect={() => navigate('/dashboard/admin/users')}>
              <i className="fa-solid fa-users mr-2" />
              Gerenciar Usuários
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <i className="fa-solid fa-right-from-bracket mr-2" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}