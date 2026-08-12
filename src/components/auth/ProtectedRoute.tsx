import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/hooks/useAuth'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Carregando...
    </div>
  )
}

export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}