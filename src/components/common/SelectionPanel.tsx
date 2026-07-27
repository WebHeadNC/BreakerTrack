import { useMemo } from 'react'
import {
  Link2,
  Link2Off,
  MapPin,
  Pencil,
  RotateCw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { Breaker, Panel, Placement } from '../../types'
import { BREAKER_TYPE_META } from '../../types'
import { useStore } from '../../lib/store'
import { linkPlacementToBreaker, unlinkPlacementBreaker } from '../../lib/linking'
import MarkerIcon from './MarkerIcon'
import './SelectionPanel.css'

interface Props {
  isMobile: boolean
  open: boolean
  onClose: () => void
  onGoToFloors?: () => void
}

interface FoundBreaker {
  breaker: Breaker
  panel: Panel
}

export default function SelectionPanel({ isMobile, open, onClose, onGoToFloors }: Props) {
  const project = useStore((s) => s.project)!
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const mode = useStore((s) => s.mode)
  const isEdit = mode === 'edit'
  const linkMode = useStore((s) => s.linkMode)
  const setLinkMode = useStore((s) => s.setLinkMode)
  const updatePlacement = useStore((s) => s.updatePlacement)
  const deletePlacement = useStore((s) => s.deletePlacement)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const setEditingBreakerId = useStore((s) => s.setEditingBreakerId)

  const allBreakers = useMemo<FoundBreaker[]>(() => {
    const list: FoundBreaker[] = []
    for (const panel of project.panels) {
      for (const breaker of panel.breakers) list.push({ breaker, panel })
    }
    return list
  }, [project.panels])

  const catalogById = useMemo(
    () => new Map(project.catalog.map((c) => [c.id, c])),
    [project.catalog],
  )

  // Resolve current selection into concrete objects.
  const selectedBreaker =
    selection?.kind === 'breaker'
      ? allBreakers.find((b) => b.breaker.id === selection.id)
      : undefined

  let selectedPlacement: { placement: Placement; floorName: string } | undefined
  if (selection?.kind === 'placement') {
    for (const f of project.floors) {
      const pl = f.placements.find((p) => p.id === selection.id)
      if (pl) {
        selectedPlacement = { placement: pl, floorName: f.name }
        break
      }
    }
  }

  function goToPlacement(pl: Placement) {
    setActiveFloor(pl.floorId)
    select({ kind: 'placement', id: pl.id })
    if (isMobile) onClose()
    onGoToFloors?.()
  }

  const body = (() => {
    if (selectedBreaker) {
      const { breaker, panel } = selectedBreaker
      const meta = BREAKER_TYPE_META[breaker.type]
      const linked = project.floors.flatMap((f) =>
        f.placements
          .filter((p) => p.breakerIds.includes(breaker.id))
          .map((p) => ({ placement: p, floorName: f.name })),
      )
      return (
        <>
          <div className="sp-headline">
            <span className="sp-type-badge" style={{ background: meta.color }}>
              {meta.short}
            </span>
            <div>
              <div className="sp-h-title">
                {breaker.label || `Breaker ${breaker.startSlot}`}
              </div>
              <div className="sp-h-sub muted">
                {panel.name} · slot {breaker.startSlot}
                {breaker.span > 1 ? `+${breaker.span - 1}` : ''}
              </div>
            </div>
          </div>

          <div className="sp-facts">
            <div><span className="muted">Amps</span><b className="mono">{breaker.amps}A</b></div>
            <div><span className="muted">Type</span><b>{meta.label}</b></div>
            <div><span className="muted">Poles</span><b>{breaker.span}</b></div>
          </div>
          {breaker.description && <p className="sp-notes">{breaker.description}</p>}

          {isEdit ? (
            <>
              <div className="sp-btn-row">
                <button
                  className={`btn ${linkMode ? 'primary' : ''} sp-linkbtn`}
                  onClick={() => setLinkMode(!linkMode)}
                >
                  <Link2 size={15} />
                  {linkMode ? 'Linking…' : 'Link fixtures'}
                </button>
                <button className="btn sp-linkbtn" onClick={() => setEditingBreakerId(breaker.id)}>
                  <Pencil size={15} /> Edit details
                </button>
              </div>
              {linkMode && (
                <p className="sp-hint muted">
                  Tap fixtures on the floor plan to link or unlink them from this breaker.
                </p>
              )}
            </>
          ) : (
            <p className="sp-hint muted">Switch to Edit mode to link fixtures or edit this breaker.</p>
          )}

          <div className="sp-section-title">
            Linked fixtures ({linked.length})
          </div>
          {linked.length === 0 ? (
            <p className="sp-empty muted">No fixtures linked yet.</p>
          ) : (
            <ul className="sp-list">
              {linked.map(({ placement, floorName }) => (
                <li key={placement.id} className="sp-list-item">
                  <button className="sp-list-main" onClick={() => goToPlacement(placement)}>
                    <span
                      className="sp-list-icon"
                      style={{ color: catalogById.get(placement.iconTypeId)?.color }}
                    >
                      <MarkerIcon icon={catalogById.get(placement.iconTypeId)} size={16} />
                    </span>
                    <span className="sp-list-text">
                      <span>{placement.label || catalogById.get(placement.iconTypeId)?.name || 'Fixture'}</span>
                      <span className="muted">{floorName}</span>
                    </span>
                    <MapPin size={13} className="muted" />
                  </button>
                  {isEdit && (
                    <button
                      className="icon-btn"
                      title="Unlink"
                      onClick={() => unlinkPlacementBreaker(placement.id, breaker.id)}
                    >
                      <Link2Off size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )
    }

    if (selectedPlacement) {
      const { placement, floorName } = selectedPlacement
      const icon = catalogById.get(placement.iconTypeId)
      const owners = placement.breakerIds
        .map((id) => allBreakers.find((b) => b.breaker.id === id))
        .filter((b): b is FoundBreaker => !!b)
      const availableToAdd = allBreakers.filter(
        ({ breaker }) => !placement.breakerIds.includes(breaker.id),
      )
      return (
        <>
          <div className="sp-headline">
            <span className="sp-fixture-icon" style={{ color: icon?.color }}>
              <MarkerIcon icon={icon} size={22} />
            </span>
            <div>
              <div className="sp-h-title">{placement.label || icon?.name || 'Fixture'}</div>
              <div className="sp-h-sub muted">{icon?.name} · {floorName}</div>
            </div>
          </div>

          {isEdit ? (
            <>
              <div className="field">
                <label>Label</label>
                <input
                  type="text"
                  value={placement.label}
                  placeholder="e.g. Over sink"
                  onChange={(e) => updatePlacement(placement.id, { label: e.target.value })}
                />
              </div>

              <div className="sp-adjust">
                <button
                  className="icon-btn"
                  title="Rotate"
                  onClick={() => updatePlacement(placement.id, { rotation: (placement.rotation + 15) % 360 })}
                >
                  <RotateCw size={16} />
                </button>
                <button
                  className="icon-btn"
                  title="Smaller"
                  onClick={() => updatePlacement(placement.id, { scale: Math.max(0.5, placement.scale - 0.15) })}
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  className="icon-btn"
                  title="Bigger"
                  onClick={() => updatePlacement(placement.id, { scale: Math.min(3, placement.scale + 0.15) })}
                >
                  <ZoomIn size={16} />
                </button>
                <div style={{ flex: 1 }} />
                <button
                  className="icon-btn"
                  title="Delete fixture"
                  onClick={() => deletePlacement(placement.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>

            </>
          ) : null}

          <div className="sp-section-title">Powered by ({owners.length})</div>
          {owners.length === 0 ? (
            <p className="sp-empty muted">Not linked to a breaker.</p>
          ) : (
            <ul className="sp-list">
              {owners.map(({ breaker, panel }) => (
                <li key={breaker.id} className="sp-list-item">
                  <button
                    className="sp-list-main"
                    onClick={() => select({ kind: 'breaker', id: breaker.id })}
                  >
                    <span className="sp-list-text">
                      <span>{breaker.label || `Breaker ${breaker.startSlot}`}</span>
                      <span className="muted">
                        {panel.name} · slot {breaker.startSlot} · {breaker.amps}A{' '}
                        {BREAKER_TYPE_META[breaker.type].short}
                      </span>
                    </span>
                    <Link2 size={13} className="muted" />
                  </button>
                  {isEdit && (
                    <button
                      className="icon-btn"
                      title="Unlink"
                      onClick={() => unlinkPlacementBreaker(placement.id, breaker.id)}
                    >
                      <Link2Off size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isEdit && availableToAdd.length > 0 && (
            <div className="field">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) void linkPlacementToBreaker(placement.id, e.target.value)
                }}
              >
                <option value="">+ Add a breaker…</option>
                {availableToAdd.map(({ breaker, panel }) => (
                  <option key={breaker.id} value={breaker.id}>
                    {panel.name} · slot {breaker.startSlot} · {breaker.amps}A{' '}
                    {BREAKER_TYPE_META[breaker.type].short}
                    {breaker.label ? ` · ${breaker.label}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isEdit && (
            <p className="sp-hint muted">Switch to Edit mode to rename, move, or relink this icon.</p>
          )}
        </>
      )
    }

    return (
      <div className="sp-nothing">
        <p className="muted">
          Select a breaker or a fixture to see its details and links here.
        </p>
      </div>
    )
  })()

  if (isMobile) {
    if (!open) return null
    return (
      <div className="sp-scrim no-print" onPointerDown={onClose}>
        <div className="sp sp-sheet" onPointerDown={(e) => e.stopPropagation()}>
          <div className="sp-head">
            <span>Details</span>
            <button className="icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="sp-content">{body}</div>
        </div>
      </div>
    )
  }

  if (!open) return null

  return (
    <aside className="sp sp-overlay no-print">
      <div className="sp-head">
        <span>Details</span>
        <button className="icon-btn" title="Hide panel" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="sp-content">{body}</div>
    </aside>
  )
}
