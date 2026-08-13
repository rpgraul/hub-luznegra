import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePreferences } from '@/hooks/usePreferences'
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

  const [layout, setLayout] = useState<LayoutState>(() => loadLayout())
  const [presets, setPresets] = useState<SavedPreset[]>(() => loadPresets())

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

  if (!user) return null

  function handleProjectCreated(project: Project) {
    void queryClient.invalidateQueries({ queryKey: ['projects'] })
    setProject(project.id)
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

  return (
    <div className="min-h-screen pt-16">
      <TopBar
        projects={projects}
        activeProjectId={preferences?.active_project_id ?? null}
        onProjectChange={setProject}
        showAllTasks={preferences?.show_all_tasks ?? false}
        onShowAllChange={setShowAll}
        onCreateProject={() => setProjectModalOpen(true)}
        layout={layout}
        onViewClick={handleViewClick}
        onViewHold={handleViewHold}
        presets={presets}
        onApplyPreset={handleApplyPreset}
        onSavePreset={handleSavePreset}
        onDeletePreset={handleDeletePreset}
      />
      <main className="h-[calc(100vh-4rem)] overflow-hidden">
        {children ?? (
          <TaskWorkspace
            initialTaskId={initialTaskId}
            projects={projects}
            showAllTasks={preferences?.show_all_tasks ?? false}
            layout={layout}
            onLayoutChange={setLayout}
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