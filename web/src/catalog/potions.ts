import { Class } from '../gen/wowfsim/sim_pb.ts'
import type { CatalogItem, ItemEffect } from './era.ts'
import raw from './potions.json' with { type: 'json' }
import type { CatalogAbility } from './abilities.ts'

export const POTIONS = raw as CatalogItem[]

export const POTION_USE_PRIORITY = 938

const CLASS_MASK: Record<number, number> = {
  [Class.WARRIOR]: 1,
  [Class.PALADIN]: 2,
  [Class.HUNTER]: 4,
  [Class.ROGUE]: 8,
  [Class.PRIEST]: 16,
  [Class.SHAMAN]: 64,
  [Class.MAGE]: 128,
  [Class.WARLOCK]: 256,
  [Class.DRUID]: 1024,
}

const MIGHTY_RAGE = 13442
const MAJOR_FRENZY = 250943
const MAJOR_SPELLBLASTING = 250937

function useEffect(item: CatalogItem): ItemEffect | undefined {
  return item.effects?.find((effect) => effect.kind === 'use')
}

export function isCombatPotion(item: CatalogItem): boolean {
  if (/\[PH\]|\[DEP\]|Perishable|Experience|Tradeskill/i.test(item.name)) {
    return false
  }
  const effect = useEffect(item)
  if (!effect) {
    return false
  }
  const text = `${effect.text ?? ''} ${item.tooltip ?? ''}`.toLowerCase()
  if (/against beasts|against elementals|throw a fragile|cloud of|venomous blood/.test(text)) {
    return false
  }
  return Boolean(
    effect.attackPower ||
      effect.spellPower ||
      effect.haste ||
      effect.crit ||
      effect.strength ||
      effect.agility ||
      effect.rage,
  )
}

export function potionUsableByClass(item: CatalogItem, playerClass: Class): boolean {
  if (!item.classMask) {
    return true
  }
  return (item.classMask & (CLASS_MASK[playerClass] ?? 0)) !== 0
}

export function combatPotionsForClass(playerClass: Class): CatalogItem[] {
  return POTIONS.filter((item) => isCombatPotion(item) && potionUsableByClass(item, playerClass)).sort(
    (a, b) => (b.requiredLevel ?? 0) - (a.requiredLevel ?? 0) || a.name.localeCompare(b.name),
  )
}

export function defaultCombatPotionId(playerClass: Class): number {
  if (playerClass === Class.WARRIOR || playerClass === Class.DRUID) {
    return MIGHTY_RAGE
  }
  if (
    playerClass === Class.MAGE ||
    playerClass === Class.WARLOCK ||
    playerClass === Class.PRIEST ||
    playerClass === Class.PALADIN
  ) {
    return MAJOR_SPELLBLASTING
  }
  return MAJOR_FRENZY
}

export function potionUseAbility(item: CatalogItem | undefined): CatalogAbility | null {
  if (!item) {
    return null
  }
  const effect = useEffect(item)
  if (!effect) {
    return null
  }
  return {
    id: `use:${item.name
      .toLowerCase()
      .replace(/'/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`,
    name: item.name,
    icon: item.icon ?? effect.icon ?? 'inv_misc_questionmark',
    gcd: false,
    kind: 'potion',
    priority: POTION_USE_PRIORITY,
    cooldown: effect.cooldown || 120,
  }
}
