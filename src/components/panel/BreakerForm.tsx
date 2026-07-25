import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { BREAKER_TYPES, BREAKER_TYPE_META } from '../../types'
import type { Breaker, BreakerType, Panel } from '../../types'
import { useStore } from '../../lib/store'
import { isBreakerPlacementValid } from '../../lib/panelLayout'
import { confirmDialog } from '../../lib/dialog'
import Modal from '../common/Modal'
import './BreakerForm.css'

const COMMON_AMPS = [15, 20, 25, 30, 40, 50, 60, 70, 100]

interface Props {
  panel: Panel
  /** Existing breaker to edit, or the empty slot number to create at. */
  editing: Breaker | null
  createAtSlot: number | null
  onClose: () => void
}

export default function BreakerForm({ panel, editing, createAtSlot, onClose }: Props) {
  const addBreaker = useStore((s) => s.addBreaker)
  const updateBreaker = useStore((s) => s.updateBreaker)
  const deleteBreaker = useStore((s) => s.deleteBreaker)
  const select = useStore((s) => s.select)

  const startSlot = editing?.startSlot ?? createAtSlot ?? 1
  const [amps, setAmps] = useState(editing?.amps ?? 20)
  const [type, setType] = useState<BreakerType>(editing?.type ?? 'standard')
  const [span, setSpan] = useState<1 | 2 | 3>(editing?.span ?? 1)
  const [label, setLabel] = useState(editing?.label ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [error, setError] = useState<string | null>(null)

  function save() {
    const candidate: Breaker = {
      id: editing?.id ?? 'tmp',
      panelId: panel.id,
      startSlot,
      span,
      amps,
      type,
      label: label.trim(),
      description: description.trim(),
    }
    if (!isBreakerPlacementValid(panel, candidate, editing?.id)) {
      setError(
        `A ${span}-pole breaker won't fit at slot ${startSlot} (out of range, wrong column, or overlaps another breaker).`,
      )
      return
    }
    if (editing) {
      updateBreaker(editing.id, { amps, type, span, label: candidate.label, description: candidate.description })
    } else {
      const id = addBreaker({
        panelId: panel.id,
        startSlot,
        span,
        amps,
        type,
        label: candidate.label,
        description: candidate.description,
      })
      select({ kind: 'breaker', id })
    }
    onClose()
  }

  async function remove() {
    if (!editing) return
    const ok = await confirmDialog({
      title: 'Delete breaker',
      message: 'Delete this breaker? Linked fixtures will be unlinked.',
      confirmText: 'Delete',
      danger: true,
    })
    if (ok) {
      deleteBreaker(editing.id)
      onClose()
    }
  }

  return (
    <Modal
      title={editing ? `Breaker · Slot ${startSlot}` : `New breaker · Slot ${startSlot}`}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button className="btn danger" onClick={remove}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            {editing ? 'Save' : 'Add breaker'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Label / circuit</label>
        <input
          type="text"
          value={label}
          autoFocus
          placeholder="e.g. Kitchen counters"
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="bf-row">
        <div className="field">
          <label>Amps</label>
          <input
            type="number"
            value={amps}
            min={5}
            max={400}
            list="amp-list"
            onChange={(e) => setAmps(Number(e.target.value))}
          />
          <datalist id="amp-list">
            {COMMON_AMPS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Poles / slots</label>
          <select value={span} onChange={(e) => setSpan(Number(e.target.value) as 1 | 2 | 3)}>
            <option value={1}>1 (single)</option>
            <option value={2}>2 (double)</option>
            <option value={3}>3 (triple)</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>Type</label>
        <div className="bf-types">
          {BREAKER_TYPES.map((t) => {
            const meta = BREAKER_TYPE_META[t]
            return (
              <button
                key={t}
                className={`bf-type ${type === t ? 'sel' : ''}`}
                style={{ ['--type-color' as string]: meta.color }}
                onClick={() => setType(t)}
              >
                <span className="bf-type-badge">{meta.short}</span>
                <span className="bf-type-label">{meta.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="field">
        <label>Notes</label>
        <textarea
          rows={2}
          value={description}
          placeholder="Optional notes"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {error && <div className="bf-error">{error}</div>}
    </Modal>
  )
}
