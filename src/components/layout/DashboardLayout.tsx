import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePreferences } from '@/hooks/usePreferences'
import { listProjects } from '@/lib/api/projects'
import TopBar from '@/components/layout/TopBar'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { preferences, setView, setProject } = usePreferences()

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    enabled: !!user,
  })

  return (
    <div className="min-h-screen pt-16">
      <TopBar
        projects={projects}
        activeProjectId={preferences?.active_project_id ?? null}
        onProjectChange={setProject}
        view={preferences?.default_view ?? 'gantt'}
        onViewChange={setView}
      />
      <main className="h-[calc(100vh-4rem)] overflow-auto">{children}</main>
    </div>
  )
}