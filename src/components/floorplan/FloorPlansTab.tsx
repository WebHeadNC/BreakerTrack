import { useEffect, useRef, useState } from 'react'
import {
  ImagePlus,
  Layers,
  PanelRight,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { Panel } from '../../types'
import { useStore, useActivePanel } from '../../lib/store'
import { useIsMobile } from '../../lib/useIsMobile'
import { putBlob, deleteBlob } from '../../lib/api'
import { confirmDialog, promptDialog } from '../../lib/dialog'
import FloorPlanCanvas from './FloorPlanCanvas'
import IconPalette from './IconPalette'
import PanelDiagram from '../panel/PanelDiagram'
import BreakerForm from '../panel/BreakerForm'
import PanelConfigModal from '../panel/PanelConfigModal'
import SelectionPanel from '../common/SelectionPanel'
import '../panel/PanelsTab.css'
import './FloorPlansTab.css'

/** Load a File into an <img> to read its natural dimensions. */
function readImageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = reject
    img.src = url
  })
}

export default function FloorPlansTab() {
  const isMobile = useIsMobile()
  const project = useStore((s) => s.project)!
  const activeFloorId = useStore((s) => s.activeFloorId)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const addFloor = useStore((s) => s.addFloor)
  const renameFloor = useStore((s) => s.renameFloor)
  const deleteFloor = useStore((s) => s.deleteFloor)
  const mode = useStore((s) => s.mode)
  const isEdit = mode === 'edit'

  const [armed, setArmed] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const addPlacement = useStore((s) => s.addPlacement)

  // Leaving edit mode cancels any in-progress icon placement.
  useEffect(() => {
    if (!isEdit) {
      setArmed(null)
      setPaletteOpen(false)
    }
  }, [isEdit])

  // Breaker panel dock (desktop only — always visible alongside the floor plan).
  const panels = project.panels
  const activePanelId = useStore((s) => s.activePanelId)
  const setActivePanel = useStore((s) => s.setActivePanel)
  const deletePanel = useStore((s) => s.deletePanel)
  const activePanel = useActivePanel()
  const editingBreakerId = useStore((s) => s.editingBreakerId)
  const setEditingBreakerId = useStore((s) => s.setEditingBreakerId)
  const [configPanel, setConfigPanel] = useState<Panel | 'new' | null>(null)
  const [addSlot, setAddSlot] = useState<number | null>(null)
  const editingBreaker =
    activePanel?.breakers.find((b) => b.id === editingBreakerId) ?? null

  const floors = project.floors
  const activeFloor = floors.find((f) => f.id === activeFloorId)
  const selection = useStore((s) => s.selection)

  // Self-heal the active floor/panel selection: it can go stale not just
  // locally, but when another client adds the first floor/panel (or deletes
  // the one we had selected) — the project updates over the live sync, but
  // nothing local ever called setActiveFloor/setActivePanel for it.
  useEffect(() => {
    if (floors.length > 0 && !floors.some((f) => f.id === activeFloorId)) {
      setActiveFloor(floors[0].id)
    }
  }, [floors, activeFloorId, setActiveFloor])
  useEffect(() => {
    if (panels.length > 0 && !panels.some((p) => p.id === activePanelId)) {
      setActivePanel(panels[0].id)
    }
  }, [panels, activePanelId, setActivePanel])

  // When a breaker is selected, jump to a floor that has one of its fixtures
  // (so the highlighted markers are actually on screen).
  useEffect(() => {
    if (selection?.kind !== 'breaker') return
    const hereHas = activeFloor?.placements.some((p) => p.breakerIds.includes(selection.id))
    if (hereHas) return
    const target = floors.find((f) =>
      f.placements.some((p) => p.breakerIds.includes(selection.id)),
    )
    if (target && target.id !== activeFloorId) setActiveFloor(target.id)
  }, [selection, floors, activeFloor, activeFloorId, setActiveFloor])

  // Details flyout (desktop only): opens over the breaker panel.
  // Edit mode: automatic — a fresh selection (even re-clicking the same
  // thing) always reveals it. Deselecting always closes it.
  // View mode: manual — the "Show/Close Details" button in the floor-tabs
  // row toggles it for whatever's currently selected; it does not auto-open
  // just because a new item was clicked.
  const [detailsOpen, setDetailsOpen] = useState(false)
  useEffect(() => {
    if (isMobile) return
    if (!selection) {
      setDetailsOpen(false)
      return
    }
    if (isEdit) setDetailsOpen(true)
  }, [selection, isEdit, isMobile])

  async function onUploadNewFloor(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const { w, h } = await readImageSize(file)
    const imageId = await putBlob(file)
    const base = file.name.replace(/\.[^.]+$/, '')
    addFloor(base || `Floor ${floors.length + 1}`, imageId, w, h)
  }

  function place(imgX: number, imgY: number) {
    if (!armed || !activeFloor) return
    addPlacement({
      floorId: activeFloor.id,
      iconTypeId: armed,
      x: imgX,
      y: imgY,
      rotation: 0,
      scale: 1,
      label: '',
      breakerIds: [],
    })
    // Keep armed so multiple can be dropped quickly.
  }

  async function onDeleteFloor(floorId: string) {
    const f = floors.find((x) => x.id === floorId)
    if (!f) return
    const ok = await confirmDialog({
      title: 'Delete floor',
      message: `Delete floor "${f.name}" and its placements?`,
      confirmText: 'Delete',
      danger: true,
    })
    if (!ok) return
    if (f.imageId) await deleteBlob(f.imageId)
    deleteFloor(floorId)
  }

  async function onRenameFloor(floorId: string, current: string) {
    const name = (
      await promptDialog({
        title: 'Rename floor',
        label: 'Floor name',
        value: current,
        confirmText: 'Save',
      })
    )?.trim()
    if (name) renameFloor(floorId, name)
  }

  if (floors.length === 0) {
    return (
      <div className="fpt-empty">
        <div className="empty">
          <Layers size={44} />
          <div>
            <h3>Add your first floor plan</h3>
            <p className="muted">Upload an image (JPG, PNG, or SVG) to begin.</p>
          </div>
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} /> Upload floor plan
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onUploadNewFloor}
        />
      </div>
    )
  }

  const palette = (
    <IconPalette
      catalog={project.catalog}
      armedIconTypeId={armed}
      onArm={setArmed}
      disabled={!activeFloor?.imageId}
    />
  )

  // View-mode details button: names what it will show/hide, and only lights
  // up while the flyout is actually visible.
  const detailsNoun =
    selection?.kind === 'breaker' ? 'Breaker' : selection?.kind === 'placement' ? 'Item' : ''
  const detailsLabel = `${detailsOpen ? 'Close' : 'Show'}${detailsNoun ? ` ${detailsNoun}` : ''} Details`

  // Warn when the selection touches a multi-mapped item — either the
  // selected item itself is wired to more than one breaker, or a selected
  // breaker has a linked item that's also wired to another breaker.
  const showMultiBreakerCaution = (() => {
    if (!selection) return false
    const allPlacements = floors.flatMap((f) => f.placements)
    if (selection.kind === 'placement') {
      const pl = allPlacements.find((p) => p.id === selection.id)
      return (pl?.breakerIds.length ?? 0) > 1
    }
    return allPlacements.some(
      (p) => p.breakerIds.includes(selection.id) && p.breakerIds.length > 1,
    )
  })()

  return (
    <div className={`fpt ${isMobile ? 'fpt-mobile' : ''}`}>
      {/* Floor tabs */}
      <div className="fpt-floors no-print">
        <div className="fpt-floor-tabs">
          {floors.map((f) => (
            <div
              key={f.id}
              className={`fpt-floor-tab ${f.id === activeFloorId ? 'active' : ''}`}
              onClick={() => setActiveFloor(f.id)}
            >
              <span className="fpt-floor-name">{f.name}</span>
              {isEdit && f.id === activeFloorId && (
                <span className="fpt-floor-actions">
                  <button
                    className="icon-btn sm-btn"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRenameFloor(f.id, f.name)
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="icon-btn sm-btn"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteFloor(f.id)
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
        {showMultiBreakerCaution && (
          <span className="fpt-caution">
            <TriangleAlert size={14} />
            Caution item connected to more than 1 breaker.
          </span>
        )}
        <div className="fpt-floors-end">
          {isEdit && (
            <button
              className="btn sm"
              onClick={() => fileRef.current?.click()}
              title="Add floor"
            >
              <Plus size={14} /> Floor
            </button>
          )}
          {!isMobile && !isEdit && selection && (
            <button
              className={`btn sm ${detailsOpen ? 'primary' : ''}`}
              onClick={() => setDetailsOpen((v) => !v)}
              title={
                detailsOpen
                  ? 'Hide the details panel'
                  : 'Show details for the current selection'
              }
            >
              <PanelRight size={14} /> {detailsLabel}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onUploadNewFloor}
        />
      </div>

      <div className="fpt-work">
        {!isMobile && isEdit && <aside className="fpt-palette card">{palette}</aside>}

        {activeFloor && (
          <FloorPlanCanvas
            floor={activeFloor}
            catalog={project.catalog}
            armedIconTypeId={isEdit ? armed : null}
            onConsumeArmed={place}
          />
        )}

        {!isMobile && (
          <aside className="fpt-panel-dock card">
            {panels.length === 0 ? (
              <div className="fpt-panel-dock-empty">
                <p className="muted">No breaker panel yet.</p>
                <button className="btn sm primary" onClick={() => setConfigPanel('new')}>
                  <Plus size={14} /> New panel
                </button>
              </div>
            ) : (
              <>
                <div className="fpt-panel-dock-head">
                  <div className="pt-panel-tabs">
                    {panels.map((p) => (
                      <button
                        key={p.id}
                        className={`pt-panel-tab ${p.id === activePanelId ? 'active' : ''}`}
                        onClick={() => setActivePanel(p.id)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  {isEdit && (
                    <button className="icon-btn" title="Add panel" onClick={() => setConfigPanel('new')}>
                      <Plus size={16} />
                    </button>
                  )}
                </div>

                {activePanel && (
                  <>
                    <div className="fpt-panel-dock-meta">
                      <div className="pt-panel-specs muted">
                        {activePanel.model && <span>{activePanel.model}</span>}
                        <span className="mono">{activePanel.mainAmperage}A main</span>
                        <span className="mono">{activePanel.voltage}V</span>
                      </div>
                      {isEdit && (
                        <div className="fpt-panel-dock-tools">
                          <button
                            className="icon-btn"
                            title="Panel settings"
                            onClick={() => setConfigPanel(activePanel)}
                          >
                            <Settings2 size={15} />
                          </button>
                          <button
                            className="icon-btn"
                            title="Delete panel"
                            onClick={async () => {
                              const ok = await confirmDialog({
                                title: 'Delete panel',
                                message: `Delete panel "${activePanel.name}" and all its breakers?`,
                                confirmText: 'Delete',
                                danger: true,
                              })
                              if (ok) deletePanel(activePanel.id)
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="fpt-panel-dock-scroll">
                      <PanelDiagram
                        panel={activePanel}
                        editable={isEdit}
                        onAddAtSlot={(slot) => setAddSlot(slot)}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </aside>
        )}

        {!isMobile && detailsOpen && (
          <SelectionPanel
            isMobile={false}
            open={true}
            onClose={() => setDetailsOpen(false)}
          />
        )}
      </div>

      {configPanel && (
        <PanelConfigModal
          existing={configPanel === 'new' ? null : configPanel}
          onClose={() => setConfigPanel(null)}
        />
      )}

      {activePanel && (editingBreaker || addSlot !== null) && (
        <BreakerForm
          panel={activePanel}
          editing={editingBreaker}
          createAtSlot={addSlot}
          onClose={() => {
            setEditingBreakerId(null)
            setAddSlot(null)
          }}
        />
      )}

      {/* Mobile palette drawer */}
      {isMobile && isEdit && (
        <>
          <button
            className="fpt-palette-fab no-print"
            onClick={() => setPaletteOpen(true)}
          >
            <Plus size={20} /> Icons
          </button>
          {paletteOpen && (
            <div className="fpt-drawer-scrim" onPointerDown={() => setPaletteOpen(false)}>
              <div
                className="fpt-drawer"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="fpt-drawer-head">
                  <span>Icons</span>
                  <button className="icon-btn" onClick={() => setPaletteOpen(false)}>
                    <X size={18} />
                  </button>
                </div>
                {palette}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
