import { create } from 'zustand'
import type {
  Breaker,
  Floor,
  IconType,
  Panel,
  Placement,
  Project,
} from '../types'
import * as api from './api'
import { connectWebSocket } from './ws'
import { defaultCatalog } from './builtinIcons'

export type Selection =
  | { kind: 'breaker'; id: string }
  | { kind: 'placement'; id: string }
  | null

/**
 * View mode is pure inspection: click an icon to highlight its breaker, click
 * a breaker to highlight its icons — nothing can be added, moved, or linked.
 * Edit mode unlocks placing/moving/deleting icons, adding/editing breakers,
 * and linking icons to breakers.
 */
export type Mode = 'view' | 'edit'

interface AppState {
  // Shared project list — every client sees the same set, kept live over WS.
  projects: Project[]
  projectsLoaded: boolean
  loadProjectList: () => Promise<void>
  createProject: (name: string) => Promise<string>
  renameProject: (id: string, name: string) => Promise<void>
  duplicateProject: (id: string) => Promise<string | null>
  deleteProject: (id: string) => Promise<void>

  // The project currently open in the editor.
  project: Project | null
  activeFloorId: string | null
  activePanelId: string | null
  selection: Selection
  mode: Mode
  /** When true, clicking a placement links/unlinks it to the selected breaker. */
  linkMode: boolean
  /** Breaker id whose edit form a component elsewhere (e.g. the details panel) requested be opened. */
  editingBreakerId: string | null
  /** Set when the open project no longer exists on the server (deleted remotely, or a bad id). */
  remotelyDeleted: boolean

  loadProject: (id: string) => Promise<void>
  closeProject: () => void
  mutate: (fn: (p: Project) => void) => void

  setActiveFloor: (id: string | null) => void
  setActivePanel: (id: string | null) => void
  select: (sel: Selection) => void
  setMode: (mode: Mode) => void
  setLinkMode: (on: boolean) => void
  setEditingBreakerId: (id: string | null) => void

  // Floors
  addFloor: (name: string, imageId: string | undefined, imgW: number, imgH: number) => string
  renameFloor: (floorId: string, name: string) => void
  deleteFloor: (floorId: string) => void

  // Placements
  addPlacement: (p: Omit<Placement, 'id'>) => string
  updatePlacement: (id: string, patch: Partial<Placement>) => void
  deletePlacement: (id: string) => void

  // Catalog
  addIconType: (icon: Omit<IconType, 'id'>) => string
  updateIconType: (id: string, patch: Partial<IconType>) => void
  deleteIconType: (id: string) => void

  // Panels
  addPanel: (panel: Omit<Panel, 'id' | 'breakers'>) => string
  updatePanel: (id: string, patch: Partial<Omit<Panel, 'breakers'>>) => void
  deletePanel: (id: string) => void

  // Breakers
  addBreaker: (b: Omit<Breaker, 'id'>) => string
  updateBreaker: (id: string, patch: Partial<Breaker>) => void
  deleteBreaker: (id: string) => void

  // Linking
  toggleLink: (breakerId: string, placementId: string) => void
}

// --- Debounced save to the server, with a guard against remote broadcasts --
// clobbering an edit that hasn't reached the server yet (e.g. a fast drag).

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSaveId: string | null = null

function schedulePush(project: Project) {
  pendingSaveId = project.id
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const toSave = project
    api
      .saveProject(toSave)
      .catch((err) => console.error('Failed to save project', err))
      .finally(() => {
        if (pendingSaveId === toSave.id) pendingSaveId = null
      })
  }, 400)
}

function upsert(list: Project[], project: Project): Project[] {
  const idx = list.findIndex((p) => p.id === project.id)
  if (idx === -1) return [...list, project]
  const next = [...list]
  next[idx] = project
  return next
}

/** Find helpers operating on the live project. */
function findBreaker(p: Project, id: string): Breaker | undefined {
  for (const panel of p.panels) {
    const b = panel.breakers.find((x) => x.id === id)
    if (b) return b
  }
  return undefined
}

