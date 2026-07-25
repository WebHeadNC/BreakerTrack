import { useState } from 'react'
import type { Panel, PanelNumbering } from '../../types'
import { useStore } from '../../lib/store'
import Modal from '../common/Modal'
import './PanelsTab.css'

export default function PanelConfigModal({
  existing,
  onClose,
}: {
  existing: Panel | null
  onClose: () => void
}) {
  const addPanel = useStore((s) => s.addPanel)
  const updatePanel = useStore((s) => s.updatePanel)

  const [name, setName] = useState(existing?.name ?? 'Main Panel')
  const [model, setModel] = useState(existing?.model ?? '')
  const [mainAmperage, setMainAmperage] = useState(existing?.mainAmperage ?? 200)
  const [voltage, setVoltage] = useState(existing?.voltage ?? 240)
  const [spaces, setSpaces] = useState(existing?.spaces ?? 40)
  const [columns, setColumns] = useState<1 | 2>(existing?.columns ?? 2)
  const [numbering, setNumbering] = useState<PanelNumbering>(existing?.numbering ?? 'odd-even')

  function save() {
    const data = {
      name: name.trim() || 'Panel',
      model: model.trim(),
      mainAmperage,
      voltage,
      spaces: Math.max(1, Math.min(84, spaces)),
      columns,
      numbering,
    }
    if (existing) updatePanel(existing.id, data)
    else addPanel(data)
    onClose()
  }

  return (
    <Modal
      title={existing ? 'Panel settings' : 'New panel'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            {existing ? 'Save' : 'Create panel'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Panel name</label>
        <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Model</label>
        <input
          type="text"
          value={model}
          placeholder="e.g. Square D QO140M200"
          onChange={(e) => setModel(e.target.value)}
        />
      </div>
      <div className="pcm-row">
        <div className="field">
          <label>Main amperage</label>
          <input
            type="number"
            value={mainAmperage}
            onChange={(e) => setMainAmperage(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Voltage</label>
          <select value={voltage} onChange={(e) => setVoltage(Number(e.target.value))}>
            <option value={120}>120V</option>
            <option value={240}>240V (split-phase)</option>
            <option value={208}>208V</option>
            <option value={480}>480V</option>
          </select>
        </div>
      </div>
      <div className="pcm-row">
        <div className="field">
          <label>Spaces</label>
          <input
            type="number"
            value={spaces}
            min={1}
            max={84}
            onChange={(e) => setSpaces(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Columns</label>
          <select value={columns} onChange={(e) => setColumns(Number(e.target.value) as 1 | 2)}>
            <option value={2}>2 columns</option>
            <option value={1}>1 column</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Numbering</label>
        <select
          value={numbering}
          onChange={(e) => setNumbering(e.target.value as PanelNumbering)}
        >
          <option value="odd-even">Odd/even (1,3,5… left · 2,4,6… right)</option>
          <option value="sequential">Sequential (down left, then right)</option>
        </select>
      </div>
    </Modal>
  )
}
