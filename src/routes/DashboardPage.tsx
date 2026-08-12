import DashboardLayout from '@/components/layout/DashboardLayout'
import TaskWorkspace from '@/components/tasks/TaskWorkspace'

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <TaskWorkspace />
    </DashboardLayout>
  )
}