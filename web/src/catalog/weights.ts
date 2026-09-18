import { Class } from '../gen/wowfsim/sim_pb.ts'
import warriorDefaults from './default-weights-warrior.json' with { type: 'json' }

export type WeightStat = {
  id: string
  name: string
  group: string
  hint: string
}

export const WEIGHT_STATS: WeightStat[] = [
  { id: 'attack-power', name: 'Attack Power', group: 'Melee', hint: 'Raw AP on gear and buffs' },
  { id: 'strength', name: 'Strength', group: 'Melee', hint: 'Converts to AP (2× for most plate)' },
  { id: 'agility', name: 'Agility', group: 'Melee', hint: 'AP for agi classes, plus melee crit' },
  { id: 'melee-hit', name: 'Melee Hit', group: 'Melee', hint: 'EP per 1% melee hit' },
  { id: 'melee-crit', name: 'Melee Crit', group: 'Melee', hint: 'EP per 1% melee crit' },
  { id: 'weapon-dps', name: 'Weapon DPS', group: 'Melee', hint: 'Main-hand weapon DPS' },
  { id: 'spell-power', name: 'Spell Power', group: 'Spell', hint: 'Reference stat for casters' },
  { id: 'intellect', name: 'Intellect', group: 'Spell', hint: 'Spell crit for casters' },
  { id: 'spell-hit', name: 'Spell Hit', group: 'Spell', hint: 'EP per 1% spell hit' },
  { id: 'spell-crit', name: 'Spell Crit', group: 'Spell', hint: 'EP per 1% spell crit' },
]

export const WEIGHT_GROUPS = [...new Set(WEIGHT_STATS.map((stat) => stat.group))]

export function emptyWeights(): Record<string, number> {
  return Object.fromEntries(WEIGHT_STATS.map((stat) => [stat.id, 0]))
}

export function defaultWeightsFor(playerClass: Class): Record<string, number> {
  const next = emptyWeights()
  if (playerClass === Class.WARRIOR) {
    Object.assign(next, warriorDefaults)
  }
  return next
}

export function weightStatsFor(playerClass: Class) {
  if (playerClass === Class.WARRIOR || playerClass === Class.ROGUE) {
    return WEIGHT_STATS.filter((stat) => stat.group === 'Melee')
  }
  if (playerClass === Class.MAGE || playerClass === Class.PRIEST || playerClass === Class.WARLOCK) {
    return WEIGHT_STATS.filter((stat) => stat.group === 'Spell')
  }
  return WEIGHT_STATS
}

export function weightsFromMeasured(
  rows: Array<{ id: string; ep: number }>,
): Record<string, number> {
  const next = emptyWeights()
  for (const row of rows) {
    next[row.id] = row.ep
  }
  return next
}
