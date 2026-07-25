// ---------------------------------------------------------------------------
// BreakerTrack domain model
// ---------------------------------------------------------------------------

export type IconCategory = 'light' | 'fan' | 'outlet' | 'appliance' | 'custom'

/** A catalog entry: a kind of thing that can be placed on a floor plan. */
export interface IconType {
  id: string
  name: string
  category: IconCategory
  /** 'builtin' uses a Lucide glyph via `builtinKey`; 'upload' uses a stored blob. */
  source: 'builtin' | 'upload'
  builtinKey?: string
  /** Blob id in Dexie for uploaded custom icons. */
  imageId?: string
  /** Accent color for the marker. */
  color?: string
}

/** An instance of an IconType placed on a floor plan. */
export interface Placement {
  id: string
  floorId: string
  iconTypeId: string
  x: number
  y: number
  rotation: number
  scale: number
  label: string
  /** The breaker powering this fixture, if linked. */
  breakerId?: string
}

export interface Floor {
  id: string
  name: string
  /** Blob id in Dexie for the floor plan image (undefined until uploaded). */
  imageId?: string
  imgW: number
  imgH: number
  placements: Placement[]
}

export type BreakerType = 'standard' | 'afci' | 'gfci' | 'dual' | 'cafci'

export interface Breaker {
  id: string
  panelId: string
  /** 1-based slot number where the breaker starts. */
  startSlot: number
  /** How many physical spaces it occupies (poles). */
  span: 1 | 2 | 3
  amps: number
  type: BreakerType
  label: string
  description: string
  /** Marker color inherited by linked placements' highlight. */
  color?: string
}

export type PanelNumbering = 'odd-even' | 'sequential'

export interface Panel {
  id: string
  name: string
  model: string
  mainAmperage: number
  voltage: number
  /** Total number of physical breaker spaces. */
  spaces: number
  columns: 1 | 2
  numbering: PanelNumbering
  breakers: Breaker[]
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  floors: Floor[]
  panels: Panel[]
  catalog: IconType[]
}

// ---------------------------------------------------------------------------
// Breaker type metadata (labels + colors), shared by diagram, forms, report.
// ---------------------------------------------------------------------------

export const BREAKER_TYPE_META: Record<
  BreakerType,
  { short: string; label: string; color: string }
> = {
  standard: { short: 'STD', label: 'Standard', color: '#64748b' },
  afci: { short: 'AFCI', label: 'AFCI', color: '#3b82f6' },
  gfci: { short: 'GFCI', label: 'GFCI', color: '#22c55e' },
  dual: { short: 'DUAL', label: 'Dual Function AFCI/GFCI', color: '#a855f7' },
  cafci: { short: 'CAFCI', label: 'CAFCI', color: '#f59e0b' },
}

export const BREAKER_TYPES: BreakerType[] = ['standard', 'afci', 'gfci', 'dual', 'cafci']
