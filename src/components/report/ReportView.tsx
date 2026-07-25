import { useMemo } from 'react'
import { Download, Printer } from 'lucide-react'
import type { Breaker, Floor, IconType, Panel, Project } from '../../types'
import { BREAKER_TYPE_META } from '../../types'
import { useStore } from '../../lib/store'
import { blobUrl } from '../../lib/api'
import { breakerSlots } from '../../lib/panelLayout'
import { exportProject } from '../../lib/exportImport'
import MarkerIcon from '../common/MarkerIcon'
import './ReportView.css'

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
        .filter((p) => p.breakerId === breakerId)
        .map((p) => {
          const name = p.label || catalogById.get(p.iconTypeId)?.name || 'Fixture'
          return `${name} (${f.name})`
        }),
    )

  const ordered = [...panel.breakers].sort((a, b) => a.startSlot - b.startSlot)

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

      <table className="rp-table">
        <thead>
          <tr>
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
              <td colSpan={5} className="rp-empty-row">No breakers configured.</td>
            </tr>
          ) : (
            ordered.map((b) => {
              const meta = BREAKER_TYPE_META[b.type]
              const slots = breakerSlots(panel, b).join(', ')
              const fixtures = linkedFor(b.id)
              return (
                <tr key={b.id}>
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
    </section>
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

  return (
    <section className="rp-section page-break">
      <h2 className="rp-h2">{floor.name}</h2>
      <div className="rp-floor-layout">
        <div className="rp-floor-figure">
          {url ? (
            <div className="rp-floor-img-wrap" style={{ aspectRatio: `${floor.imgW} / ${floor.imgH}` }}>
              <img src={url} alt={floor.name} />
              {numbered.map(({ p, n }) => (
                <span
                  key={p.id}
                  className="rp-pin"
                  style={{
                    left: `${(p.x / floor.imgW) * 100}%`,
                    top: `${(p.y / floor.imgH) * 100}%`,
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
            <ol className="rp-legend-list">
              {numbered.map(({ p, n }) => {
                const icon = catalogById.get(p.iconTypeId)
                const owner = p.breakerId ? breakerIndex.get(p.breakerId) : undefined
                return (
                  <li key={p.id}>
                    <span className="rp-legend-n">{n}</span>
                    <span className="rp-legend-icon" style={{ color: icon?.color }}>
                      <MarkerIcon icon={icon} size={14} />
                    </span>
                    <span className="rp-legend-text">
                      <b>{p.label || icon?.name || 'Fixture'}</b>
                      {owner ? (
                        <span className="rp-legend-ckt">
                          {owner.panel.name} · slot {owner.breaker.startSlot} ·{' '}
                          {owner.breaker.amps}A {BREAKER_TYPE_META[owner.breaker.type].short}
                        </span>
                      ) : (
                        <span className="rp-legend-ckt rp-dim">Unlinked</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
