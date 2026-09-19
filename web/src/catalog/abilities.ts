import { Class } from '../gen/wowfsim/sim_pb.ts'
import { ITEMS, TALENTS } from './era.ts'
import { potionUseAbility, POTIONS } from './potions.ts'
import type { TalentRanks } from '../sim/engine.ts'
import raw from './abilities.json' with { type: 'json' }

export type CatalogAbility = {
  id: string
  name: string
  icon: string
  class?: number
  race?: number
  requiresTalent?: number
  skipRotation?: boolean
  gcd?: boolean
  kind?: string
  rank?: number
  spellId?: number
  tooltip?: string
  duration?: number
  priority: number
  buffDamage?: number
  buffHaste?: number
  buffCrit?: number
  buffAP?: number
  buffAPMul?: number
  buffSPMul?: number
  resource?: string
  cost?: number
  cooldown?: number
  damageFlat?: number
  damageWeapon?: number
  damageAP?: number
  damageSP?: number
  castTime?: number
}

export const ABILITIES = raw as CatalogAbility[]

const ABILITY_BY_NAME = new Map(ABILITIES.map((ability) => [ability.name, ability]))

export function abilityForActionName(name: string): CatalogAbility | undefined {
  if (!name) {
    return undefined
  }
  return ABILITY_BY_NAME.get(name) ?? ABILITY_BY_NAME.get(name.replace(/\s+Off-Hand$/, ''))
}

export type SpellTooltipLine = { text: string; kind: 'name' | 'slot' | 'stat' | 'weapon' | 'bind' | 'use' | 'equip' }

export function spellTooltipLines(ability: CatalogAbility): SpellTooltipLine[] {
  const lines: SpellTooltipLine[] = [{ text: ability.name, kind: 'name' }]
  if (ability.rank) {
    lines.push({ text: `Rank ${ability.rank}`, kind: 'slot' })
  }
  const parts = (ability.tooltip ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((text) => text !== ability.name && !/^Rank \d+$/i.test(text))
  if (parts.length) {
    for (const text of parts) {
      let kind: SpellTooltipLine['kind'] = 'equip'
      if (/Requires|level/i.test(text)) {
        kind = 'bind'
      } else if (/Rage|Energy|Mana|Range|Instant|cast|Melee|Channel/i.test(text) && text.length < 48) {
        kind = 'slot'
      } else if (/Cooldown|Lasts |sec/i.test(text) && text.length < 40) {
        kind = 'weapon'
      }
      lines.push({ text, kind })
    }
    return lines
  }
  if (ability.cost && ability.resource) {
    lines.push({ text: `${ability.cost} ${ability.resource}`, kind: 'slot' })
  }
  if (ability.castTime) {
    lines.push({ text: `${ability.castTime} sec cast`, kind: 'weapon' })
  } else if (ability.gcd !== false) {
    lines.push({ text: 'Instant', kind: 'weapon' })
  }
  if (ability.cooldown) {
    lines.push({ text: `${ability.cooldown} sec cooldown`, kind: 'weapon' })
  }
  if (ability.duration) {
    lines.push({ text: `Lasts ${ability.duration} sec.`, kind: 'equip' })
  }
  return lines
}

export const TRINKET_USE_PRIORITY = 937

export function itemUseAbilityID(name: string) {
  return `use:${name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`
}

function talentNameKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function abilityUnlocked(ability: CatalogAbility, ranks: TalentRanks | undefined): boolean {
  if (!ability.requiresTalent) {
    return true
  }
  if ((ranks?.[ability.requiresTalent] ?? 0) > 0) {
    return true
  }
  const required = TALENTS.find((talent) => talent.id === ability.requiresTalent)
  const want = talentNameKey(required?.name ?? ability.name)
  for (const [id, rank] of Object.entries(ranks ?? {})) {
    if (!rank) {
      continue
    }
    const talent = TALENTS.find((entry) => entry.id === Number(id))
    if (talent && talentNameKey(talent.name) === want) {
      return true
    }
  }
  return false
}

export function useTrinketAbilities(gearIds: Record<number, number> | undefined): CatalogAbility[] {
  const seen = new Set<string>()
  const out: CatalogAbility[] = []
  for (const id of Object.values(gearIds ?? {})) {
    const item = ITEMS.find((entry) => entry.id === id)
    if (!item?.effects?.length) {
      continue
    }
    for (const effect of item.effects) {
      if (effect.kind !== 'use') {
        continue
      }
      const abilityId = itemUseAbilityID(item.name)
      if (seen.has(abilityId)) {
        continue
      }
      seen.add(abilityId)
      out.push({
        id: abilityId,
        name: item.name,
        icon: item.icon ?? 'inv_misc_questionmark',
        gcd: false,
        kind: 'trinket',
        priority: TRINKET_USE_PRIORITY,
        cooldown: effect.cooldown,
      })
    }
  }
  return out
}

export function rotationAbilities(
  playerClass: Class,
  race: number,
  gearIds?: Record<number, number>,
  combatPotion?: number,
): CatalogAbility[] {
  const classAbs = ABILITIES.filter((ability) => {
    if (ability.skipRotation) {
      return false
    }
    if (ability.class && ability.class !== playerClass) {
      return false
    }
    if (ability.race && ability.race !== race) {
      return false
    }
    if (!ability.class && !ability.race) {
      return false
    }
    return true
  })
  const extras = [...useTrinketAbilities(gearIds)]
  const potion = POTIONS.find((item) => item.id === combatPotion)
  const potionAbility = potionUseAbility(potion)
  if (potionAbility) {
    extras.push(potionAbility)
  }
  return [...classAbs, ...extras].sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
  )
}

export function defaultPriorities(
  playerClass: Class,
  race: number,
  gearIds?: Record<number, number>,
  combatPotion?: number,
): Record<string, number> {
  return Object.fromEntries(
    rotationAbilities(playerClass, race, gearIds, combatPotion).map((ability) => [
      ability.id,
      ability.priority,
    ]),
  )
}

export function defaultExecutePriorities(
  playerClass: Class,
  race: number,
  gearIds?: Record<number, number>,
  combatPotion?: number,
): Record<string, number> {
  const base = defaultPriorities(playerClass, race, gearIds, combatPotion)
  if (base.execute == null) {
    return base
  }
  const max = Math.max(0, ...Object.values(base))
  return { ...base, execute: max + 10 }
}