export const useStore = create<AppState>((set, get) => {
  /** Apply a mutation to a clone of the project, persist, and update state. */
  const mutate = (fn: (p: Project) => void) => {
    const current = get().project
    if (!current) return
    const next: Project = structuredClone(current)
    fn(next)
    next.updatedAt = Date.now()
    set((s) => ({ project: next, projects: upsert(s.projects, next) }))
    schedulePush(next)
  }

  return {
    projects: [],
    projectsLoaded: false,

    async loadProjectList() {
      const projects = await api.listProjects()
      set({ projects, projectsLoaded: true })
    },

    async createProject(name) {
      const now = Date.now()
      const project: Project = {
        id: crypto.randomUUID(),
        name,
        createdAt: now,
        updatedAt: now,
        floors: [],
        panels: [],
        catalog: defaultCatalog(),
      }
      await api.createProject(project)
      set((s) => ({ projects: upsert(s.projects, project) }))
      return project.id
    },

    async renameProject(id, name) {
      const existing = get().projects.find((p) => p.id === id)
      if (!existing) return
      const updated: Project = { ...existing, name, updatedAt: Date.now() }
      await api.saveProject(updated)
      set((s) => ({ projects: upsert(s.projects, updated) }))
    },

    async duplicateProject(id) {
      const existing = get().projects.find((p) => p.id === id)
      if (!existing) return null
      const copy: Project = structuredClone(existing)
      copy.id = crypto.randomUUID()
      copy.name = `${existing.name} (copy)`
      copy.createdAt = copy.updatedAt = Date.now()
      await api.createProject(copy)
      set((s) => ({ projects: upsert(s.projects, copy) }))
      return copy.id
    },

    async deleteProject(id) {
      await api.deleteProject(id)
      set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
    },

    project: null,
    activeFloorId: null,
    activePanelId: null,
    selection: null,
    mode: 'view',
    linkMode: false,
    editingBreakerId: null,
    remotelyDeleted: false,

    async loadProject(id) {
      set({ remotelyDeleted: false })
      const project = await api.getProject(id)
      if (!project) {
        set({ remotelyDeleted: true })
        return
      }
      set({
        project,
        activeFloorId: project.floors[0]?.id ?? null,
        activePanelId: project.panels[0]?.id ?? null,
        selection: null,
        mode: 'view',
        linkMode: false,
        editingBreakerId: null,
      })
    },

    closeProject() {
      set({
        project: null,
        activeFloorId: null,
        activePanelId: null,
        selection: null,
        mode: 'view',
        linkMode: false,
        editingBreakerId: null,
        remotelyDeleted: false,
      })
    },

    mutate,

    setActiveFloor: (id) => set({ activeFloorId: id }),
    setActivePanel: (id) => set({ activePanelId: id }),
    select: (selection) => set({ selection }),
    // Leaving edit mode always drops link-mode and any pending edit-breaker
    // request, since both are edit-only interactions.
    setMode: (mode) =>
      set(mode === 'edit' ? { mode } : { mode, linkMode: false, editingBreakerId: null }),
    setLinkMode: (on) => set({ linkMode: on }),
    setEditingBreakerId: (id) => set({ editingBreakerId: id }),

    addFloor(name, imageId, imgW, imgH) {
      const floor: Floor = {
        id: crypto.randomUUID(),
        name,
        imageId,
        imgW,
        imgH,
        placements: [],
      }
      mutate((p) => {
        p.floors.push(floor)
      })
      set({ activeFloorId: floor.id })
      return floor.id
    },

    renameFloor(floorId, name) {
      mutate((p) => {
        const f = p.floors.find((x) => x.id === floorId)
        if (f) f.name = name
      })
    },

    deleteFloor(floorId) {
      mutate((p) => {
        p.floors = p.floors.filter((f) => f.id !== floorId)
      })
      const { project, activeFloorId } = get()
      if (activeFloorId === floorId) {
        set({ activeFloorId: project?.floors[0]?.id ?? null })
      }
    },

    addPlacement(p) {
      const placement: Placement = { ...p, id: crypto.randomUUID() }
      mutate((proj) => {
        const f = proj.floors.find((x) => x.id === placement.floorId)
        if (f) f.placements.push(placement)
      })
      return placement.id
    },

    updatePlacement(id, patch) {
      mutate((proj) => {
        for (const f of proj.floors) {
          const pl = f.placements.find((x) => x.id === id)
          if (pl) {
            Object.assign(pl, patch)
            return
          }
        }
      })
    },

    deletePlacement(id) {
      mutate((proj) => {
        for (const f of proj.floors) {
          f.placements = f.placements.filter((x) => x.id !== id)
        }
      })
      if (get().selection?.kind === 'placement' && get().selection?.id === id) {
        set({ selection: null })
      }
    },

    addIconType(icon) {
      const it: IconType = { ...icon, id: crypto.randomUUID() }
      mutate((p) => {
        p.catalog.push(it)
      })
      return it.id
    },

    updateIconType(id, patch) {
      mutate((p) => {
        const it = p.catalog.find((x) => x.id === id)
        if (it) Object.assign(it, patch)
      })
    },

    deleteIconType(id) {
      mutate((p) => {
        p.catalog = p.catalog.filter((x) => x.id !== id)
        // Remove placements using this icon type.
        for (const f of p.floors) {
          f.placements = f.placements.filter((pl) => pl.iconTypeId !== id)
        }
      })
    },

    addPanel(panel) {
      const pn: Panel = { ...panel, id: crypto.randomUUID(), breakers: [] }
      mutate((p) => {
        p.panels.push(pn)
      })
      set({ activePanelId: pn.id })
      return pn.id
    },

    updatePanel(id, patch) {
      mutate((p) => {
        const pn = p.panels.find((x) => x.id === id)
        if (pn) Object.assign(pn, patch)
      })
    },

    deletePanel(id) {
      mutate((p) => {
        const panel = p.panels.find((x) => x.id === id)
        const removed = new Set(panel?.breakers.map((b) => b.id) ?? [])
        p.panels = p.panels.filter((x) => x.id !== id)
        // Unlink placements pointing at breakers of the removed panel.
        for (const f of p.floors) {
          for (const pl of f.placements) {
            if (pl.breakerId && removed.has(pl.breakerId)) pl.breakerId = undefined
          }
        }
      })
      const { project, activePanelId } = get()
      if (activePanelId === id) set({ activePanelId: project?.panels[0]?.id ?? null })
    },

    addBreaker(b) {
      const br: Breaker = { ...b, id: crypto.randomUUID() }
      mutate((p) => {
        const panel = p.panels.find((x) => x.id === br.panelId)
        if (panel) panel.breakers.push(br)
      })
      return br.id
    },

    updateBreaker(id, patch) {
      mutate((p) => {
        const br = findBreaker(p, id)
        if (br) Object.assign(br, patch)
      })
    },

    deleteBreaker(id) {
      mutate((p) => {
        for (const panel of p.panels) {
          panel.breakers = panel.breakers.filter((x) => x.id !== id)
        }
        // Unlink placements referencing this breaker.
        for (const f of p.floors) {
          for (const pl of f.placements) {
            if (pl.breakerId === id) pl.breakerId = undefined
          }
        }
      })
      if (get().selection?.kind === 'breaker' && get().selection?.id === id) {
        set({ selection: null })
      }
    },

    toggleLink(breakerId, placementId) {
      mutate((p) => {
        for (const f of p.floors) {
          const pl = f.placements.find((x) => x.id === placementId)
          if (pl) {
            pl.breakerId = pl.breakerId === breakerId ? undefined : breakerId
            return
          }
        }
      })
    },
  }
})

// --- Live sync ----------------------------------------------------------
// One shared WebSocket for the whole app: keeps the project list current on
// every screen, and — while a project is open — mirrors other clients'
// edits into it (unless we have our own unconfirmed edit in flight).

connectWebSocket({
  onProject(project) {
    useStore.setState((s) => ({ projects: upsert(s.projects, project) }))
    const { project: open } = useStore.getState()
    if (open?.id === project.id && pendingSaveId !== project.id) {
      useStore.setState({ project })
    }
  },
  onProjectDeleted(id) {
    useStore.setState((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
    const { project: open } = useStore.getState()
    if (open?.id === id) {
      useStore.setState({ project: null, remotelyDeleted: true })
    }
  },
})

// --- Selectors --------------------------------------------------------------

export function useActiveFloor(): Floor | undefined {
  return useStore((s) => s.project?.floors.find((f) => f.id === s.activeFloorId))
}

export function useActivePanel(): Panel | undefined {
  return useStore((s) => s.project?.panels.find((p) => p.id === s.activePanelId))
}
