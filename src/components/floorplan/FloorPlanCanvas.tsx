import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Floor, IconType } from '../../types'
import { useStore } from '../../lib/store'
import { blobUrl } from '../../lib/api'
import { toggleLinkPlacementBreaker } from '../../lib/linking'
import { useIsMobile } from '../../lib/useIsMobile'
import MarkerIcon from '../common/MarkerIcon'
import './FloorPlanCanvas.css'

interface View {
  scale: number
  tx: number
  ty: number
}

interface Props {
  floor: Floor
  catalog: IconType[]
  /** Catalog icon id armed for placement, or null. */
  armedIconTypeId: string | null
  onConsumeArmed: (imgX: number, imgY: number) => void
}

const MIN_SCALE = 0.05
const MAX_SCALE = 8
const TAP_SLOP = 6 // px of movement still considered a tap

const BADGE_PX = 38 // must match .fpc-marker-badge width/height in FloorPlanCanvas.css
const MIN_MARKER_PX = 16

/**
 * Markers live inside the pannable/zoomable `.fpc-layer`, so they naturally
 * zoom with the floor plan. Sizing is relative to `fitScale` (the view scale
 * at the initial fit-to-view "default full screen" zoom), not the raw view
 * scale, so the default look can differ from the zoomed-in ceiling:
 *  - the ceiling (`maxPx`) is `BADGE_PX * placementScale` — the constant
 *    on-screen size markers used to always render at, before they zoomed
 *    with the floor plan. Zooming in from the default view grows markers
 *    back up toward that familiar size, never past it.
 *  - the default full-screen-view size is smaller than that ceiling: 1/3
 *    smaller on desktop, and pinned to the legible floor (`MIN_MARKER_PX`)
 *    on mobile, where screens are cramped.
 *  - zooming out from the default view shrinks markers, floored at
 *    `MIN_MARKER_PX` so they never vanish.
 */
function markerScale(
  placementScale: number,
  viewScale: number,
  fitScale: number,
  isMobile: boolean,
): number {
  const maxPx = BADGE_PX * placementScale
  const defaultPx = isMobile ? MIN_MARKER_PX : (maxPx * 2) / 3
  const ratio = fitScale > 0 ? viewScale / fitScale : 1
  const naturalPx = defaultPx * ratio
  const clampedPx = Math.min(maxPx, Math.max(MIN_MARKER_PX, naturalPx))
  return clampedPx / (BADGE_PX * viewScale)
}

function capture(e: React.PointerEvent) {
  try {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  } catch {
    // Pointer capture can fail (e.g. the pointer already released); harmless.
  }
}

