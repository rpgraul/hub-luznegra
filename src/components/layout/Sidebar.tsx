import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@heroui/react'
import type { Project, Task } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'

interface SidebarProps {
  projects: Project[]
  activeProjectId: string | null
  onProjectChange: (projectId: string | null) => void
  onCreateProject: () => void
  showAllTasks: boolean
  onShowAllChange: (show: boolean) => void
  tasks?: Task[]
  onOpenAi?: () => void
}

export default function Sidebar({
  projects,
  activeProjectId,
  onProjectChange,
  onCreateProject,
  showAllTasks,
  onShowAllChange,
  tasks = [],
  onOpenAi,
}: SidebarProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Calculate task counts per project
  const taskCounts = projects.reduce<Record<string, number>>((acc, proj) => {
    acc[proj.id] = tasks.filter(
      (t) => t.project_id === proj.id && t.status !== 'done',
    ).length
    return acc
  }, {})

  const totalActiveTasks = tasks.filter((t) => t.status !== 'done').length

  const filteredProjects = searchQuery
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : projects

  if (collapsed) {
    return (
      <aside className="flex h-full w-16 shrink-0 flex-col items-center border-r border-border bg-card/95 py-3 shadow-xs backdrop-blur transition-all duration-300 select-none">
        {/* Logo Icon */}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          title="Editora Luz Negra"
          className="mb-3 flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:scale-105"
        >
          <img
            src="/logo.svg"
            alt="Logo"
            className="size-5 brightness-0 invert"
          />
        </button>

        {/* Expand Button */}
        <Button
          variant="ghost"
          isIconOnly
          size="sm"
          onPress={() => setCollapsed(false)}
          aria-label="Expandir menu lateral"
          className="mb-2 h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <i className="fa-solid fa-angles-right text-xs" />
        </Button>

        <div className="my-1 h-px w-8 bg-border" />

        {/* Quick Project Icons */}
        <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto py-2">
          <button
            type="button"
            onClick={() => onProjectChange(null)}
            title={`Todos os Projetos (${totalActiveTasks} tarefas)`}
            className={`flex size-8 items-center justify-center rounded-lg text-xs font-semibold transition ${
              activeProjectId === null
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <i className="fa-solid fa-layer-group text-xs" />
          </button>

          {projects.map((project) => {
            const isActive = activeProjectId === project.id
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onProjectChange(project.id)}
                title={`${project.name} (${taskCounts[project.id] ?? 0} tarefas)`}
                className={`group relative flex size-8 items-center justify-center rounded-lg transition ${
                  isActive
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'hover:bg-muted'
                }`}
              >
                <span
                  className="size-3 rounded-full shadow-2xs transition group-hover:scale-110"
                  style={{ backgroundColor: project.color || '#7b68ee' }}
                />
              </button>
            )
          })}
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center gap-2 pt-2">
          {onOpenAi && (
            <button
              type="button"
              onClick={onOpenAi}
              title="Assistente IA"
              className="flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10 transition"
            >
              <i className="fa-solid fa-wand-magic-sparkles text-xs" />
            </button>
          )}
        </div>
      </aside>
    )
  }

  const displayName = user?.full_name || user?.username || 'Usuário'
  const initial = (user?.full_name?.[0] || user?.username?.[0] || 'U').toUpperCase()

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card/95 shadow-xs backdrop-blur transition-all duration-300 select-none">
      {/* Workspace Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex min-w-0 items-center gap-2 text-left transition hover:opacity-85"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <img
              src="/logo.svg"
              alt="Logo"
              className="size-4.5 brightness-0 invert"
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-foreground">
              Editora Luz Negra
            </div>
            <div className="text-[10px] text-muted-foreground">Hub de Tarefas</div>
          </div>
        </button>

        <Button
          variant="ghost"
          isIconOnly
          size="sm"
          onPress={() => setCollapsed(true)}
          aria-label="Recolher menu lateral"
          className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <i className="fa-solid fa-angles-left text-xs" />
        </Button>
      </div>

      {/* Search Input */}
      <div className="p-2 pb-1">
        <div className="relative flex items-center">
          <i className="fa-solid fa-magnifying-glass absolute left-2.5 text-[11px] text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Filtrar projetos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Main Navigation Items */}
      <div className="space-y-0.5 px-2 py-1 text-xs">
        <button
          type="button"
          onClick={() => onShowAllChange(!showAllTasks)}
          title={
            !showAllTasks
              ? 'Exibindo apenas tarefas atribuídas a você. Clique para ver todas as tarefas.'
              : 'Exibindo todas as tarefas do projeto. Clique para filtrar apenas as suas.'
          }
          className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 font-medium transition border ${
            !showAllTasks
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/15'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/15'
          }`}
        >
          <span className="flex items-center gap-2 font-semibold">
            <i
              className={`fa-solid ${
                !showAllTasks ? 'fa-user-check text-blue-400' : 'fa-users text-amber-400'
              } text-xs`}
            />
            <span>
              Tarefas: <span className="underline decoration-1 underline-offset-2">{!showAllTasks ? 'Minhas' : 'Todas'}</span>
            </span>
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
              !showAllTasks
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {!showAllTasks ? 'Filtro Ativo' : 'Visão Geral'}
          </span>
        </button>
      </div>

      <div className="my-1 mx-2 h-px bg-border/80" />

      {/* Spaces / Projects Section */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2">
        <div className="flex items-center justify-between px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>Espaços / Projetos</span>
          <button
            type="button"
            onClick={onCreateProject}
            title="Novo Projeto"
            className="flex size-5 items-center justify-center rounded hover:bg-muted hover:text-foreground"
          >
            <i className="fa-solid fa-plus text-xs" />
          </button>
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto py-1 text-xs">
          {/* All Projects Item */}
          <button
            type="button"
            onClick={() => onProjectChange(null)}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 font-medium transition ${
              activeProjectId === null
                ? 'bg-primary/15 font-semibold text-primary shadow-2xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <i className="fa-solid fa-layer-group text-xs text-muted-foreground" />
              <span className="truncate">Todos os projetos</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-semibold">
              {totalActiveTasks}
            </span>
          </button>

          {/* Project Items */}
          {filteredProjects.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {searchQuery ? 'Nenhum projeto encontrado.' : 'Nenhum projeto.'}
            </div>
          ) : (
            filteredProjects.map((project) => {
              const isActive = activeProjectId === project.id
              const count = taskCounts[project.id] ?? 0
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onProjectChange(project.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 font-medium transition ${
                    isActive
                      ? 'bg-primary/15 font-semibold text-primary shadow-2xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span
                      className="size-2.5 shrink-0 rounded-full shadow-2xs"
                      style={{ backgroundColor: project.color || '#7b68ee' }}
                    />
                    <span className="truncate">{project.name}</span>
                  </span>
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })
          )}

          {/* Create New Project Shortcut */}
          <button
            type="button"
            onClick={onCreateProject}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-primary/5 hover:text-primary"
          >
            <i className="fa-solid fa-plus text-xs" />
            <span>Novo projeto...</span>
          </button>
        </div>
      </div>

      {/* AI Assistant Button right above user name */}
      {onOpenAi && (
        <div className="border-t border-border p-2 pb-1">
          <button
            type="button"
            onClick={onOpenAi}
            title="Abrir Lorde Camarão"
            className="group flex w-full items-center gap-2.5 rounded-md border border-border/70 bg-muted/40 p-2 text-xs font-semibold text-foreground transition hover:bg-muted hover:border-border cursor-pointer shadow-2xs"
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background border border-border/60 text-xs shadow-2xs">
              🦐
            </div>
            <div className="flex flex-1 items-center justify-between min-w-0">
              <span className="truncate font-bold text-foreground">Lorde Camarão</span>
              <span className="text-[9px] font-semibold text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border/60">
                Assistente IA
              </span>
            </div>
          </button>
        </div>
      )}

      {/* User info at bottom */}
      <div className="p-2 pt-1">
        <div className="flex items-center justify-between rounded-md bg-muted/40 p-1.5 border border-border/50">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-[11px] text-primary-foreground shadow-2xs">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-foreground">
                {displayName}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                @{user?.username}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
