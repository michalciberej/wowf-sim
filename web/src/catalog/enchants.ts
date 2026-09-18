import { ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import type { CatalogItem } from './era.ts'
import raw from './enchants.json' with { type: 'json' }

export type CatalogEnchant = {
  id: number
  name: string
  icon: string
  quality?: number
  kind: 'permanent' | 'temporary' | string
  slots: number[]
  effectName: string
  effectLabel: string
  useText: string
  twoHandOnly?: boolean
  shieldOnly?: boolean
  offHandOnly?: boolean
  weapon?: boolean
  ranged?: boolean
  proc?: boolean
  strength?: number
  agility?: number
  stamina?: number
  intellect?: number
  spirit?: number
  attackPower?: number
  spellPower?: number
  healingPower?: number
  critChance?: number
  hitChance?: number
  spellCritChance?: number
  spellHitChance?: number
  haste?: number
  weaponDamage?: number
  mp5?: number
}

export const ENCHANTS: CatalogEnchant[] = raw as CatalogEnchant[]

export function enchantById(id: number): CatalogEnchant | undefined {
  return ENCHANTS.find((entry) => entry.id === id)
}

export function enchantFitsSlot(enchant: CatalogEnchant, slot: ItemSlot, item?: CatalogItem | null): boolean {
  if (!enchant.slots.includes(slot)) {
    return false
  }
  if (enchant.twoHandOnly && item && item.hand !== '2h') {
    return false
  }
  if (enchant.shieldOnly && item && item.itemSubclass !== 'Shield') {
    return false
  }
  if (enchant.offHandOnly && item && (item.hand !== 'oh' || item.itemSubclass === 'Shield')) {
    return false
  }
  if (enchant.weapon && slot === ItemSlot.OFF_HAND && item?.itemSubclass === 'Shield') {
    return false
  }
  if (enchant.ranged && slot !== ItemSlot.RANGED) {
    return false
  }
  return true
}

export function enchantsForSlot(
  slot: ItemSlot,
  item?: CatalogItem | null,
  kind?: string,
): CatalogEnchant[] {
  return ENCHANTS.filter((enchant) => {
    if (kind && enchant.kind !== kind) {
      return false
    }
    return enchantFitsSlot(enchant, slot, item)
  })
}

export function slotHasPermanentEnchants(slot: ItemSlot) {
  return ENCHANTS.some((enchant) => enchant.kind === 'permanent' && enchant.slots.includes(slot))
}
