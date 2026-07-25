import type { Breaker, Panel } from '../types'

/**
 * A physical cell in the panel grid. `slot` is the 1-based space number as
 * printed on the panel (depends on the numbering scheme). Cells are laid out
 * row-by-row, left column then right column when `columns === 2`.
 */
export interface PanelCell {
  /** 0-based row. */
  row: number
  /** 0-based column (0 = left). */
  col: number
  /** The panel space number printed at this position. */
  slot: number
}

export interface PanelLayout {
  rows: number
  columns: number
  cells: PanelCell[]
  /** slot number -> cell */
  bySlot: Map<number, PanelCell>
}

/**
 * Compute the grid geometry and the slot number printed at each position.
 *
 * odd-even (standard residential): left column carries odd numbers going down
 * (1,3,5,…), right column carries even numbers (2,4,6,…).
 *
 * sequential: numbers increase down the left column, then continue down the
 * right column (1..rows on the left, rows+1..spaces on the right).
 */
export function computePanelLayout(panel: Panel): PanelLayout {
  const columns = panel.columns
  const spaces = Math.max(0, panel.spaces)
  const rows = Math.ceil(spaces / columns)
  const cells: PanelCell[] = []
  const bySlot = new Map<number, PanelCell>()

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      let slot: number
      if (columns === 1) {
        slot = row + 1
      } else if (panel.numbering === 'odd-even') {
        slot = row * 2 + (col === 0 ? 1 : 2)
      } else {
        // sequential
        slot = col === 0 ? row + 1 : rows + row + 1
      }
      if (slot > spaces) continue
      const cell: PanelCell = { row, col, slot }
      cells.push(cell)
      bySlot.set(slot, cell)
    }
  }

  return { rows, columns, cells, bySlot }
}

/**
 * The consecutive physical slots a breaker occupies. In a 2-column odd/even
 * panel, poles stack vertically within the same column, so slot numbers step
 * by 2 (e.g. a 2-pole at slot 1 covers 1 & 3). Otherwise they are consecutive.
 */
export function breakerSlots(panel: Panel, breaker: Breaker): number[] {
  const step = panel.columns === 2 && panel.numbering === 'odd-even' ? 2 : 1
  const slots: number[] = []
  for (let i = 0; i < breaker.span; i++) {
    slots.push(breaker.startSlot + i * step)
  }
  return slots
}

/** Map each occupied slot number to its breaker for quick lookup. */
export function slotOccupancy(panel: Panel): Map<number, Breaker> {
  const map = new Map<number, Breaker>()
  for (const b of panel.breakers) {
    for (const s of breakerSlots(panel, b)) map.set(s, b)
  }
  return map
}

/** True if `breaker` can occupy its slots without exceeding the panel or colliding. */
export function isBreakerPlacementValid(
  panel: Panel,
  breaker: Breaker,
  ignoreId?: string,
): boolean {
  const layout = computePanelLayout(panel)
  const slots = breakerSlots(panel, breaker)
  // All slots must exist and share the same column.
  const cols = new Set<number>()
  for (const s of slots) {
    const cell = layout.bySlot.get(s)
    if (!cell) return false
    cols.add(cell.col)
  }
  if (cols.size > 1) return false
  // No overlap with other breakers.
  const occupied = new Set<number>()
  for (const b of panel.breakers) {
    if (b.id === ignoreId || b.id === breaker.id) continue
    for (const s of breakerSlots(panel, b)) occupied.add(s)
  }
  return slots.every((s) => !occupied.has(s))
}
