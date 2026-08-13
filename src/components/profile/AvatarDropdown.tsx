import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avatar, Badge, Dropdown } from '@heroui/react'
import { useAuth } from '@/hooks/useAuth'
import { userColor } from '@/utils/colors'
import { isInFerias } from '@/utils/format'
import ProfileModal from '@/components/profile/ProfileModal'

export default function AvatarDropdown() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)

  const displayName = user?.full_name ?? user?.username ?? 'Usuário'
  const onFerias = isInFerias(user)

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger>
          <Avatar size="sm" style={{ backgroundColor: userColor(user?.id ?? '') }} className="cursor-pointer">
            <Avatar.Fallback className="bg-transparent text-white">
              {displayName.charAt(0).toUpperCase()}
            </Avatar.Fallback>
            {onFerias && (
              <Badge color="warning" placement="bottom-right">
                <Badge.Label />
              </Badge>
            )}
          </Avatar>
        </Dropdown.Trigger>
        <Dropdown.Popover>
          <Dropdown.Menu>
            <Dropdown.Item key="__user" isDisabled className="cursor-default opacity-100">
              <span className="block">
                <span className="block font-medium">{displayName}</span>
                <span className="block text-xs text-muted-foreground">@{user?.username}</span>
                {onFerias && (
                  <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <i className="fa-solid fa-umbrella-beach" />
                    Em Férias
                  </span>
                )}
              </span>
            </Dropdown.Item>
            <Dropdown.Item key="perfil" onAction={() => setProfileOpen(true)}>
              <i className="fa-solid fa-user mr-2" />
              Perfil
            </Dropdown.Item>
            {!onFerias && (
              <Dropdown.Item key="ferias" onAction={() => setProfileOpen(true)}>
                <i className="fa-solid fa-umbrella-beach mr-2" />
                Férias
              </Dropdown.Item>
            )}
            {user?.role === 'admin' && (
              <Dropdown.Item
                key="usuarios"
                onAction={() => navigate('/dashboard/admin/users')}
              >
                <i className="fa-solid fa-users mr-2" />
                Gerenciar Usuários
              </Dropdown.Item>
            )}
            <Dropdown.Item key="sair" onAction={() => void signOut()}>
              <i className="fa-solid fa-right-from-bracket mr-2" />
              Sair
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}