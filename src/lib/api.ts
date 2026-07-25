import type { Project } from '../types'

// All requests are same-origin: in dev, Vite proxies /api and /ws to the
// backend; in production, the backend serves the built frontend itself.

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// --- Projects ----------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  return json(await fetch('/api/projects'))
}

export async function getProject(id: string): Promise<Project | undefined> {
  const res = await fetch(`/api/projects/${id}`)
  if (res.status === 404) return undefined
  return json(res)
}

export async function createProject(project: Project): Promise<void> {
  await json(
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }),
  )
}

export async function saveProject(project: Project): Promise<void> {
  await json(
    await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }),
  )
}

export async function deleteProject(id: string): Promise<void> {
  await fetch(`/api/projects/${id}`, { method: 'DELETE' })
}

// --- Blobs (floor plan images, custom icons) ----------------------------------

export async function putBlob(file: File | Blob): Promise<string> {
  const form = new FormData()
  form.append('file', file, 'name' in file ? file.name : 'blob')
  const res = await fetch('/api/blobs', { method: 'POST', body: form })
  const { id } = await json<{ id: string }>(res)
  return id
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  const res = await fetch(`/api/blobs/${id}`)
  if (!res.ok) return undefined
  return res.blob()
}

export async function deleteBlob(id: string): Promise<void> {
  await fetch(`/api/blobs/${id}`, { method: 'DELETE' })
}

/** Direct, stable URL for a stored blob — usable straight in <img src>. */
export function blobUrl(id: string): string {
  return `/api/blobs/${id}`
}
