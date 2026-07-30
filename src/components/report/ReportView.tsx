import { useMemo } from 'react'
import { Download, Printer } from 'lucide-react'
import type { Breaker, Floor, IconType, Panel, Placement, Project } from '../../types'
import { BREAKER_TYPE_META } from '../../types'
import { useStore } from '../../lib/store'
import { blobUrl } from '../../lib/api'
import { breakerSlots, computePanelLayout, slotOccupancy } from '../../lib/panelLayout'
import { exportProject } from '../../lib/exportImport'
import MarkerIcon from '../common/MarkerIcon'
import './ReportView.css'

// The report is a fixed US Letter page (see .report in ReportView.css) —
// these mirror its CSS so figure/column math can be done here instead of
// measuring the DOM.
const REPORT_WIDTH_PX = 816 // 8.5in @ 96dpi
const REPORT_PAD_X_PX = 44
const FLOOR_LAYOUT_GAP_PX = 20
const FLOOR_IMAGE_FR = 1.4
const FLOOR_LEGEND_FR = 1
// Rough single-line legend row height (label + circuit line + margin),
// used only to decide whether the list would run past the figure in one
// column — an approximation is fine since a wrong guess just means the
// split happens a little earlier/later than exactly necessary, not a
// visible glitch either way.
const LEGEND_ROW_ESTIMATE_PX = 38

