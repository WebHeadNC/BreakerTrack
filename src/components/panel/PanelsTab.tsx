import { useState } from 'react'
import { LayoutGrid, Plus, Settings2, Trash2 } from 'lucide-react'
import type { Panel } from '../../types'
import { useStore, useActivePanel } from '../../lib/store'
import { confirmDialog } from '../../lib/dialog'
import PanelDiagram from './PanelDiagram'
import BreakerForm from './BreakerForm'
import PanelConfigModal from './PanelConfigModal'
import './PanelsTab.css'

export default function PanelsTab() {
  const project = useStore((s) => s.project)!
  const activePanelId = useStore((s) => s.activePanelId)
  const setActivePanel = useStore((s) => s.setActivePanel)
  const deletePanel = useStore((s) => s.deletePanel)
  const panel = useActivePanel()
  const mode = useStore((s) => s.mode)
  const isEdit = mode === 'edit'
  const editingBreakerId = useStore((s) => s.editingBreakerId)
  const setEditingBreakerId = useStore((s) => s.setEditingBreakerId)

  const [configPanel, setConfigPanel] = useState<Panel | 'new' | null>(null)
  const [addSlot, setAddSlot] = useState<number | null>(null)
  const editingBreaker = panel?.breakers.find((b) => b.id === editingBreakerId) ?? null

  const panels = project.panels

  if (panels.length === 0) {
    return (
      <div className="pt-empty">
        <div className="empty">
          <LayoutGrid size={44} />
          <div>
            <h3>Add a breaker panel</h3>
            <p className="muted">Configure rows, spaces, and numbering to match your panel.</p>
          </div>
          <button className="btn primary" onClick={() => setConfigPanel('new')}>
            <Plus size={16} /> New panel
          </button>
        </div>
        {configPanel && (
          <PanelConfigModal
            existing={configPanel === 'new' ? null : configPanel}
            onClose={() => setConfigPanel(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="pt">
      <div className="pt-bar no-print">
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
          <button className="btn sm" onClick={() => setConfigPanel('new')}>
            <Plus size={14} /> Panel
          </button>
        )}
      </div>

      {panel && (
        <div className="pt-body">
          <div className="pt-panel-head card">
            <div className="pt-panel-meta">
              <h3>{panel.name}</h3>
              <div className="pt-panel-specs muted">
                {panel.model && <span>{panel.model}</span>}
                <span className="mono">{panel.mainAmperage}A main</span>
                <span className="mono">{panel.voltage}V</span>
                <span>
                  {panel.spaces} spaces · {panel.columns === 2 ? '2-col' : '1-col'} ·{' '}
                  {panel.numbering === 'odd-even' ? 'odd/even' : 'sequential'}
                </span>
              </div>
            </div>
            {isEdit && (
              <div className="pt-panel-tools">
                <button className="btn sm" onClick={() => setConfigPanel(panel)}>
                  <Settings2 size={14} /> Settings
                </button>
                <button
                  className="icon-btn"
                  title="Delete panel"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: 'Delete panel',
                      message: `Delete panel "${panel.name}" and all its breakers?`,
                      confirmText: 'Delete',
                      danger: true,
                    })
                    if (ok) deletePanel(panel.id)
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="pt-diagram-scroll">
            <PanelDiagram panel={panel} editable={isEdit} onAddAtSlot={(slot) => setAddSlot(slot)} />
          </div>
        </div>
      )}

      {configPanel && (
        <PanelConfigModal
          existing={configPanel === 'new' ? null : configPanel}
          onClose={() => setConfigPanel(null)}
        />
      )}

      {panel && (editingBreaker || addSlot !== null) && (
        <BreakerForm
          panel={panel}
          editing={editingBreaker}
          createAtSlot={addSlot}
          onClose={() => {
            setEditingBreakerId(null)
            setAddSlot(null)
          }}
        />
      )}
    </div>
  )
}
