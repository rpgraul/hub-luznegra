import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePreferences } from '@/hooks/usePreferences'
import { listProjects } from '@/lib/api/projects'
import type { Project } from '@/types/database'
import TopBar from '@/components/layout/TopBar'
import TaskWorkspace from '@/components/tasks/TaskWorkspace'
import ProjectModal from '@/components/projects/ProjectModal'

interface DashboardLayoutProps {
  children?: ReactNode
  initialTaskId?: string
}

export default function DashboardLayout({
  children,
  initialTaskId,
}: DashboardLayoutProps) {
  const { user } = useAuth()
  const { preferences, setView, setProject, setShowAll } = usePreferences()
  const queryClient = useQueryClient()
  const [projectModalOpen, setProjectModalOpen] = useState(false)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    enabled: !!user,
  })

  function handleProjectCreated(project: Project) {
    void queryClient.invalidateQueries({ queryKey: ['projects'] })
    setProject(project.id)
  }

  return (
    <div className="min-h-screen pt-16">
      <TopBar
        projects={projects}
        activeProjectId={preferences?.active_project_id ?? null}
        onProjectChange={setProject}
        showAllTasks={preferences?.show_all_tasks ?? false}
        onShowAllChange={setShowAll}
        onCreateProject={() => setProjectModalOpen(true)}
        view={preferences?.default_view ?? 'gantt'}
        onViewChange={setView}
      />
      <main className="h-[calc(100vh-4rem)] overflow-auto">
        {children ?? (
          <TaskWorkspace
            initialTaskId={initialTaskId}
            projects={projects}
            showAllTasks={preferences?.show_all_tasks ?? false}
          />
        )}
      </main>

      <ProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        onCreated={handleProjectCreated}
      />
    </div>
  )
}