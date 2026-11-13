import { RouterProvider } from 'react-router-dom'
import { DemoDataProvider } from '../contexts/DemoData'
import { DemoSessionProvider } from '../contexts/DemoSession'
import { router } from './router'

export default function App() {
  return (
    <DemoDataProvider>
      <DemoSessionProvider>
        <RouterProvider router={router} />
      </DemoSessionProvider>
    </DemoDataProvider>
  )
}
