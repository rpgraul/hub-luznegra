import { Navigate, Route, Routes } from 'react-router'
import LoginPage from '@/components/auth/LoginPage'
import ResetPasswordPage from '@/components/auth/ResetPasswordPage'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import UserManagement from '@/components/admin/UserManagement'
import DashboardPage from '@/routes/DashboardPage'
import TaskPage from '@/routes/TaskPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/dashboard" element={<ProtectedRoute />}>
        <Route index element={<DashboardPage />} />
        <Route path="links" element={<DashboardPage />} />
        <Route path="documentos" element={<DashboardPage />} />
        <Route path="task/:taskId" element={<TaskPage />} />
        <Route path="admin/users" element={<UserManagement />} />
      </Route>
      <Route path="/links" element={<Navigate to="/dashboard/links" replace />} />
      <Route path="/documentos" element={<Navigate to="/dashboard/documentos" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}