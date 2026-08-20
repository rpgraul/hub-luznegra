import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePreferences } from '@/hooks/usePreferences'
import { useTasks } from '@/hooks/useTasks'
import { listProjects } from '@/lib/api/projects'
import {
  addViewToLayout,
  loadLayout,
  loadPresets,
  removeViewFromLayout,
  saveLayout,
  savePresets,
  singleViewInLayout,
  type LayoutState,
  type SavedPreset,
} from '@/lib/layout'
import type { DefaultView, Project } from '@/types/database'
import TopBar from '@/components/layout/TopBar'
import Sidebar from '@/components/layout/Sidebar'
import TaskWorkspace from '@/components/tasks/TaskWorkspace'
import LinksView from '@/components/links/LinksView'
import DocumentsView from '@/components/documents/DocumentsView'
import ProjectModal from '@/components/projects/ProjectModal'
import AIAssistantModal from '@/components/ai/AIAssistantModal'
import NewTaskModal, { type NewTaskInput } from '@/components/tasks/NewTaskModal'
import UserManagementDrawer from '@/components/admin/UserManagementDrawer'
import ProfileDrawer from '@/components/profile/ProfileDrawer'
import ArchivedProjectsModal from '@/components/projects/ArchivedProjectsModal'
import { toast } from '@heroui/react'
import type { Json } from '@/types/database'

interface DashboardLayoutProps {
  children?: ReactNode
  initialTaskId?: string
  defaultTab?: 'tasks' | 'links' | 'documents'
}

