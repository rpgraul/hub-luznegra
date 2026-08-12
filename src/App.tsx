import { BrowserRouter } from 'react-router'
import AppRoutes from '@/routes'
import { Toaster } from '@/components/ui/sonner'

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  )
}

export default App