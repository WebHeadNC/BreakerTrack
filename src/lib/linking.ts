import { BREAKER_TYPE_META } from '../types'
import { useStore } from './store'
import { chooseDialog } from './dialog'

function describeBreaker(breakerId: string): string {
  const project = useStore.getState().project
  if (!project) return 'that breaker'
  for (const panel of project.panels) {
    const b = panel.breakers.find((x) => x.id === breakerId)
    if (b) {
      const meta = BREAKER_TYPE_META[b.type]
      return `${panel.name} · slot ${b.startSlot} · ${b.amps}A ${meta.short}${b.label ? ` · ${b.label}` : ''}`
    }
  }
  return 'that breaker'
}

function findPlacement(placementId: string) {
  const project = useStore.getState().project
  if (!project) return undefined
  for (const f of project.floors) {
    const pl = f.placements.find((p) => p.id === placementId)
    if (pl) return pl
  }
  return undefined
}

/**
 * Link a placement to a breaker. If it's already linked to one or more
 * *different* breakers, asks whether to remap (replace) or dual-map (add) —
 * unless it's already linked to exactly this breaker, or isn't linked to
 * anything yet, in which case it just applies directly.
 */
export async function linkPlacementToBreaker(placementId: string, breakerId: string): Promise<void> {
  const placement = findPlacement(placementId)
  if (!placement) return
  const current = placement.breakerIds
  if (current.includes(breakerId)) return

  if (current.length === 0) {
    useStore.getState().setPlacementBreakers(placementId, [breakerId])
    return
  }

  const existingDesc =
    current.length === 1 ? describeBreaker(current[0]) : `${current.length} breakers`
  const newDesc = describeBreaker(breakerId)

  const choice = await chooseDialog({
    title: 'Already linked',
    message: `This icon is already linked to ${existingDesc}. Remap it to just ${newDesc}, or link it to both?`,
    choices: [
      { value: 'remap', label: 'Remap' },
      { value: 'dual', label: 'Multi Map' },
    ],
  })

  if (choice === 'remap') {
    useStore.getState().setPlacementBreakers(placementId, [breakerId])
  } else if (choice === 'dual') {
    useStore.getState().setPlacementBreakers(placementId, [...current, breakerId])
  }
}

export function unlinkPlacementBreaker(placementId: string, breakerId: string): void {
  const placement = findPlacement(placementId)
  if (!placement) return
  useStore
    .getState()
    .setPlacementBreakers(placementId, placement.breakerIds.filter((id) => id !== breakerId))
}

/** Used by tap-to-link on the floor plan: unlink if already linked to this breaker, else link (with conflict prompt). */
export async function toggleLinkPlacementBreaker(placementId: string, breakerId: string): Promise<void> {
  const placement = findPlacement(placementId)
  if (!placement) return
  if (placement.breakerIds.includes(breakerId)) {
    unlinkPlacementBreaker(placementId, breakerId)
  } else {
    await linkPlacementToBreaker(placementId, breakerId)
  }
}
