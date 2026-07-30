import { useMemo } from 'react'
import { Download, Printer } from 'lucide-react'
import type { Breaker, BreakerType, Floor, IconType, Panel, Placement } from '../../types'
import { BREAKER_TYPE_META } from '../../types'
import { useStore } from '../../lib/store'
import { blobUrl } from '../../lib/api'
import { breakerSlots, computePanelLayout, slotOccupancy } from '../../lib/panelLayout'
import { exportProject } from '../../lib/exportImport'
import MarkerIcon from '../common/MarkerIcon'
import './ReportView.css'

// A panel diagram taller than this many slots gets split across pages —
// a 40-space panel is the common residential size and fits comfortably on
// one US Letter page at the report's diagram sizing.
const PANEL_PAGE_SLOT_LIMIT = 40
// The shared "standard" breaker color is a mid-gray that reads fine on the
// app's dark surfaces but fails contrast against the report's light
// background with dark text — lighten it for the print badge only,
// everywhere else (app UI, other breaker types) is unaffected.
const REPORT_BADGE_COLOR: Partial<Record<BreakerType, string>> = {
  standard: '#cbd5e1',
}
function reportBadgeColor(type: BreakerType): string {
  return REPORT_BADGE_COLOR[type] ?? BREAKER_TYPE_META[type].color
}

/**
 * Bounding box for a floor figure, expanded to include the given placements
 * (which may sit outside the image itself — see the fitView note on
 * FloorPlanCanvas) plus a small margin so a pin marker right at the edge
 * doesn't get its circle clipped.
 */
function computeFloorBox(floor: Floor, placements: Placement[]) {
  let minX = 0
  let minY = 0
  let maxX = floor.imgW
  let maxY = floor.imgH
  for (const p of placements) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const padX = (maxX - minX) * 0.04
  const padY = (maxY - minY) * 0.04
  minX -= padX
  minY -= padY
  maxX += padX
  maxY += padY
  return { minX, minY, maxX, maxY, boxW: maxX - minX, boxH: maxY - minY }
}

/**
 * Row count for the first page of a panel diagram — capped so no more than
 * PANEL_PAGE_SLOT_LIMIT slots render on page 1, but nudged forward if that
 * cap would otherwise cut a multi-pole breaker's block in half.
 */
function computeFirstPageRows(
  panel: Panel,
  layout: ReturnType<typeof computePanelLayout>,
  occ: Map<number, Breaker>,
): number {
  let splitRow = Math.min(
    Math.max(1, Math.ceil(PANEL_PAGE_SLOT_LIMIT / panel.columns)),
    layout.rows,
  )
  for (const cell of layout.cells) {
    const breaker = occ.get(cell.slot)
    if (!breaker || breaker.startSlot !== cell.slot) continue
    const endRow = cell.row + breaker.span - 1
    if (cell.row < splitRow && endRow >= splitRow) splitRow = endRow + 1
  }
  return Math.min(splitRow, layout.rows)
}

