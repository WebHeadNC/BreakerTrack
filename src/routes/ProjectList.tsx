import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Copy,
  Download,
  FileUp,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react'
import type { Project } from '../types'
import { useStore } from '../lib/store'
import { exportProject, importProject } from '../lib/exportImport'
import { confirmDialog, promptDialog } from '../lib/dialog'
import './ProjectList.css'

export default function ProjectList() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const projects = useStore((s) => s.projects)
  const projectsLoaded = useStore((s) => s.projectsLoaded)
  const loadProjectList = useStore((s) => s.loadProjectList)
  const createProject = useStore((s) => s.createProject)
  const renameProject = useStore((s) => s.renameProject)
  const duplicateProject = useStore((s) => s.duplicateProject)
  const deleteProject = useStore((s) => s.deleteProject)

  useEffect(() => {
    loadProjectList()
  }, [loadProjectList])

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  async function onCreate() {
    const name = (
      await promptDialog({
        title: 'New project',
        label: 'Project name',
        value: 'My Home',
        confirmText: 'Create',
      })
    )?.trim()
    if (!name) return
    const id = await createProject(name)
    navigate(`/project/${id}`)
  }

  async function onRename(p: Project) {
    const name = (
      await promptDialog({
        title: 'Rename project',
        label: 'Project name',
        value: p.name,
        confirmText: 'Save',
      })
    )?.trim()
    if (!name) return
    await renameProject(p.id, name)
  }

  async function onDelete(p: Project) {
    const ok = await confirmDialog({
      title: 'Delete project',
      message: `Delete "${p.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deleteProject(p.id)
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const id = await importProject(file)
      navigate(`/project/${id}`)
    } catch (err) {
      await confirmDialog({
        title: 'Import failed',
        message: (err as Error).message,
        confirmText: 'OK',
      })
    }
  }

  return (
    <div className="pl">
      <header className="pl-top">
        <div className="pl-brand">
          <div className="pl-logo">
            <Zap size={20} />
          </div>
          <div>
            <h1>BreakerTrack</h1>
            <p className="muted">Map fixtures to breakers, floor by floor.</p>
          </div>
        </div>
        <div className="pl-actions">
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <FileUp size={16} /> Import
          </button>
          <button className="btn primary" onClick={onCreate}>
            <Plus size={16} /> New project
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={onImport}
          />
        </div>
      </header>

      <main className="pl-main">
        {!projectsLoaded ? null : sorted.length === 0 ? (
          <div className="empty card">
            <Zap size={40} />
            <div>
              <h3>No projects yet</h3>
              <p className="muted">
                Create a project to start mapping your electrical layout.
              </p>
            </div>
            <button className="btn primary" onClick={onCreate}>
              <Plus size={16} /> New project
            </button>
          </div>
        ) : (
          <div className="pl-grid">
            {sorted.map((p) => (
              <div key={p.id} className="pl-card card">
                <button
                  className="pl-card-open"
                  onClick={() => navigate(`/project/${p.id}`)}
                >
                  <h3>{p.name}</h3>
                  <div className="pl-card-meta muted">
                    {p.floors.length} floor{p.floors.length === 1 ? '' : 's'} ·{' '}
                    {p.panels.length} panel{p.panels.length === 1 ? '' : 's'}
                  </div>
                  <div className="pl-card-date muted">
                    Updated {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </button>
                <div className="pl-card-tools">
                  <button className="icon-btn" title="Rename" onClick={() => onRename(p)}>
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Duplicate"
                    onClick={() => duplicateProject(p.id)}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Export"
                    onClick={() => exportProject(p)}
                  >
                    <Download size={16} />
                  </button>
                  <button className="icon-btn" title="Delete" onClick={() => onDelete(p)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