export default function FloorPlanCanvas({
  floor,
  catalog,
  armedIconTypeId,
  onConsumeArmed,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
  const [fitScale, setFitScale] = useState(1)
  const imageUrl = floor.imageId ? blobUrl(floor.imageId) : undefined
  const isMobile = useIsMobile()

  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const mode = useStore((s) => s.mode)
  const isEdit = mode === 'edit'
  const linkMode = useStore((s) => s.linkMode)
  const updatePlacement = useStore((s) => s.updatePlacement)

  const catalogById = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog],
  )

  // The breaker(s) "in view" — either directly selected, or all owners of the
  // selected placement. Every placement sharing any of those breakers rings
  // together, so picking either an icon or a breaker reveals the whole circuit.
  const relevantBreakerIds = useMemo(() => {
    if (selection?.kind === 'breaker') return new Set([selection.id])
    if (selection?.kind === 'placement') {
      const pl = floor.placements.find((p) => p.id === selection.id)
      return new Set(pl?.breakerIds ?? [])
    }
    return new Set<string>()
  }, [selection, floor.placements])

  const highlightedIds = useMemo(() => {
    if (relevantBreakerIds.size === 0) return new Set<string>()
    return new Set(
      floor.placements
        .filter((p) => p.breakerIds.some((id) => relevantBreakerIds.has(id)))
        .map((p) => p.id),
    )
  }, [relevantBreakerIds, floor.placements])

  const selectedBreakerId = selection?.kind === 'breaker' ? selection.id : null

  // --- View fitting ---------------------------------------------------------
  const fitView = useCallback(() => {
    const el = viewportRef.current
    if (!el || !floor.imgW || !floor.imgH) return
    const cw = el.clientWidth
    const ch = el.clientHeight

    // Normally fitting just the image is enough, but a marker dragged past
    // its edge shouldn't be cropped out of the default view — expand the
    // fitted bounds to cover every placement too.
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
    const w = maxX - minX
    const h = maxY - minY

    const scale = Math.min(cw / w, ch / h) * 0.94
    setView({
      scale,
      tx: (cw - w * scale) / 2 - minX * scale,
      ty: (ch - h * scale) / 2 - minY * scale,
    })
    setFitScale(scale)
  }, [floor.imgW, floor.imgH, floor.placements])

  // Fit when the floor changes.
  useEffect(() => {
    fitView()
  }, [floor.id, fitView])

  // --- Coordinate helpers ---------------------------------------------------
  const toImage = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current!.getBoundingClientRect()
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      return { x: (sx - view.tx) / view.scale, y: (sy - view.ty) / view.scale }
    },
    [view],
  )

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    setView((v) => {
      const rect = viewportRef.current!.getBoundingClientRect()
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      const k = scale / v.scale
      return { scale, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k }
    })
  }, [])

  // --- Pointer gestures on the background (pan / pinch / tap-to-place) -------
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    panning: boolean
    moved: number
    startX: number
    startY: number
    pinchDist: number
  }>({ panning: false, moved: 0, startX: 0, startY: 0, pinchDist: 0 })

  function onBgPointerDown(e: React.PointerEvent) {
    capture(e)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      gesture.current = {
        panning: true,
        moved: 0,
        startX: e.clientX,
        startY: e.clientY,
        pinchDist: 0,
      }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      gesture.current.panning = false
    }
  }

  function onBgPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (gesture.current.pinchDist > 0) {
        const factor = dist / gesture.current.pinchDist
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, factor)
      }
      gesture.current.pinchDist = dist
      return
    }

    if (gesture.current.panning) {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      gesture.current.moved += Math.abs(dx) + Math.abs(dy)
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
    }
  }

  function onBgPointerUp(e: React.PointerEvent) {
    const wasTap =
      pointers.current.size === 1 && gesture.current.moved < TAP_SLOP
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) gesture.current.pinchDist = 0
    if (pointers.current.size === 0) gesture.current.panning = false

    if (wasTap) {
      if (armedIconTypeId) {
        const { x, y } = toImage(e.clientX, e.clientY)
        onConsumeArmed(x, y)
      } else {
        select(null)
      }
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  // --- Marker dragging ------------------------------------------------------
  const drag = useRef<{
    id: string
    moved: number
    lastX: number
    lastY: number
  } | null>(null)

  function onMarkerPointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    capture(e)
    drag.current = { id, moved: 0, lastX: e.clientX, lastY: e.clientY }
  }

  function onMarkerPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    e.stopPropagation()
    const d = drag.current
    const dx = e.clientX - d.lastX
    const dy = e.clientY - d.lastY
    d.moved += Math.abs(dx) + Math.abs(dy)
    d.lastX = e.clientX
    d.lastY = e.clientY
    // View mode is inspect-only — track the gesture (for tap detection) but
    // don't actually move the marker.
    if (!isEdit) return
    const p = floor.placements.find((pl) => pl.id === d.id)
    if (p) {
      updatePlacement(d.id, {
        x: p.x + dx / view.scale,
        y: p.y + dy / view.scale,
      })
    }
  }

  function onMarkerPointerUp(e: React.PointerEvent, id: string) {
    if (!drag.current) return
    e.stopPropagation()
    const tapped = drag.current.moved < TAP_SLOP
    drag.current = null
    if (!tapped) return
    // Tap on a marker: link toggle in link mode, else select (which also
    // highlights the owning breaker in the panel diagram).
    if (isEdit && linkMode && selectedBreakerId) {
      void toggleLinkPlacementBreaker(id, selectedBreakerId)
    } else {
      select({ kind: 'placement', id })
    }
  }

  if (!floor.imageId) {
    return (
      <div className="fpc-empty">
        <p className="muted">This floor has no image.</p>
      </div>
    )
  }

  return (
    <div
      ref={viewportRef}
      className={`fpc ${armedIconTypeId ? 'arming' : ''} ${linkMode ? 'linking' : ''}`}
      onPointerDown={onBgPointerDown}
      onPointerMove={onBgPointerMove}
      onPointerUp={onBgPointerUp}
      onPointerCancel={onBgPointerUp}
      onWheel={onWheel}
    >
      <div
        className="fpc-layer"
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
        }}
      >
        {imageUrl && (
          <img
            className="fpc-img"
            src={imageUrl}
            width={floor.imgW}
            height={floor.imgH}
            alt={floor.name}
            draggable={false}
          />
        )}

        {floor.placements.map((p) => {
          const icon = catalogById.get(p.iconTypeId)
          const isSel = selection?.kind === 'placement' && selection.id === p.id
          const isHi = highlightedIds.has(p.id)
          const linkable = linkMode && !!selectedBreakerId
          return (
            <div
              key={p.id}
              className={`fpc-marker ${isSel ? 'sel' : ''} ${isHi ? 'hi' : ''} ${
                linkable ? 'linkable' : ''
              } ${p.breakerIds.length > 0 ? 'linked' : ''}`}
              style={{
                left: p.x,
                top: p.y,
                transform: `translate(-50%, -50%) scale(${markerScale(p.scale, view.scale, fitScale, isMobile)}) rotate(${p.rotation}deg)`,
                ['--marker-color' as string]: icon?.color ?? '#94a3b8',
              }}
              onPointerDown={(e) => onMarkerPointerDown(e, p.id)}
              onPointerMove={onMarkerPointerMove}
              onPointerUp={(e) => onMarkerPointerUp(e, p.id)}
              onPointerCancel={(e) => onMarkerPointerUp(e, p.id)}
            >
              <div className="fpc-marker-badge">
                <MarkerIcon icon={icon} size={20} />
              </div>
              {p.label && <div className="fpc-marker-label">{p.label}</div>}
            </div>
          )
        })}
      </div>

      <div className="fpc-controls no-print">
        <button className="icon-btn" title="Zoom in" onClick={() => zoomCenter(1.2)}>
          +
        </button>
        <button className="icon-btn" title="Zoom out" onClick={() => zoomCenter(1 / 1.2)}>
          −
        </button>
        <button className="icon-btn" title="Fit" onClick={fitView}>
          ⤢
        </button>
      </div>
    </div>
  )

  function zoomCenter(factor: number) {
    const el = viewportRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
  }
}