export default function ReportView() {
  const project = useStore((s) => s.project)!

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
            floors={project.floors}
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
  floors,
  catalogById,
}: {
  panel: Panel
  floors: Floor[]
  catalogById: Map<string, IconType>
}) {
  const layout = computePanelLayout(panel)
  const occ = slotOccupancy(panel)
  const ordered = [...panel.breakers].sort((a, b) => a.startSlot - b.startSlot)

  const firstPageRows = computeFirstPageRows(panel, layout, occ)
  const pages =
    firstPageRows < layout.rows
      ? [
          { rowStart: 0, rowEnd: firstPageRows },
          { rowStart: firstPageRows, rowEnd: layout.rows },
        ]
      : [{ rowStart: 0, rowEnd: layout.rows }]

  function breakersInRows(rowStart: number, rowEnd: number, col?: number) {
    return ordered.filter((b) => {
      const cell = layout.bySlot.get(b.startSlot)
      if (!cell || cell.row < rowStart || cell.row >= rowEnd) return false
      return col === undefined || cell.col === col
    })
  }

  return (
    <>
      <section className="rp-section avoid-break">
        <h2 className="rp-h2">{panel.name}</h2>
        <div className="rp-panel-meta">
          {panel.model && <span><b>Model:</b> {panel.model}</span>}
          <span><b>Main:</b> {panel.mainAmperage}A</span>
          <span><b>Voltage:</b> {panel.voltage}V</span>
          <span><b>Spaces:</b> {panel.spaces}</span>
          <span><b>Numbering:</b> {panel.numbering === 'odd-even' ? 'Odd/Even' : 'Sequential'}</span>
        </div>

        {ordered.length === 0 ? (
          <p className="rp-dim">No breakers configured.</p>
        ) : panel.columns === 2 ? (
          <div className="rp-panel-layout rp-panel-layout-split">
            <PanelSideList breakers={breakersInRows(pages[0].rowStart, pages[0].rowEnd, 0)} />
            <PanelFigure panel={panel} layout={layout} occ={occ} {...pages[0]} />
            <PanelSideList breakers={breakersInRows(pages[0].rowStart, pages[0].rowEnd, 1)} />
          </div>
        ) : (
          <div className="rp-panel-layout">
            <PanelFigure panel={panel} layout={layout} occ={occ} {...pages[0]} />
            <PanelSideList breakers={breakersInRows(pages[0].rowStart, pages[0].rowEnd)} />
          </div>
        )}
      </section>

      {/* Slots beyond the 40-space page limit continue on their own page(s)
          instead of shrinking the diagram further to force a single-page fit. */}
      {pages.slice(1).map((page, i) => (
        <section key={i} className="rp-section avoid-break page-break">
          <h2 className="rp-h2">
            {panel.name} <span className="rp-dim">(continued)</span>
          </h2>
          {panel.columns === 2 ? (
            <div className="rp-panel-layout rp-panel-layout-split">
              <PanelSideList breakers={breakersInRows(page.rowStart, page.rowEnd, 0)} />
              <PanelFigure panel={panel} layout={layout} occ={occ} {...page} />
              <PanelSideList breakers={breakersInRows(page.rowStart, page.rowEnd, 1)} />
            </div>
          ) : (
            <div className="rp-panel-layout">
              <PanelFigure panel={panel} layout={layout} occ={occ} {...page} />
              <PanelSideList breakers={breakersInRows(page.rowStart, page.rowEnd)} />
            </div>
          )}
        </section>
      ))}

      {/* One fixture-locator image + legend per breaker that actually has
          linked fixtures — skipped entirely for unlinked breakers so a
          mostly-empty panel doesn't produce dozens of blank sections. */}
      {ordered.map((b) => (
        <BreakerFixtureSection key={b.id} breaker={b} floors={floors} catalogById={catalogById} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------

/**
 * Static locator diagram of the panel, styled like the interactive workspace
 * diagram (slot numbers, amps, type badge) so a breaker can be found on the
 * physical panel and cross-referenced with the side lists' circuit labels.
 * Renders only rows [rowStart, rowEnd) — the caller splits a panel that
 * exceeds PANEL_PAGE_SLOT_LIMIT into more than one row range/page.
 */
function PanelFigure({
  panel,
  layout,
  occ,
  rowStart,
  rowEnd,
}: {
  panel: Panel
  layout: ReturnType<typeof computePanelLayout>
  occ: Map<number, Breaker>
  rowStart: number
  rowEnd: number
}) {
  const twoCol = panel.columns === 2
  const rendered = new Set<string>()
  const rowsInPage = rowEnd - rowStart

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
          gridTemplateRows: `repeat(${rowsInPage}, minmax(28px, auto))`,
        }}
      >
        {twoCol && (
          <div
            className="rp-panel-bus"
            style={{ gridColumn: 2, gridRow: `1 / span ${rowsInPage}` }}
          />
        )}
        {layout.cells
          .filter((cell) => cell.row >= rowStart && cell.row < rowEnd)
          .map((cell) => {
            const breaker = occ.get(cell.slot)
            const gridColumn = gridColumnFor(cell.col)

            if (!breaker) {
              return (
                <div
                  key={`slot-${cell.slot}`}
                  className={`rp-panel-empty col-${cell.col}`}
                  style={{ gridColumn, gridRow: cell.row - rowStart + 1 }}
                >
                  <span className="rp-panel-slot-num">{cell.slot}</span>
                </div>
              )
            }
            if (breaker.startSlot !== cell.slot || rendered.has(breaker.id)) return null
            rendered.add(breaker.id)

            const meta = BREAKER_TYPE_META[breaker.type]
            const startCell = layout.bySlot.get(breaker.startSlot)!
            const slots = breakerSlots(panel, breaker)
            return (
              <div
                key={breaker.id}
                className={`rp-panel-cell col-${cell.col}`}
                style={{
                  gridColumn,
                  gridRow: `${startCell.row - rowStart + 1} / span ${breaker.span}`,
                  ['--type-color' as string]: meta.color,
                }}
              >
                <span className="rp-panel-cell-slots">{slots.join('·')}</span>
                <span className="rp-panel-cell-main">
                  <span className="rp-panel-cell-amps">{breaker.amps}A</span>
                  <span
                    className="rp-panel-cell-type"
                    style={{ background: reportBadgeColor(breaker.type) }}
                  >
                    {meta.short}
                  </span>
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Circuit/label list flanking the panel figure — one side per physical column. */
function PanelSideList({ breakers }: { breakers: Breaker[] }) {
  if (breakers.length === 0) return <div className="rp-panel-side" />
  return (
    <ol className="rp-panel-side">
      {breakers.map((b) => (
        <li key={b.id}>
          <span className="rp-panel-side-slot mono">{b.startSlot}</span>
          <span className="rp-panel-side-text">
            <b>{b.label || '—'}</b>
            {b.description && <span className="rp-desc">{b.description}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------

/**
 * One breaker's own fixture locator: a small floor image with pins for only
 * this breaker's linked placements, plus a matching legend — repeated per
 * floor for breakers whose fixtures span more than one. Renders nothing for
 * a breaker with no linked fixtures.
 */
function BreakerFixtureSection({
  breaker,
  floors,
  catalogById,
}: {
  breaker: Breaker
  floors: Floor[]
  catalogById: Map<string, IconType>
}) {
  const meta = BREAKER_TYPE_META[breaker.type]
  const groups = floors
    .map((floor) => ({
      floor,
      placements: floor.placements.filter((p) => p.breakerIds.includes(breaker.id)),
    }))
    .filter((g) => g.placements.length > 0)

  if (groups.length === 0) return null

  return (
    <section className="rp-section avoid-break rp-breaker-fixture">
      <div className="rp-breaker-fixture-title">
        <span className="rp-type-chip" style={{ background: reportBadgeColor(breaker.type) }}>
          {meta.short}
        </span>
        <span>
          Breaker {breaker.startSlot} · {breaker.label || 'Unlabeled circuit'}
        </span>
      </div>
      {groups.map(({ floor, placements }) => (
        <div key={floor.id} className="rp-breaker-fixture-floor">
          {groups.length > 1 && (
            <div className="rp-breaker-fixture-floor-name">{floor.name}</div>
          )}
          <BreakerFloorFigure floor={floor} placements={placements} catalogById={catalogById} />
        </div>
      ))}
    </section>
  )
}

/** Small image + legend for one breaker's placements on one floor. */
function BreakerFloorFigure({
  floor,
  placements,
  catalogById,
}: {
  floor: Floor
  placements: Placement[]
  catalogById: Map<string, IconType>
}) {
  const url = floor.imageId ? blobUrl(floor.imageId) : undefined
  const numbered = placements.map((p, i) => ({ p, n: i + 1 }))
  const { minX, minY, boxW, boxH } = computeFloorBox(floor, placements)

  return (
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
        <ol className="rp-legend-list">
          {numbered.map(({ p, n }) => {
            const icon = catalogById.get(p.iconTypeId)
            return (
              <li key={p.id}>
                <span className="rp-legend-n">{n}</span>
                <span className="rp-legend-icon" style={{ color: icon?.color }}>
                  <MarkerIcon icon={icon} size={14} />
                </span>
                <span className="rp-legend-text">
                  <b>{p.label || icon?.name || 'Fixture'}</b>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

