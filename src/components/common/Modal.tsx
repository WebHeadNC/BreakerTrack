import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import './Modal.css'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Render as a bottom sheet (mobile) instead of a centered dialog. */
  sheet?: boolean
}

export default function Modal({ title, onClose, children, footer, sheet }: Props) {
  return (
    <div className="modal-scrim no-print" onPointerDown={onClose}>
      <div
        className={`modal ${sheet ? 'sheet' : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}
