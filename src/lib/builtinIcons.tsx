import type { ComponentType } from 'react'
import {
  AirVent,
  CookingPot,
  DoorOpen,
  Droplets,
  Fan,
  Flame,
  LampCeiling,
  Lightbulb,
  Microwave,
  Plug,
  PlugZap,
  Power,
  Refrigerator,
  Utensils,
  WashingMachine,
  Zap,
  type LucideProps,
} from 'lucide-react'
import type { IconCategory, IconType } from '../types'

export interface BuiltinIcon {
  key: string
  name: string
  category: IconCategory
  color: string
  Comp: ComponentType<LucideProps>
}

export const BUILTIN_ICONS: BuiltinIcon[] = [
  // Lights
  { key: 'lightbulb', name: 'Light', category: 'light', color: '#facc15', Comp: Lightbulb },
  { key: 'ceiling-light', name: 'Ceiling Light', category: 'light', color: '#facc15', Comp: LampCeiling },
  // Fans
  { key: 'fan', name: 'Ceiling Fan', category: 'fan', color: '#38bdf8', Comp: Fan },
  { key: 'vent', name: 'Exhaust Fan / Vent', category: 'fan', color: '#38bdf8', Comp: AirVent },
  // Outlets / switches
  { key: 'outlet', name: 'Outlet', category: 'outlet', color: '#a3e635', Comp: Plug },
  { key: 'outlet-gfci', name: 'GFCI Outlet', category: 'outlet', color: '#4ade80', Comp: PlugZap },
  // Appliances
  { key: 'refrigerator', name: 'Refrigerator', category: 'appliance', color: '#f472b6', Comp: Refrigerator },
  { key: 'oven', name: 'Range / Oven', category: 'appliance', color: '#fb923c', Comp: CookingPot },
  { key: 'microwave', name: 'Microwave', category: 'appliance', color: '#fb923c', Comp: Microwave },
  { key: 'dishwasher', name: 'Dishwasher', category: 'appliance', color: '#f472b6', Comp: Utensils },
  { key: 'washer', name: 'Washer', category: 'appliance', color: '#f472b6', Comp: WashingMachine },
  { key: 'dryer', name: 'Dryer', category: 'appliance', color: '#f472b6', Comp: Flame },
  { key: 'water-heater', name: 'Water Heater', category: 'appliance', color: '#fb923c', Comp: Droplets },
  { key: 'hvac', name: 'HVAC / AC', category: 'appliance', color: '#38bdf8', Comp: AirVent },
  { key: 'door', name: 'Garage Door', category: 'appliance', color: '#94a3b8', Comp: DoorOpen },
  { key: 'sub-feed', name: 'Subpanel Feed', category: 'appliance', color: '#f87171', Comp: Zap },
  { key: 'generic', name: 'Generic Load', category: 'appliance', color: '#94a3b8', Comp: Power },
]

const BY_KEY = new Map(BUILTIN_ICONS.map((i) => [i.key, i]))

export function getBuiltinIcon(key: string | undefined): BuiltinIcon | undefined {
  return key ? BY_KEY.get(key) : undefined
}

/** The catalog every new project starts with (a sensible default set). */
export function defaultCatalog(): IconType[] {
  return BUILTIN_ICONS.map((i) => ({
    id: crypto.randomUUID(),
    name: i.name,
    category: i.category,
    source: 'builtin',
    builtinKey: i.key,
    color: i.color,
  }))
}
