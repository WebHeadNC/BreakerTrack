import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  Eye,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  Map as MapIcon,
  PanelRight,
  Pencil,
  Printer,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { useIsMobile } from '../lib/useIsMobile'
import FloorPlansTab from '../components/floorplan/FloorPlansTab'
import PanelsTab from '../components/panel/PanelsTab'
import ReportView from '../components/report/ReportView'
import SelectionPanel from '../components/common/SelectionPanel'
import './Editor.css'

type Tab = 'floors' | 'panels' | 'report'

// Mobile screens are too small to show the floor plan and breaker panel at
// once, so the bottom nav keeps them as separate tabs.
const MOBILE_TABS: { id: Tab; label: string; Icon: typeof MapIcon }[] = [
  { id: 'floors', label: 'Floor Plans', Icon: MapIcon },
  { id: 'panels', label: 'Panels', Icon: LayoutGrid },
  { id: 'report', label: 'Report', Icon: Printer },
]

// Desktop has room to show the floor plan and the breaker panel together, so
// 'floors' becomes a combined workspace and there's no separate panels tab.
const DESKTOP_TABS: { id: Tab; label: string; Icon: typeof MapIcon }[] = [
  { id: 'floors', label: 'Workspace', Icon: LayoutDashboard },
  { id: 'report', label: 'Report', Icon: Printer },
]

export default function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const project = useStore((s) => s.project)
  const loadProject = useStore((s) => s.loadProject)
  const closeProject = useStore((s) => s.closeProject)
  const remotelyDeleted = useStore((s) => s.remotelyDeleted)
  const selection = useStore((s) => s.selection)
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const linkMode = useStore((s) => s.linkMode)
  const setLinkMode = useStore((s) => s.setLinkMode)
  const [tab, setTab] = useState<Tab>('floors')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (id) loadProject(id)
    return () => closeProject()
  }, [id, loadProject, closeProject])

  // Desktop has no standalone "Panels" tab (it's folded into the workspace
  // dock) — if the window resizes from mobile while that tab is active, land
  // on the workspace instead of a dead tab.
  useEffect(() => {
    if (!isMobile && tab === 'panels') setTab('floors')
  }, [isMobile, tab])

  // Open the selection drawer on mobile whenever something is selected — and,
  // since the floor plan and the breaker panel live on separate tabs here
  // (unlike desktop, where both are visible together), also jump to
  // whichever tab actually shows the thing it's connected to, so the
  // highlighted ring lands on screen instead of on a tab the user isn't on.
  useEffect(() => {
    if (!isMobile || !selection || !project) return
    setDrawerOpen(true)
    if (selection.kind === 'breaker') {
      const hasFixture = project.floors.some((f) =>
        f.placements.some((p) => p.breakerIds.includes(selection.id)),
      )
      if (hasFixture) setTab('floors')
    } else {
      const placement = project.floors
        .flatMap((f) => f.placements)
        .find((p) => p.id === selection.id)
      if (placement && placement.breakerIds.length > 0) setTab('panels')
    }
  }, [selection, isMobile, project])

  // The project was deleted (by us or someone else) or never existed —
  // there's nothing to show here, so head back to the project list.
  useEffect(() => {
    if (remotelyDeleted) navigate('/')
  }, [remotelyDeleted, navigate])

  if (!project) {
    return (
      <div className="ed-loading">
        <span className="muted">Loading…</span>
      </div>
    )
  }

  const showReport = tab === 'report'

  // Mobile has no always-visible breaker panel to show "you're linking this
  // breaker" — so while link mode is on, a banner stands in for it (with an
  // end button, since there's otherwise no indication link mode is active).
  const linkingBreaker =
    isMobile && linkMode && selection?.kind === 'breaker'
      ? project.panels.flatMap((p) => p.breakers).find((b) => b.id === selection.id) ?? null
      : null

  return (
    <div className={`ed ${isMobile ? 'ed-mobile' : ''}`}>
      <header className="ed-top no-print">
        <button
          className="btn ghost sm"
          onClick={() => navigate('/')}
          title="All projects"
        >
          <ChevronLeft size={18} /> {!isMobile && 'Projects'}
        </button>
        <h1 className="ed-title" title={project.name}>
          {project.name}
        </h1>

        {!isMobile && (
          <nav className="ed-tabs">
            {DESKTOP_TABS.map(({ id: tid, label, Icon }) => (
              <button
                key={tid}
                className={`ed-tab ${tab === tid ? 'active' : ''}`}
                onClick={() => setTab(tid)}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>
        )}

        <div className="ed-top-right">
          {!showReport && (
            <>
              <div className="ed-mode-toggle" role="group" aria-label="Mode">
                <button
                  className={mode === 'view' ? 'active' : ''}
                  onClick={() => setMode('view')}
                  title="View mode — click to inspect, nothing changes"
                >
                  <Eye size={14} /> {!isMobile && 'View'}
                </button>
                <button
                  className={mode === 'edit' ? 'active' : ''}
                  onClick={() => setMode('edit')}
                  title="Edit mode — place icons, link fixtures, edit breakers"
                >
                  <Pencil size={14} /> {!isMobile && 'Edit'}
                </button>
              </div>
              {isMobile && (
                <button
                  className={`icon-btn ${selection ? 'has-sel' : ''}`}
                  title="Details"
                  onClick={() => setDrawerOpen((v) => !v)}
                >
                  <PanelRight size={18} />
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {linkingBreaker && (
        <div className="ed-link-banner no-print">
          <Link2 size={14} />
          <span>
            Link to breaker ({linkingBreaker.label || `Breaker ${linkingBreaker.startSlot}`})
          </span>
          <button className="btn sm" onClick={() => setLinkMode(false)}>
            End
          </button>
        </div>
      )}

      <div className="ed-body">
        <main className="ed-content">
          {tab === 'floors' && <FloorPlansTab />}
          {tab === 'panels' && <PanelsTab />}
          {tab === 'report' && <ReportView />}
        </main>

        {isMobile && !showReport && (
          <SelectionPanel
            isMobile
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onGoToFloors={() => setTab('floors')}
          />
        )}
      </div>

      {isMobile && (
        <nav className="ed-bottomnav no-print">
          {MOBILE_TABS.map(({ id: tid, label, Icon }) => (
            <button
              key={tid}
              className={`ed-bnav-item ${tab === tid ? 'active' : ''}`}
              onClick={() => setTab(tid)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
