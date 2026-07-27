import { useMemo } from 'react'
import { Link2, Plus } from 'lucide-react'
import type { Panel } from '../../types'
import { BREAKER_TYPE_META } from '../../types'
import { useStore } from '../../lib/store'
import { breakerSlots, computePanelLayout, slotOccupancy } from '../../lib/panelLayout'
import './PanelDiagram.css'

interface Props {
  panel: Panel
  /** Whether empty slots can be clicked to add a new breaker (edit mode only). */
  editable: boolean
  onAddAtSlot: (slot: number) => void
}

export default function PanelDiagram({ panel, editable, onAddAtSlot }: Props) {
  const project = useStore((s) => s.project)!
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)

  const layout = useMemo(() => computePanelLayout(panel), [panel])
  const occ = useMemo(() => slotOccupancy(panel), [panel])

  // Count of linked fixtures per breaker id.
  const linkCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of project.floors) {
      for (const pl of f.placements) {
        for (const bid of pl.breakerIds) m.set(bid, (m.get(bid) ?? 0) + 1)
      }
    }
    return m
  }, [project.floors])

  // Which breaker(s) are highlighted (directly selected, or all owners of the selected placement).
  const selectedBreakerIds = useMemo(() => {
    if (selection?.kind === 'breaker') return new Set([selection.id])
    if (selection?.kind === 'placement') {
      for (const f of project.floors) {
        const pl = f.placements.find((p) => p.id === selection.id)
        if (pl) return new Set(pl.breakerIds)
      }
    }
    return new Set<string>()
  }, [selection, project.floors])

  const twoCol = panel.columns === 2
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: twoCol ? '1fr 42px 1fr' : '1fr',
    gridTemplateRows: `repeat(${layout.rows}, minmax(46px, auto))`,
  }

  function gridColumnFor(col: number): number {
    if (!twoCol) return 1
    return col === 0 ? 1 : 3
  }

  const renderedBreakers = new Set<string>()

  return (
    <div className="pd">
      <div className="pd-grid" style={gridStyle}>
        {twoCol && (
          <div className="pd-bus" style={{ gridColumn: 2, gridRow: `1 / span ${layout.rows}` }}>
            <span>MAIN</span>
          </div>
        )}

        {layout.cells.map((cell) => {
          const breaker = occ.get(cell.slot)

          // Empty slot -> placeholder that adds a breaker (edit mode only).
          if (!breaker) {
            if (!editable) {
              return (
                <div
                  key={`slot-${cell.slot}`}
                  className={`pd-empty pd-empty-static col-${cell.col}`}
                  style={{ gridColumn: gridColumnFor(cell.col), gridRow: cell.row + 1 }}
                >
                  <span className="pd-slot-num">{cell.slot}</span>
                </div>
              )
            }
            return (
              <button
                key={`slot-${cell.slot}`}
                className={`pd-empty col-${cell.col}`}
                style={{ gridColumn: gridColumnFor(cell.col), gridRow: cell.row + 1 }}
                onClick={() => onAddAtSlot(cell.slot)}
                title={`Add breaker at slot ${cell.slot}`}
              >
                <span className="pd-slot-num">{cell.slot}</span>
                <Plus size={14} className="pd-empty-plus" />
              </button>
            )
          }

          // Only render the breaker block once, at its starting cell.
          if (breaker.startSlot !== cell.slot || renderedBreakers.has(breaker.id)) {
            return null
          }
          renderedBreakers.add(breaker.id)

          const meta = BREAKER_TYPE_META[breaker.type]
          const slots = breakerSlots(panel, breaker)
          const links = linkCounts.get(breaker.id) ?? 0
          const isSel = selectedBreakerIds.has(breaker.id)
          const startCell = layout.bySlot.get(breaker.startSlot)!

          return (
            <button
              key={breaker.id}
              className={`pd-breaker col-${cell.col} ${isSel ? 'sel' : ''}`}
              style={{
                gridColumn: gridColumnFor(startCell.col),
                gridRow: `${startCell.row + 1} / span ${breaker.span}`,
                ['--type-color' as string]: meta.color,
              }}
              onClick={() => select({ kind: 'breaker', id: breaker.id })}
            >
              <span className="pd-breaker-slots">
                {slots.join('·')}
              </span>
              <span className="pd-breaker-main">
                <span className="pd-breaker-amps">{breaker.amps}A</span>
                <span className="pd-breaker-type">{meta.short}</span>
              </span>
              {breaker.label && <span className="pd-breaker-label">{breaker.label}</span>}
              {links > 0 && (
                <span className="pd-breaker-links" title={`${links} linked fixture(s)`}>
                  <Link2 size={11} /> {links}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
