import { useState, useSyncExternalStore } from 'react'
import Modal from '../components/common/Modal'

// A tiny imperative dialog service so we never rely on blocking native
// window.prompt / confirm (which break embedding and look off-brand).

type Req =
  | {
      kind: 'prompt'
      title: string
      label?: string
      value: string
      placeholder?: string
      confirmText: string
      resolve: (v: string | null) => void
    }
  | {
      kind: 'confirm'
      title: string
      message: string
      confirmText: string
      danger?: boolean
      resolve: (v: boolean) => void
    }
  | {
      kind: 'choose'
      title: string
      message: string
      choices: { value: string; label: string }[]
      resolve: (v: string | null) => void
    }

let current: Req | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
function snapshot() {
  return current
}

export function promptDialog(opts: {
  title: string
  label?: string
  value?: string
  placeholder?: string
  confirmText?: string
}): Promise<string | null> {
  return new Promise((resolve) => {
    current = {
      kind: 'prompt',
      title: opts.title,
      label: opts.label,
      value: opts.value ?? '',
      placeholder: opts.placeholder,
      confirmText: opts.confirmText ?? 'OK',
      resolve,
    }
    emit()
  })
}

export function confirmDialog(opts: {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    current = {
      kind: 'confirm',
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText ?? 'Confirm',
      danger: opts.danger,
      resolve,
    }
    emit()
  })
}

/** A dialog offering several named choices, plus an implicit cancel. Resolves to the chosen value, or null if dismissed. */
export function chooseDialog(opts: {
  title: string
  message: string
  choices: { value: string; label: string }[]
}): Promise<string | null> {
  return new Promise((resolve) => {
    current = {
      kind: 'choose',
      title: opts.title,
      message: opts.message,
      choices: opts.choices,
      resolve,
    }
    emit()
  })
}

function close() {
  current = null
  emit()
}

/** Mounted once at the app root; renders whichever dialog is active. */
export function DialogHost() {
  const req = useSyncExternalStore(subscribe, snapshot)
  if (!req) return null

  if (req.kind === 'prompt') {
    return <PromptView req={req} onDone={close} />
  }

  if (req.kind === 'choose') {
    return (
      <Modal
        title={req.title}
        onClose={() => {
          req.resolve(null)
          close()
        }}
        footer={
          <>
            <button
              className="btn ghost"
              onClick={() => {
                req.resolve(null)
                close()
              }}
            >
              Cancel
            </button>
            {req.choices.map((c, i) => (
              <button
                key={c.value}
                className={`btn ${i === req.choices.length - 1 ? 'primary' : ''}`}
                onClick={() => {
                  req.resolve(c.value)
                  close()
                }}
              >
                {c.label}
              </button>
            ))}
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: 1.5 }}>{req.message}</p>
      </Modal>
    )
  }

  return (
    <Modal
      title={req.title}
      onClose={() => {
        req.resolve(false)
        close()
      }}
      footer={
        <>
          <button
            className="btn ghost"
            onClick={() => {
              req.resolve(false)
              close()
            }}
          >
            Cancel
          </button>
          <button
            className={`btn ${req.danger ? 'danger-solid' : 'primary'}`}
            onClick={() => {
              req.resolve(true)
              close()
            }}
          >
            {req.confirmText}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: 1.5 }}>{req.message}</p>
    </Modal>
  )
}

function PromptView({
  req,
  onDone,
}: {
  req: Extract<Req, { kind: 'prompt' }>
  onDone: () => void
}) {
  const [value, setValue] = useState(req.value)

  const submit = () => {
    req.resolve(value.trim())
    onDone()
  }
  const cancel = () => {
    req.resolve(null)
    onDone()
  }

  return (
    <Modal
      title={req.title}
      onClose={cancel}
      footer={
        <>
          <button className="btn ghost" onClick={cancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {req.confirmText}
          </button>
        </>
      }
    >
      <div className="field">
        {req.label && <label>{req.label}</label>}
        <input
          type="text"
          value={value}
          placeholder={req.placeholder}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
      </div>
    </Modal>
  )
}
