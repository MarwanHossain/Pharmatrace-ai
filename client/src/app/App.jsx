import { RouterProvider } from 'react-router-dom'
import { DemoDataProvider } from '../contexts/DemoData'
import { DemoSessionProvider } from '../contexts/DemoSession'
import { AuthProvider } from '../contexts/AuthContext'
import { router } from './router'

export default function App() {
  return (
    <DemoDataProvider>
      <DemoSessionProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </DemoSessionProvider>
    </DemoDataProvider>
  )
}
