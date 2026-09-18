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
  armor?: number
  windfury?: boolean
  windfuryAp?: number
  fireMul?: number
  frostMul?: number
  shadowMul?: number
  natureMul?: number
  holyMul?: number
  weaponDamage?: number
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

export const WEAPON_TEMP_CATEGORY = 'Weapon Enchant'

export const WEAPON_TEMPS: RaidBuff[] = BUFFS.filter((buff) => buff.category === WEAPON_TEMP_CATEGORY)

export function isMhOnlyWeaponTemp(buff: RaidBuff) {
  return Boolean(buff.spellPower || buff.spellCrit)
}

export const WEAPON_TEMP_OH: RaidBuff[] = WEAPON_TEMPS.filter((buff) => !isMhOnlyWeaponTemp(buff))

export const WEAPON_TEMP_IDS = new Set(WEAPON_TEMPS.map((buff) => buff.id))

export function isWeaponTemp(id: string): boolean {
  return WEAPON_TEMP_IDS.has(id)
}

export function enabledBuffIds(selected: Record<string, boolean>): string[] {
  return BUFFS.filter((buff) => selected[buff.id] && buff.category !== WEAPON_TEMP_CATEGORY).map(
    (buff) => buff.id,
  )
}

export const BUFF_SECTIONS = ['Consumables', 'Raid Buffs', 'World Buffs', 'Debuffs'] as const

export function buffsInCategory(category: string): RaidBuff[] {
  return BUFFS.filter((buff) => buff.category === category)
}

function pct(value: number) {
  return `${(value * 100).toFixed(0)}%`
}

export type BuffTooltipLine = { text: string; kind: 'name' | 'slot' | 'stat' | 'equip' | 'use' | 'bind' }

export function buffTooltipLines(buff: RaidBuff): BuffTooltipLine[] {
  const lines: BuffTooltipLine[] = [
    { text: buff.name, kind: 'name' },
    { text: buff.category, kind: 'slot' },
  ]
  const stat = (amount: number | undefined, label: string) => {
    if (amount) {
      lines.push({ text: `+${amount} ${label}`, kind: 'stat' })
    }
  }
  stat(buff.strength, 'Strength')
  stat(buff.agility, 'Agility')
  stat(buff.intellect, 'Intellect')
  stat(buff.attackPower, 'Attack Power')
  stat(buff.spellPower, 'Spell Power')
  if (buff.meleeCrit) {
    lines.push({ text: `Improves melee crit chance by ${pct(buff.meleeCrit)}.`, kind: 'equip' })
  }
  if (buff.spellCrit) {
    lines.push({ text: `Improves spell crit chance by ${pct(buff.spellCrit)}.`, kind: 'equip' })
  }
  if (buff.hitChance) {
    lines.push({ text: `Improves chance to hit by ${pct(buff.hitChance)}.`, kind: 'equip' })
  }
  if (buff.spellHit) {
    lines.push({ text: `Improves chance to hit with spells by ${pct(buff.spellHit)}.`, kind: 'equip' })
  }
  if (buff.statMul) {
    lines.push({ text: `Increases all stats by ${pct(buff.statMul)}.`, kind: 'equip' })
  }
  if (buff.apMul) {
    lines.push({ text: `Increases attack power by ${pct(buff.apMul)}.`, kind: 'equip' })
  }
  if (buff.damageMul) {
    lines.push({ text: `Increases damage dealt by ${pct(buff.damageMul)}.`, kind: 'equip' })
  }
  if (buff.armor) {
    lines.push({ text: `Reduces the target's armor by ${buff.armor}.`, kind: 'use' })
  }
  if (buff.windfury) {
    lines.push({
      text: `Windfury extra attacks${buff.windfuryAp ? ` (${buff.windfuryAp} bonus AP)` : ''}.`,
      kind: 'use',
    })
  }
  const school = (amount: number | undefined, label: string) => {
    if (amount) {
      lines.push({ text: `Increases ${label} damage taken by ${pct(amount)}.`, kind: 'use' })
    }
  }
  school(buff.fireMul, 'Fire')
  school(buff.frostMul, 'Frost')
  school(buff.shadowMul, 'Shadow')
  school(buff.natureMul, 'Nature')
  if (buff.holyMul) {
    lines.push({ text: `Increases Holy damage taken by ${pct(buff.holyMul)}.`, kind: 'use' })
  }
  if (buff.weaponDamage) {
    lines.push({ text: `Increases weapon damage by ${buff.weaponDamage}.`, kind: 'use' })
  }
  return lines
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
