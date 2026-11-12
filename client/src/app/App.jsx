import { RouterProvider } from 'react-router-dom'
import { DemoSessionProvider } from '../contexts/DemoSession'
import { DemoDataProvider } from '../contexts/DemoData'
import { router } from './router'

export default function App() {
  return (
    <DemoSessionProvider>
      <DemoDataProvider>
        <RouterProvider router={router} />
      </DemoDataProvider>
    </DemoSessionProvider>
  )
}
