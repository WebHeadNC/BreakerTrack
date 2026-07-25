import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createHashRouter } from 'react-router-dom'
import './index.css'
import './print.css'
import ProjectList from './routes/ProjectList'
import Editor from './routes/Editor'
import { DialogHost } from './lib/dialog'

const router = createHashRouter([
  { path: '/', element: <ProjectList /> },
  { path: '/project/:id', element: <Editor /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <DialogHost />
  </StrictMode>,
)
