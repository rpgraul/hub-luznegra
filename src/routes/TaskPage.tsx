import { useParams } from 'react-router'
import DashboardLayout from '@/components/layout/DashboardLayout'

export default function TaskPage() {
  const { taskId } = useParams()

  return <DashboardLayout initialTaskId={taskId} />
}