import { useNavigate } from 'react-router'
import type { DefaultView, Project } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
        Hub
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <Select
          value={selectValue}
          onValueChange={(value) =>
            onProjectChange(value === ALL_PROJECTS ? null : value)
          }
        >
          <SelectTrigger
            className="w-full max-w-xs"
            aria-label="Filtrar por projeto"
          >
            <SelectValue
              placeholder={
                projects.length === 0 ? 'Sem projetos' : 'Todos os projetos'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {projects.length === 0 ? (
              <SelectItem value={ALL_PROJECTS} disabled>
                Nenhum projeto disponível
              </SelectItem>
            ) : (
              <>
                <SelectItem value={ALL_PROJECTS}>
                  <span className="inline-flex items-center gap-2">
                    <i className="fa-solid fa-layer-group text-muted-foreground" />
                    Todos os projetos
                  </span>
                </SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      {project.name}
                    </span>
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={onCreateProject}
          title="Novo projeto"
          aria-label="Novo projeto"
        >
          <i className="fa-solid fa-plus" />
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            variant={view === v.id ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-2"
            onClick={() => onViewChange(v.id)}
            aria-pressed={view === v.id}
            title={v.label}
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
          checked={showAllTasks}
          onCheckedChange={onShowAllChange}
          aria-label="Mostrar todas as tarefas"
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