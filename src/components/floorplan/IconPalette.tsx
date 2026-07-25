import { useRef, useState } from 'react'
import { Check, Plus, Trash2, Upload } from 'lucide-react'
import type { IconCategory, IconType } from '../../types'
import { useStore } from '../../lib/store'
import { putBlob } from '../../lib/api'
import { BUILTIN_ICONS } from '../../lib/builtinIcons'
import MarkerIcon from '../common/MarkerIcon'
import Modal from '../common/Modal'
import './IconPalette.css'

const CATEGORIES: { id: IconCategory; label: string }[] = [
  { id: 'light', label: 'Lights' },
  { id: 'fan', label: 'Fans' },
  { id: 'outlet', label: 'Outlets & Switches' },
  { id: 'appliance', label: 'Appliances' },
  { id: 'custom', label: 'Custom' },
]

const SWATCHES = [
  '#facc15', '#fb923c', '#f472b6', '#a855f7', '#38bdf8',
  '#4ade80', '#a3e635', '#f87171', '#94a3b8',
]

interface Props {
  catalog: IconType[]
  armedIconTypeId: string | null
  onArm: (id: string | null) => void
  disabled?: boolean
}

export default function IconPalette({ catalog, armedIconTypeId, onArm, disabled }: Props) {
  const addIconType = useStore((s) => s.addIconType)
  const deleteIconType = useStore((s) => s.deleteIconType)
  const [adding, setAdding] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const grouped = CATEGORIES.map((c) => ({
    ...c,
    items: catalog.filter((i) => i.category === c.id),
  })).filter((g) => g.items.length > 0 || g.id === 'custom')

  return (
    <div className="palette">
      <div className="palette-head">
        <span className="palette-title">Icons</span>
        <div className="palette-head-tools">
          <button
            className={`btn sm ghost ${editMode ? 'active-toggle' : ''}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
          <button className="btn sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {disabled && (
        <p className="palette-hint muted">Upload a floor plan to place icons.</p>
      )}

      <div className={`palette-scroll ${disabled ? 'is-disabled' : ''}`}>
        {grouped.map((g) => (
          <div key={g.id} className="palette-group">
            <div className="palette-group-label">{g.label}</div>
            <div className="palette-grid">
              {g.items.map((icon) => (
                <button
                  key={icon.id}
                  className={`palette-tile ${armedIconTypeId === icon.id ? 'armed' : ''}`}
                  style={{ ['--marker-color' as string]: icon.color ?? '#94a3b8' }}
                  onClick={() =>
                    editMode
                      ? deleteIconType(icon.id)
                      : onArm(armedIconTypeId === icon.id ? null : icon.id)
                  }
                  title={editMode ? `Delete ${icon.name}` : `Place ${icon.name}`}
                >
                  <span className="palette-tile-icon">
                    <MarkerIcon icon={icon} size={22} />
                  </span>
                  <span className="palette-tile-name">{icon.name}</span>
                  {editMode && (
                    <span className="palette-tile-del">
                      <Trash2 size={13} />
                    </span>
                  )}
                  {!editMode && armedIconTypeId === icon.id && (
                    <span className="palette-tile-armed">
                      <Check size={13} />
                    </span>
                  )}
                </button>
              ))}
              {g.items.length === 0 && (
                <span className="palette-empty muted">None yet</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {armedIconTypeId && !disabled && (
        <div className="palette-armed-bar">
          Tap the plan to place · <button className="link-btn" onClick={() => onArm(null)}>cancel</button>
        </div>
      )}

      {adding && (
        <AddIconModal
          onClose={() => setAdding(false)}
          onAdd={(icon) => {
            addIconType(icon)
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function AddIconModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (icon: Omit<IconType, 'id'>) => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<IconCategory>('appliance')
  const [builtinKey, setBuiltinKey] = useState<string>('generic')
  const [color, setColor] = useState('#94a3b8')
  const [uploadId, setUploadId] = useState<string | undefined>()
  const [uploadPreview, setUploadPreview] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    const id = await putBlob(file)
    setUploadId(id)
    setUploadPreview(URL.createObjectURL(file))
    setBusy(false)
  }

  function submit() {
    const finalName = name.trim() || 'New icon'
    if (uploadId) {
      onAdd({ name: finalName, category, source: 'upload', imageId: uploadId, color })
    } else {
      onAdd({ name: finalName, category, source: 'builtin', builtinKey, color })
    }
  }

  return (
    <Modal
      title="Add appliance / icon"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            Add icon
          </button>
        </>
      }
    >
      <div className="field">
        <label>Name</label>
        <input
          type="text"
          value={name}
          autoFocus
          placeholder="e.g. Well Pump"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as IconCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Custom image (optional)</label>
        <div className="add-upload">
          <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={14} /> {uploadId ? 'Replace' : 'Upload'} image
          </button>
          {uploadPreview && (
            <img className="add-upload-preview" src={uploadPreview} alt="preview" />
          )}
          {uploadId && (
            <button
              className="btn sm ghost"
              onClick={() => {
                setUploadId(undefined)
                setUploadPreview(undefined)
              }}
            >
              Use glyph instead
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        </div>
      </div>

      {!uploadId && (
        <div className="field">
          <label>Base glyph</label>
          <div className="glyph-grid">
            {BUILTIN_ICONS.map((b) => (
              <button
                key={b.key}
                className={`glyph-tile ${builtinKey === b.key ? 'sel' : ''}`}
                style={{ ['--marker-color' as string]: color }}
                onClick={() => {
                  setBuiltinKey(b.key)
                  setColor(b.color)
                }}
                title={b.name}
              >
                <b.Comp size={20} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label>Color</label>
        <div className="swatches">
          {SWATCHES.map((s) => (
            <button
              key={s}
              className={`swatch ${color === s ? 'sel' : ''}`}
              style={{ background: s }}
              onClick={() => setColor(s)}
              aria-label={s}
            />
          ))}
          <input
            type="color"
            className="swatch-picker"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
