import { useNavigate } from 'react-router'
import type { DefaultView, Project } from '@/types/database'
import {
  Button,
  Select,
  ListBox,
  Switch,
} from '@heroui/react'
import NotificationBell from '@/components/notifications/NotificationBell'
import AvatarDropdown from '@/components/profile/AvatarDropdown'

const VIEWS: Array<{ id: DefaultView; label: string; icon: string }> = [
  { id: 'gantt', label: 'Gantt', icon: 'fa-chart-gantt' },
  { id: 'kanban', label: 'Kanban', icon: 'fa-columns' },
  { id: 'lista', label: 'Lista', icon: 'fa-list-ul' },
  { id: 'calendario', label: 'Calendário', icon: 'fa-calendar-days' },
]

interface TopBarProps {
  projects: Project[]
  activeProjectId: string | null
  onProjectChange: (projectId: string | null) => void
  showAllTasks: boolean
  onShowAllChange: (show: boolean) => void
  onCreateProject: () => void
  view: DefaultView
  onViewChange: (view: DefaultView) => void
}

const ALL_PROJECTS = '__all__'

export default function TopBar({
  projects,
  activeProjectId,
  onProjectChange,
  showAllTasks,
  onShowAllChange,
  onCreateProject,
  view,
  onViewChange,
}: TopBarProps) {
  const navigate = useNavigate()
  const selectValue = activeProjectId ?? ALL_PROJECTS

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center gap-4 border-b bg-background px-4">
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="flex shrink-0 items-center gap-2 text-lg font-semibold"
      >
        <img
          src="/logo.svg"
          alt="Logo da Editora Luz Negra"
          className="h-8 w-auto"
        />
        <span className="hidden sm:inline">Editora Luz Negra</span>
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <Select.Root
          selectedKey={selectValue}
          onSelectionChange={(value) =>
            onProjectChange(value === ALL_PROJECTS ? null : (value as string))
          }
          aria-label="Filtrar por projeto"
          className="w-full max-w-xs"
          placeholder={
            projects.length === 0 ? 'Sem projetos' : 'Todos os projetos'
          }
        >
          <Select.Trigger className="w-full">
            <Select.Value />
          </Select.Trigger>
          <Select.Popover>
            <ListBox.Root>
              {projects.length === 0 ? (
                <ListBox.Item id={ALL_PROJECTS} isDisabled textValue="Nenhum projeto disponível">
                  Nenhum projeto disponível
                </ListBox.Item>
              ) : (
                <>
                  <ListBox.Item id={ALL_PROJECTS} textValue="Todos os projetos">
                    <span className="inline-flex items-center gap-2">
                      <i className="fa-solid fa-layer-group text-muted-foreground" />
                      Todos os projetos
                    </span>
                  </ListBox.Item>
                  {projects.map((project) => (
                    <ListBox.Item key={project.id} id={project.id} textValue={project.name}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: project.color }}
                        />
                        {project.name}
                      </span>
                    </ListBox.Item>
                  ))}
                </>
              )}
            </ListBox.Root>
          </Select.Popover>
        </Select.Root>

        <Button
          variant="outline"
          isIconOnly
          onPress={onCreateProject}
          aria-label="Novo projeto"
        >
          <i className="fa-solid fa-plus" />
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            variant={view === v.id ? 'primary' : 'ghost'}
            size="sm"
            className="gap-2"
            onPress={() => onViewChange(v.id)}
            aria-pressed={view === v.id}
          >
            <i className={`fa-solid ${v.icon}`} />
            <span className="hidden sm:inline">{v.label}</span>
          </Button>
        ))}
      </div>

      <div
        className="flex shrink-0 items-center gap-2"
        title={
          showAllTasks
            ? 'Mostrando tarefas de todos'
            : 'Mostrando apenas as minhas tarefas'
        }
      >
        <Switch
          isSelected={showAllTasks}
          onChange={onShowAllChange}
          aria-label="Mostrar todas as tarefas"
          size="sm"
        />
        <span className="hidden text-xs text-muted-foreground md:inline">
          {showAllTasks ? 'Todos' : 'Minhas'}
        </span>
      </div>

      <NotificationBell />
      <AvatarDropdown />
    </header>
  )
}