export default function DashboardLayout({
  children,
  initialTaskId,
  defaultTab,
}: DashboardLayoutProps) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { preferences, setView, setProject, setShowAll, setHideDone } = usePreferences()
  const queryClient = useQueryClient()
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [archivedModalOpen, setArchivedModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false)
  const [usersDrawerOpen, setUsersDrawerOpen] = useState(false)

  // Determina aba ativa baseada na rota ou propriedade
  const currentTab: 'tasks' | 'links' | 'documents' =
    defaultTab ||
    (location.pathname.includes('/links')
      ? 'links'
      : location.pathname.includes('/documentos')
        ? 'documents'
        : 'tasks')

  const [activeTab, setActiveTab] = useState<'tasks' | 'links' | 'documents'>(currentTab)

  useEffect(() => {
    setActiveTab(currentTab)
  }, [currentTab])

  function handleSelectTab(tab: 'tasks' | 'links' | 'documents') {
    setActiveTab(tab)
    if (tab === 'tasks') {
      navigate('/dashboard')
    } else if (tab === 'links') {
      navigate('/dashboard/links')
    } else if (tab === 'documents') {
      navigate('/dashboard/documentos')
    }
  }

  const [layout, setLayout] = useState<LayoutState>(() => loadLayout())
  const [presets, setPresets] = useState<SavedPreset[]>(() => loadPresets())

  const tasksApi = useTasks(preferences?.show_all_tasks ?? false)

  useEffect(() => {
    function handleOpenUsers() {
      setUsersDrawerOpen(true)
    }
    function handleOpenProfile() {
      setProfileDrawerOpen(true)
    }
    window.addEventListener('hub:open-users-drawer', handleOpenUsers)
    window.addEventListener('hub:open-profile-drawer', handleOpenProfile)
    return () => {
      window.removeEventListener('hub:open-users-drawer', handleOpenUsers)
      window.removeEventListener('hub:open-profile-drawer', handleOpenProfile)
    }
  }, [])

  useEffect(() => {
    saveLayout(layout)
  }, [layout])

  useEffect(() => {
    savePresets(presets)
  }, [presets])

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    enabled: !!user,
  })

  function handleProjectChange(projectId: string | null) {
    setProject(projectId)
    if (activeTab !== 'tasks') {
      handleSelectTab('tasks')
    }
  }

  function handleProjectSaved(project: Project) {
    void queryClient.invalidateQueries({ queryKey: ['projects'] })
    setProject(project.id)
    if (activeTab !== 'tasks') {
      handleSelectTab('tasks')
    }
    setEditingProject(null)
  }

  function handleProjectDeleted(projectId: string) {
    void queryClient.invalidateQueries({ queryKey: ['projects'] })
    if (preferences?.active_project_id === projectId) {
      setProject(null)
    }
    setEditingProject(null)
  }

  function handleViewClick(view: DefaultView) {
    setLayout(singleViewInLayout(layout, view))
    setView(view)
  }

  function handleViewHold(view: DefaultView) {
    const next = layout.views.includes(view)
      ? removeViewFromLayout(layout, view)
      : addViewToLayout(layout, view)
    setLayout(next)
  }

  function handleApplyPreset(scheme: LayoutState) {
    setLayout(scheme)
    setView(scheme.views[0] ?? 'gantt')
  }

  function handleSavePreset(name: string) {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Date.now()}`
    setPresets((prev) => [...prev, { id, name, scheme: layout }])
  }

  function handleDeletePreset(id: string) {
    setPresets((prev) => prev.filter((p) => p.id !== id))
  }

  async function handleCreateNewTask(input: NewTaskInput) {
    try {
      const parent = await tasksApi.createTask({
        title: input.title,
        project_id: input.project_id,
        status: input.status,
        priority: input.priority,
        assigned_to: input.assigned_to,
        start_date: input.start_date,
        due_date: input.due_date,
        estimated_hours: input.estimated_hours,
        description: input.description as unknown as Json,
      })

      for (const subtaskTitle of input.subtasks) {
        await tasksApi.createTask({
          title: subtaskTitle,
          project_id: input.project_id,
          parent_id: parent.id,
          status: input.status,
          assigned_to: input.assigned_to,
        })
      }

      toast.success(
        input.subtasks.length > 0
          ? `Tarefa e ${input.subtasks.length} subtarefa(s) criadas.`
          : 'Tarefa criada.',
      )
      setCreateTaskOpen(false)
    } catch (err) {
      toast.danger(
        err instanceof Error ? err.message : 'Erro ao criar tarefa.',
      )
    }
  }

  if (!user) return null

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* ClickUp-style Left Sidebar */}
      <Sidebar
        projects={projects}
        activeProjectId={preferences?.active_project_id ?? null}
        onProjectChange={handleProjectChange}
        onCreateProject={() => {
          setEditingProject(null)
          setProjectModalOpen(true)
        }}
        onEditProject={(p) => {
          setEditingProject(p)
          setProjectModalOpen(true)
        }}
        onOpenArchivedProjects={() => setArchivedModalOpen(true)}
        showAllTasks={preferences?.show_all_tasks ?? false}
        onShowAllChange={setShowAll}
        hideDoneTasks={preferences?.hide_done_tasks ?? false}
        onHideDoneChange={setHideDone}
        tasks={tasksApi.tasks}
        onOpenAi={() => setAiModalOpen(true)}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
      />

      {/* Main Workspace Area */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        {activeTab === 'links' ? (
          <LinksView
            projects={projects}
            activeProjectId={preferences?.active_project_id ?? null}
            onProjectChange={setProject}
          />
        ) : activeTab === 'documents' ? (
          <DocumentsView />
        ) : (
          <>
            <TopBar
              projects={projects}
              activeProjectId={preferences?.active_project_id ?? null}
              layout={layout}
              onViewClick={handleViewClick}
              onViewHold={handleViewHold}
              presets={presets}
              onApplyPreset={handleApplyPreset}
              onSavePreset={handleSavePreset}
              onDeletePreset={handleDeletePreset}
              onOpenNewTask={() => setCreateTaskOpen(true)}
              hideDoneTasks={preferences?.hide_done_tasks ?? false}
              onHideDoneChange={setHideDone}
            />

            <main className="flex-1 min-h-0 overflow-hidden">
              {children ?? (
                <TaskWorkspace
                  initialTaskId={initialTaskId}
                  projects={projects}
                  showAllTasks={preferences?.show_all_tasks ?? false}
                  hideDoneTasks={preferences?.hide_done_tasks ?? false}
                  layout={layout}
                  onLayoutChange={setLayout}
                />
              )}
            </main>
          </>
        )}
      </div>

      <ProjectModal
        open={projectModalOpen}
        onOpenChange={(open) => {
          setProjectModalOpen(open)
          if (!open) setEditingProject(null)
        }}
        project={editingProject}
        onSaved={handleProjectSaved}
        onDeleted={handleProjectDeleted}
      />

      <ArchivedProjectsModal
        open={archivedModalOpen}
        onOpenChange={setArchivedModalOpen}
        onRestored={(p) => {
          setProject(p.id)
        }}
      />

      <NewTaskModal
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        projects={projects}
        initialProjectId={preferences?.active_project_id ?? null}
        currentUserId={user.id}
        onCreate={handleCreateNewTask}
      />

      <AIAssistantModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        projectId={preferences?.active_project_id ?? null}
        projectName={
          projects.find((p) => p.id === preferences?.active_project_id)?.name
        }
      />

      <UserManagementDrawer
        open={usersDrawerOpen}
        onOpenChange={setUsersDrawerOpen}
      />

      <ProfileDrawer
        open={profileDrawerOpen}
        onOpenChange={setProfileDrawerOpen}
      />
    </div>
  )
}