export default function ReportView() {
  const project = useStore((s) => s.project)!

  const breakerIndex = useMemo(() => {
    const m = new Map<string, { breaker: Breaker; panel: Panel }>()
    for (const panel of project.panels) {
      for (const breaker of panel.breakers) m.set(breaker.id, { breaker, panel })
    }
    return m
  }, [project.panels])

  const catalogById = useMemo(
    () => new Map(project.catalog.map((c) => [c.id, c])),
    [project.catalog],
  )

  return (
    <div className="rv-wrap">
      <div className="rv-toolbar no-print">
        <span className="muted">Preview of the printable report.</span>
        <div className="rv-toolbar-actions">
          <button className="btn" onClick={() => exportProject(project)}>
            <Download size={16} /> Export .json
          </button>
          <button className="btn primary" onClick={() => window.print()}>
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>
      </div>

      <div className="report">
        <header className="rp-cover">
          <h1>{project.name}</h1>
          <p className="rp-cover-sub">
            Electrical map · {project.floors.length} floor
            {project.floors.length === 1 ? '' : 's'} · {project.panels.length} panel
            {project.panels.length === 1 ? '' : 's'}
          </p>
          <p className="rp-cover-date">Generated {new Date().toLocaleDateString()}</p>
        </header>

        {project.panels.map((panel) => (
          <PanelSchedule
            key={panel.id}
            panel={panel}
            project={project}
            catalogById={catalogById}
          />
        ))}

        {project.floors.map((floor) => (
          <FloorReport
            key={floor.id}
            floor={floor}
            breakerIndex={breakerIndex}
            catalogById={catalogById}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function PanelSchedule({
  panel,
  project,
  catalogById,
}: {
  panel: Panel
  project: Project
  catalogById: Map<string, IconType>
}) {
  // Fixtures linked to each breaker, with floor name.
  const linkedFor = (breakerId: string) =>
    project.floors.flatMap((f) =>
      f.placements
        .filter((p) => p.breakerIds.includes(breakerId))
        .map((p) => {
          const name = p.label || catalogById.get(p.iconTypeId)?.name || 'Fixture'
          return `${name} (${f.name})`
        }),
    )

  const ordered = [...panel.breakers].sort((a, b) => a.startSlot - b.startSlot)
  const indexById = new Map(ordered.map((b, i) => [b.id, i + 1]))

  return (
    <section className="rp-section avoid-break">
      <h2 className="rp-h2">{panel.name}</h2>
      <div className="rp-panel-meta">
        {panel.model && <span><b>Model:</b> {panel.model}</span>}
        <span><b>Main:</b> {panel.mainAmperage}A</span>
        <span><b>Voltage:</b> {panel.voltage}V</span>
        <span><b>Spaces:</b> {panel.spaces}</span>
        <span><b>Numbering:</b> {panel.numbering === 'odd-even' ? 'Odd/Even' : 'Sequential'}</span>
      </div>

      <div className="rp-panel-layout">
        {ordered.length > 0 && <PanelFigure panel={panel} indexById={indexById} />}

        <table className="rp-table">
          <thead>
            <tr>
              <th className="rp-col-n">#</th>
              <th className="rp-col-slot">Slot</th>
              <th className="rp-col-amps">Amps</th>
              <th className="rp-col-type">Type</th>
              <th>Circuit / Label</th>
              <th>Linked fixtures</th>
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 ? (
              <tr>
                <td colSpan={6} className="rp-empty-row">No breakers configured.</td>
              </tr>
            ) : (
              ordered.map((b) => {
                const meta = BREAKER_TYPE_META[b.type]
                const slots = breakerSlots(panel, b).join(', ')
                const fixtures = linkedFor(b.id)
                return (
                  <tr key={b.id}>
                    <td className="rp-col-n mono">{indexById.get(b.id)}</td>
                    <td className="rp-col-slot mono">{slots}</td>
                    <td className="rp-col-amps mono">{b.amps}A</td>
                    <td className="rp-col-type">
                      <span className="rp-type-chip" style={{ background: meta.color }}>
                        {meta.short}
                      </span>
                    </td>
                    <td>
                      <div className="rp-label">{b.label || '—'}</div>
                      {b.description && <div className="rp-desc">{b.description}</div>}
                    </td>
                    <td className="rp-fixtures">
                      {fixtures.length ? fixtures.join(' · ') : <span className="rp-dim">—</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

/**
 * Small static locator diagram of the panel: each occupied slot shows the
 * same index number as its row in the schedule table, so a breaker can be
 * found on the physical panel without cross-referencing slot numbers.
 */
function PanelFigure({ panel, indexById }: { panel: Panel; indexById: Map<string, number> }) {
  const layout = useMemo(() => computePanelLayout(panel), [panel])
  const occ = useMemo(() => slotOccupancy(panel), [panel])
  const twoCol = panel.columns === 2
  const rendered = new Set<string>()

  function gridColumnFor(col: number): number {
    if (!twoCol) return 1
    return col === 0 ? 1 : 3
  }

  return (
    <div className="rp-panel-figure">
      <div
        className="rp-panel-grid"
        style={{
          gridTemplateColumns: twoCol ? '1fr 18px 1fr' : '1fr',
          gridTemplateRows: `repeat(${layout.rows}, 22px)`,
        }}
      >
        {twoCol && (
          <div
            className="rp-panel-bus"
            style={{ gridColumn: 2, gridRow: `1 / span ${layout.rows}` }}
          />
        )}
        {layout.cells.map((cell) => {
          const breaker = occ.get(cell.slot)
          const gridColumn = gridColumnFor(cell.col)

          if (!breaker) {
            return (
              <div
                key={`slot-${cell.slot}`}
                className="rp-panel-empty"
                style={{ gridColumn, gridRow: cell.row + 1 }}
              />
            )
          }
          if (breaker.startSlot !== cell.slot || rendered.has(breaker.id)) return null
          rendered.add(breaker.id)

          const meta = BREAKER_TYPE_META[breaker.type]
          const startCell = layout.bySlot.get(breaker.startSlot)!
          return (
            <div
              key={breaker.id}
              className="rp-panel-cell"
              style={{
                gridColumn,
                gridRow: `${startCell.row + 1} / span ${breaker.span}`,
                background: meta.color,
              }}
            >
              {indexById.get(breaker.id)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function FloorReport({
  floor,
  breakerIndex,
  catalogById,
}: {
  floor: Floor
  breakerIndex: Map<string, { breaker: Breaker; panel: Panel }>
  catalogById: Map<string, IconType>
}) {
  const url = floor.imageId ? blobUrl(floor.imageId) : undefined
  const numbered = floor.placements.map((p, i) => ({ p, n: i + 1 }))

  // Expand the figure's bounds to include any icon placed outside the image
  // itself (same idea as the floor plan canvas's default view) — otherwise
  // an out-of-bounds pin gets cropped by the wrap's overflow:hidden.
  let minX = 0
  let minY = 0
  let maxX = floor.imgW
  let maxY = floor.imgH
  for (const p of floor.placements) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  // A pin marker has its own on-screen radius, so a placement sitting right
  // on the computed edge would still get its circle half-clipped — pad the
  // box a little further out to leave it room.
  const padX = (maxX - minX) * 0.04
  const padY = (maxY - minY) * 0.04
  minX -= padX
  minY -= padY
  maxX += padX
  maxY += padY
  const boxW = maxX - minX
  const boxH = maxY - minY

  // The legend next to the map should stay a single column sized to the
  // map's height — anything past that runs on in a wider two-column block
  // below the figure instead of overflowing past it. The report is a fixed
  // 8.5in page (see .report / .rp-floor-layout in ReportView.css), so the
  // figure's rendered height is fully determined by that fixed layout —
  // compute it here rather than measuring the DOM.
  const reportContentWidth = REPORT_WIDTH_PX - REPORT_PAD_X_PX * 2
  const figureColWidth =
    ((reportContentWidth - FLOOR_LAYOUT_GAP_PX) * FLOOR_IMAGE_FR) /
    (FLOOR_IMAGE_FR + FLOOR_LEGEND_FR)
  const figureHeight = url ? (figureColWidth * boxH) / boxW : 0
  const sideCount = url
    ? Math.max(0, Math.floor(figureHeight / LEGEND_ROW_ESTIMATE_PX))
    : numbered.length
  const sideItems = numbered.slice(0, sideCount)
  const overflowItems = numbered.slice(sideCount)

  const legendItem = ({ p, n }: { p: Placement; n: number }) => {
    const icon = catalogById.get(p.iconTypeId)
    const owners = p.breakerIds
      .map((id) => breakerIndex.get(id))
      .filter((o): o is { breaker: Breaker; panel: Panel } => !!o)
    return (
      <li key={p.id}>
        <span className="rp-legend-n">{n}</span>
        <span className="rp-legend-icon" style={{ color: icon?.color }}>
          <MarkerIcon icon={icon} size={14} />
        </span>
        <span className="rp-legend-text">
          <b>{p.label || icon?.name || 'Fixture'}</b>
          {owners.length > 0 ? (
            owners.map((owner) => (
              <span key={owner.breaker.id} className="rp-legend-ckt">
                {owner.panel.name} · slot {owner.breaker.startSlot} ·{' '}
                {owner.breaker.amps}A {BREAKER_TYPE_META[owner.breaker.type].short}
              </span>
            ))
          ) : (
            <span className="rp-legend-ckt rp-dim">Unlinked</span>
          )}
        </span>
      </li>
    )
  }

  return (
    <section className="rp-section page-break">
      <h2 className="rp-h2">{floor.name}</h2>
      <div className="rp-floor-layout">
        <div className="rp-floor-figure">
          {url ? (
            <div className="rp-floor-img-wrap" style={{ aspectRatio: `${boxW} / ${boxH}` }}>
              <img
                src={url}
                alt={floor.name}
                style={{
                  left: `${(-minX / boxW) * 100}%`,
                  top: `${(-minY / boxH) * 100}%`,
                  width: `${(floor.imgW / boxW) * 100}%`,
                  height: `${(floor.imgH / boxH) * 100}%`,
                }}
              />
              {numbered.map(({ p, n }) => (
                <span
                  key={p.id}
                  className="rp-pin"
                  style={{
                    left: `${((p.x - minX) / boxW) * 100}%`,
                    top: `${((p.y - minY) / boxH) * 100}%`,
                    borderColor: catalogById.get(p.iconTypeId)?.color ?? '#334155',
                  }}
                >
                  {n}
                </span>
              ))}
            </div>
          ) : (
            <div className="rp-noimg">No image</div>
          )}
        </div>

        <div className="rp-legend">
          <div className="rp-legend-title">Legend</div>
          {numbered.length === 0 ? (
            <p className="rp-dim">No fixtures placed.</p>
          ) : (
            <ol className="rp-legend-list">{sideItems.map(legendItem)}</ol>
          )}
        </div>
      </div>

      {overflowItems.length > 0 && (
        <div className="rp-legend-overflow">
          <ol className="rp-legend-list rp-legend-list-cols">
            {overflowItems.map(legendItem)}
          </ol>
        </div>
      )}
    </section>
  )
}
