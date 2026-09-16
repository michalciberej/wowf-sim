import buffs from './buffs.json' with { type: 'json' }

export type RaidBuff = {
  id: string
  name: string
  icon: string
  category: string
  default?: boolean
  skipClass?: number[]
  onlyClass?: number[]
  strength?: number
  agility?: number
  intellect?: number
  attackPower?: number
  spellPower?: number
  meleeCrit?: number
  spellCrit?: number
  hitChance?: number
  spellHit?: number
  statMul?: number
  apMul?: number
  damageMul?: number
}

export const BUFFS: RaidBuff[] = buffs as RaidBuff[]

export function defaultRaidBuffs(): Record<string, boolean> {
  const selected: Record<string, boolean> = {}
  for (const buff of BUFFS) {
    if (buff.default) {
      selected[buff.id] = true
    }
  }
  return selected
}

export function enabledBuffIds(selected: Record<string, boolean>): string[] {
  return BUFFS.filter((buff) => selected[buff.id]).map((buff) => buff.id)
}

export const BUFF_SECTIONS = ['Consumables', 'Raid Buffs', 'World Buffs', 'Debuffs'] as const

export function buffsInCategory(category: string): RaidBuff[] {
  return BUFFS.filter((buff) => buff.category === category)
}

export function buffsByCategory(): Array<[string, RaidBuff[]]> {
  const groups = new Map<string, RaidBuff[]>()
  for (const buff of BUFFS) {
    const list = groups.get(buff.category) ?? []
    list.push(buff)
    groups.set(buff.category, list)
  }
  const named = BUFF_SECTIONS.filter((name) => groups.has(name)).map(
    (name) => [name, groups.get(name)!] as [string, RaidBuff[]],
  )
  for (const [name, buffs] of groups) {
    if (!(BUFF_SECTIONS as readonly string[]).includes(name)) {
      named.push([name, buffs])
    }
  }
  return named
}
