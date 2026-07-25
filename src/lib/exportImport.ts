import type { Project } from '../types'
import { createProject, getBlob, putBlob } from './api'

interface Bundle {
  format: 'breakertrack'
  version: 1
  project: Project
  /** blob id -> { type, dataBase64 } */
  blobs: Record<string, { type: string; data: string }>
}

/** Every blob id referenced by a project (floor images + custom icons). */
function referencedBlobIds(project: Project): string[] {
  const ids = new Set<string>()
  for (const f of project.floors) if (f.imageId) ids.add(f.imageId)
  for (const it of project.catalog) if (it.imageId) ids.add(it.imageId)
  return [...ids]
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** Serialize a project + its blobs to a downloadable JSON file. */
export async function exportProject(project: Project): Promise<void> {
  const bundle: Bundle = {
    format: 'breakertrack',
    version: 1,
    project,
    blobs: {},
  }
  for (const id of referencedBlobIds(project)) {
    const blob = await getBlob(id)
    if (blob) {
      bundle.blobs[id] = { type: blob.type, data: await blobToBase64(blob) }
    }
  }

  const json = JSON.stringify(bundle)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  const safe = project.name.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || 'project'
  a.href = url
  a.download = `${safe}.breakertrack.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Import a bundle file. Blob ids and the project id are regenerated so an
 * import never collides with existing data. Returns the new project id.
 */
export async function importProject(file: File): Promise<string> {
  const text = await file.text()
  const bundle = JSON.parse(text) as Bundle
  if (bundle.format !== 'breakertrack') {
    throw new Error('Not a BreakerTrack file.')
  }

  const project = bundle.project
  const idMap = new Map<string, string>()

  // Re-upload blobs under fresh, server-issued ids.
  for (const [oldId, rec] of Object.entries(bundle.blobs)) {
    const newId = await putBlob(base64ToBlob(rec.data, rec.type))
    idMap.set(oldId, newId)
  }

  // Remap references.
  for (const f of project.floors) {
    if (f.imageId) f.imageId = idMap.get(f.imageId) ?? undefined
  }
  for (const it of project.catalog) {
    if (it.imageId) it.imageId = idMap.get(it.imageId) ?? undefined
  }

  project.id = crypto.randomUUID()
  project.name = `${project.name} (imported)`
  project.updatedAt = Date.now()
  await createProject(project)
  return project.id
}
