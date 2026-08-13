import { Navigate, Route, Routes } from 'react-router'
import LoginPage from '@/components/auth/LoginPage'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import UserManagement from '@/components/admin/UserManagement'
import DashboardPage from '@/routes/DashboardPage'
import TaskPage from '@/routes/TaskPage'
import EmailTest from '@/pages/EmailTest'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/test-email"
        element={
          import.meta.env.DEV ? (
            <EmailTest />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route path="/dashboard" element={<ProtectedRoute />}>
        <Route index element={<DashboardPage />} />
        <Route path="task/:taskId" element={<TaskPage />} />
        <Route path="admin/users" element={<UserManagement />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}