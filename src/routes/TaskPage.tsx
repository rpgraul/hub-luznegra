import { useParams } from 'react-router'
import DashboardLayout from '@/components/layout/DashboardLayout'
import TaskWorkspace from '@/components/tasks/TaskWorkspace'

export default function TaskPage() {
  const { taskId } = useParams()

  return (
    <DashboardLayout>
      <TaskWorkspace initialTaskId={taskId} />
    </DashboardLayout>
  )
}