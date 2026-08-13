import { BrowserRouter } from 'react-router'
import AppRoutes from '@/routes'
import { ToastProvider } from '@heroui/react'

function App() {
  return (
    <BrowserRouter>
      <ToastProvider placement="top end" />
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
