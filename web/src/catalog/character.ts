import { Class, ItemSlot, Race, WarriorStance } from '../gen/wowfsim/sim_pb.ts'
import { ITEMS, TALENTS, type CatalogItem, type ItemEffect } from './era.ts'
import { enchantById } from './enchants.ts'
import { BUFFS } from './buffs.ts'
import { activeSetBonuses } from './sets.ts'
import overlayEffects from './item-effects.json' with { type: 'json' }
import RACIALS from './racials.json' with { type: 'json' }
import { itemUseAbilityID } from './abilities.ts'
import type { TalentRanks } from '../sim/engine.ts'

export const STAT_PARTS = ['base', 'gear', 'buffs', 'consumables', 'talents'] as const
export type StatPart = (typeof STAT_PARTS)[number]
export type StatParts = Record<StatPart, number>
export type StatBreakdownKind = 'int' | 'pct' | 'dps' | 'sec'

export const STAT_PART_LABELS: Record<StatPart, string> = {
  base: 'Base',
  gear: 'Gear',
  buffs: 'Buffs',
  consumables: 'Consumables',
  talents: 'Talents',
}

export type StatBreakdown = {
  total: number
  parts: StatParts
  kind: StatBreakdownKind
}

export type SheetStats = {
  strength: number
  agility: number
  intellect: number
  spirit: number
  stamina: number
  health: number
  attackPower: number
  spellPower: number
  meleeHit: number
  meleeHitCap: number
  mhHit: number
  mhHitCap: number
  ohHit: number
  ohHitCap: number
  meleeCrit: number
  spellHit: number
  spellCrit: number
  meleeHaste: number
  mhDps: number
  mhSpeed: number
  ohDps: number
  ohSpeed: number
  melee: boolean
  stanceDamage: number
  stanceCrit: number
  breakdowns: Record<string, StatBreakdown>
}

function emptyParts(): StatParts {
  return { base: 0, gear: 0, buffs: 0, consumables: 0, talents: 0 }
}

function sumParts(p: StatParts): number {
  return p.base + p.gear + p.buffs + p.consumables + p.talents
}

function addPart(p: StatParts, part: StatPart, n: number) {
  if (!n) return
  p[part] += n
}

function mulExtra(p: StatParts, mul: number, dest: StatPart) {
  if (mul === 1) return
  addPart(p, dest, sumParts(p) * (mul - 1))
}

function scaleParts(src: StatParts, factor: number): StatParts {
  return {
    base: src.base * factor,
    gear: src.gear * factor,
    buffs: src.buffs * factor,
    consumables: src.consumables * factor,
    talents: src.talents * factor,
  }
}

function addParts(a: StatParts, b: StatParts): StatParts {
  return {
    base: a.base + b.base,
    gear: a.gear + b.gear,
    buffs: a.buffs + b.buffs,
    consumables: a.consumables + b.consumables,
    talents: a.talents + b.talents,
  }
}

function makeBreakdown(total: number, parts: StatParts, kind: StatBreakdownKind): StatBreakdown {
  return { total, parts: { ...parts }, kind }
}

const CLASS_BASE: Record<number, { str: number; agi: number; intel: number; sta: number; spi: number; ap: number }> = {
  [Class.WARRIOR]: { str: 120, agi: 80, intel: 30, sta: 110, spi: 45, ap: 160 },
  [Class.PALADIN]: { str: 105, agi: 65, intel: 70, sta: 100, spi: 75, ap: 160 },
  [Class.HUNTER]: { str: 55, agi: 125, intel: 65, sta: 90, spi: 70, ap: 100 },
  [Class.ROGUE]: { str: 80, agi: 130, intel: 35, sta: 75, spi: 50, ap: 100 },
  [Class.PRIEST]: { str: 35, agi: 40, intel: 120, sta: 50, spi: 125, ap: -10 },
  [Class.SHAMAN]: { str: 85, agi: 55, intel: 90, sta: 95, spi: 100, ap: 100 },
  [Class.MAGE]: { str: 30, agi: 35, intel: 125, sta: 45, spi: 120, ap: -10 },
  [Class.WARLOCK]: { str: 45, agi: 50, intel: 110, sta: 65, spi: 115, ap: -10 },
  [Class.DRUID]: { str: 65, agi: 60, intel: 100, sta: 70, spi: 110, ap: -20 },
}

const RACE_OFFSET: Record<number, { str: number; agi: number; intel: number; sta: number; spi: number }> = {
  [Race.HUMAN]: { str: 0, agi: 0, intel: 0, sta: 0, spi: 0 },
  [Race.ORC]: { str: 3, agi: -3, intel: -3, sta: 2, spi: 3 },
  [Race.DWARF]: { str: 2, agi: -4, intel: -1, sta: 3, spi: -1 },
  [Race.NIGHT_ELF]: { str: -3, agi: 5, intel: 0, sta: -1, spi: 0 },
  [Race.UNDEAD]: { str: -1, agi: -2, intel: -2, sta: 1, spi: 5 },
  [Race.TAUREN]: { str: 5, agi: -5, intel: -5, sta: 2, spi: 2 },
  [Race.GNOME]: { str: -5, agi: 3, intel: 3, sta: -1, spi: 0 },
  [Race.TROLL]: { str: 1, agi: 2, intel: -4, sta: 1, spi: 1 },
  [Race.SKYBORNE]: { str: 0, agi: 0, intel: 0, sta: 0, spi: 0 },
}

function talentName(id: number) {
  return TALENTS.find((talent) => talent.id === id)?.name ?? ''
}

function talentAny(ranks: TalentRanks, names: string[]) {
  const want = new Set(names.map((name) => name.toLowerCase()))
  return Object.entries(ranks).some(([id, rank]) => rank > 0 && want.has(talentName(Number(id)).toLowerCase()))
}

function usesMeleeAutos(playerClass: Class, ranks: TalentRanks) {
  switch (playerClass) {
    case Class.MAGE:
    case Class.PRIEST:
    case Class.WARLOCK:
      return false
    case Class.DRUID:
      return talentAny(ranks, ['Feral Instinct', 'Predatory Strikes', 'Savage Fury', 'Feral Charge', 'Leader of the Pack'])
    case Class.SHAMAN:
      return talentAny(ranks, ['Stormstrike', 'Dual Wield Specialization', 'Flurry', 'Elemental Weapons', 'Unleashed Rage'])
    default:
      return true
  }
}

function meleeAPFromStats(playerClass: Class, str: number, agi: number) {
  switch (playerClass) {
    case Class.ROGUE:
      return str + agi
    case Class.HUNTER:
      return str
    case Class.DRUID:
      return str * 2 + agi
    case Class.WARRIOR:
    case Class.PALADIN:
    case Class.SHAMAN:
      return str * 2
    default:
      return str
  }
}

function attackPowerFromStats(playerClass: Class, str: number, agi: number) {
  if (playerClass === Class.HUNTER) {
    return agi * 2
  }
  return meleeAPFromStats(playerClass, str, agi)
}

const BATTLE_SHOUT_AP = 232
const YELLOW_MISS = 0.09
const WHITE_MISS_DW = 0.28

const CLASS_BASE_HEALTH: Record<number, number> = {
  [Class.WARRIOR]: 1689,
  [Class.PALADIN]: 1389,
  [Class.HUNTER]: 1467,
  [Class.ROGUE]: 1593,
  [Class.PRIEST]: 1396,
  [Class.SHAMAN]: 1377,
  [Class.MAGE]: 1376,
  [Class.WARLOCK]: 1412,
  [Class.DRUID]: 1483,
}

function healthFromStamina(playerClass: Class, race: Race, stamina: number) {
  const base = CLASS_BASE_HEALTH[playerClass] ?? 1400
  let hp = base + Math.round(stamina) * 10
  for (const racial of RACIALS as Array<{ race?: number; passive?: boolean; healthMul?: number }>) {
    if (racial.passive && racial.race === race && racial.healthMul) {
      hp *= 1 + racial.healthMul
    }
  }
  return Math.floor(hp)
}

function weaponMatches(subclass: string, kind: string) {
  return Boolean(subclass && kind && subclass.toLowerCase().includes(kind.toLowerCase()))
}

function racialPassives(race: Race, subclasses: string[]) {
  let meleeHit = 0
  let meleeCrit = 0
  let spellCrit = 0
  let haste = 0
  for (const racial of RACIALS as Array<{
    race?: number
    passive?: boolean
    hitChance?: number
    haste?: number
    critWhile?: number
    critWhileWeapon?: string
  }>) {
    if (!racial.passive || racial.race !== race) {
      continue
    }
    meleeHit += racial.hitChance ?? 0
    haste += racial.haste ?? 0
    if (
      racial.critWhile &&
      subclasses.some((subclass) => weaponMatches(subclass, racial.critWhileWeapon ?? ''))
    ) {
      meleeCrit += racial.critWhile
      spellCrit += racial.critWhile
    }
  }
  return { meleeHit, meleeCrit, spellCrit, haste }
}

function isDualWield(mh?: CatalogItem, oh?: CatalogItem) {
  return mh?.hand !== '2h' && !!oh?.weaponDps && oh.hand !== '2h'
}

function talentRankText(id: number, rank: number) {
  const talent = TALENTS.find((entry) => entry.id === id)
  if (!talent?.ranks?.length || rank <= 0) {
    return ''
  }
  return talent.ranks[Math.min(rank, talent.ranks.length) - 1] ?? ''
}

function firstPct(text: string) {
  const match = text.match(/(\d+(?:\.\d+)?)%/)
  return match ? Number(match[1]) / 100 : 0
}

function talentPassives(playerClass: Class, ranks: TalentRanks) {
  let meleeCrit = 0
  let hit = 0
  let strMul = 1
  let agiMul = 1
  let intMul = 1
  if (playerClass === Class.WARRIOR) {
    hit += 0.01 * talentRankByName(ranks, 'Precision')
    meleeCrit += 0.01 * talentRankByName(ranks, 'Cruelty')
    return { meleeCrit, hit, strMul, agiMul, intMul }
  }
  for (const [idKey, rank] of Object.entries(ranks)) {
    if (!rank) {
      continue
    }
    const talent = TALENTS.find((entry) => entry.id === Number(idKey) && entry.class === playerClass)
    if (!talent) {
      continue
    }
    const t = talentRankText(talent.id, rank).toLowerCase().replace(/\n/g, ' ')
    if (!t || t.includes('when activated') || t.includes('your next ')) {
      continue
    }
    if (t.includes('your pet') || t.includes('summoned')) {
      continue
    }
    for (const match of t.matchAll(/(strength|agility|intellect) by (\d+(?:\.\d+)?)%/g)) {
      const mul = 1 + Number(match[2]) / 100
      if (match[1] === 'strength') {
        strMul *= mul
      } else if (match[1] === 'agility') {
        agiMul *= mul
      } else {
        intMul *= mul
      }
    }
    if (t.includes('chance to hit') && !t.includes('their chance to hit') && !t.includes('trap') && !t.includes('feign death')) {
      const p = firstPct(t)
      if (p && !(t.includes('spell') && !t.includes('attack'))) {
        hit += p
      }
    }
    if (t.includes('critical strike damage bonus')) {
      continue
    }
    if (t.includes('critical strike chance') || t.includes('chance to get a critical strike')) {
      if (t.includes('your ') && !t.includes('your critical') && !t.includes('all attacks') && !t.includes('melee attacks') && !t.includes('spells and melee')) {
        continue
      }
      meleeCrit += firstPct(t)
    }
  }
  return { meleeCrit, hit, strMul, agiMul, intMul }
}

function talentRankByName(ranks: TalentRanks, name: string) {
  const want = name.toLowerCase()
  for (const [id, rank] of Object.entries(ranks)) {
    if ((rank ?? 0) > 0 && talentName(Number(id)).toLowerCase() === want) {
      return rank
    }
  }
  return 0
}

function selfClassAP(playerClass: Class, ranks: TalentRanks, raidBuffs: Record<string, boolean>) {
  if (playerClass === Class.WARRIOR && !raidBuffs['battle-shout']) {
    return BATTLE_SHOUT_AP * (1 + 0.05 * talentRankByName(ranks, 'Improved Battle Shout'))
  }
  return 0
}

export function sheetShows(playerClass: Class, melee: boolean) {
  switch (playerClass) {
    case Class.MAGE:
    case Class.PRIEST:
    case Class.WARLOCK:
      return { attributes: ['stamina', 'intellect', 'spirit'] as const, melee: false, spell: true }
    case Class.HUNTER:
      return { attributes: ['strength', 'agility', 'stamina'] as const, melee: true, spell: false }
    case Class.WARRIOR:
    case Class.ROGUE:
      return { attributes: ['strength', 'agility', 'stamina'] as const, melee: true, spell: false }
    default:
      return {
        attributes: ['strength', 'agility', 'stamina', 'intellect', 'spirit'] as const,
        melee,
        spell: true,
      }
  }
}

function meleeCritFromAgi(playerClass: Class, agi: number) {
  let pctPerAgi = 0.05
  if (playerClass === Class.PALADIN) {
    pctPerAgi = 0.0506
  }
  if (playerClass === Class.HUNTER) {
    pctPerAgi = 0.0189
  }
  if (playerClass === Class.ROGUE) {
    pctPerAgi = 0.0345
  }
  if (playerClass === Class.SHAMAN) {
    pctPerAgi = 0.0508
  }
  if (playerClass === Class.MAGE) {
    pctPerAgi = 0.0514
  }
  return (agi * pctPerAgi) / 100
}

function classBaseMeleeCrit(playerClass: Class) {
  switch (playerClass) {
    case Class.PALADIN:
      return 0.007
    case Class.PRIEST:
      return 0.03
    case Class.SHAMAN:
      return 0.017
    case Class.MAGE:
      return 0.032
    case Class.WARLOCK:
      return 0.02
    case Class.DRUID:
      return 0.009
    default:
      return 0
  }
}

function spellCritFromInt(playerClass: Class, intel: number) {
  if (playerClass === Class.WARRIOR || playerClass === Class.ROGUE || playerClass === Class.HUNTER) {
    return 0
  }
  if (playerClass === Class.PALADIN || playerClass === Class.DRUID) {
    return (intel * 0.0167) / 100
  }
  if (playerClass === Class.WARLOCK) {
    return (intel * 0.0165) / 100
  }
  if (playerClass === Class.SHAMAN) {
    return (intel * 0.0169) / 100
  }
  return (intel * 0.0168) / 100
}

function baseSpellCrit(playerClass: Class) {
  switch (playerClass) {
    case Class.PALADIN:
      return 0.035
    case Class.HUNTER:
      return 0.036
    case Class.PRIEST:
      return 0.008
    case Class.SHAMAN:
      return 0.023
    case Class.MAGE:
      return 0.002
    case Class.WARLOCK:
      return 0.017
    case Class.DRUID:
      return 0.018
    default:
      return 0
  }
}

export function itemEffectsFor(item: { name: string; effects?: Array<Record<string, unknown>> }) {
  if (item.effects?.length) {
    return item.effects
  }
  return (overlayEffects as Record<string, Array<Record<string, unknown>>>)[item.name] ?? []
}

function staticSpellPower(item: CatalogItem) {
  const sp = item.spellPower ?? 0
  for (const effect of itemEffectsFor(item)) {
    if (effect.kind === 'use' && effect.spellPower && sp === effect.spellPower) {
      return 0
    }
  }
  return sp
}

export function buffApplies(buff: (typeof BUFFS)[number], playerClass: Class) {
  if (buff.skipClass?.includes(playerClass)) {
    return false
  }
  if (buff.onlyClass?.length && !buff.onlyClass.includes(playerClass)) {
    return false
  }
  return true
}

function useAttackPower(effect: ItemEffect) {
  if (effect.stackAP && effect.interval && effect.duration) {
    const n = effect.duration / effect.interval
    return (effect.stackAP * (n + 1)) / 2
  }
  return effect.attackPower ?? 0
}

export function computeSheetStats(opts: {
  playerClass: Class
  race: Race
  gearIds: Record<number, number>
  enchantIds?: Record<number, number>
  raidBuffs: Record<string, boolean>
  mhWeaponTemp?: string
  ohWeaponTemp?: string
  talents: TalentRanks
  abilityPriorities?: Record<string, number>
  stance?: number
}): SheetStats {
  const base = CLASS_BASE[opts.playerClass] ?? { str: 80, agi: 80, intel: 80, sta: 80, spi: 80, ap: 0 }
  const race = RACE_OFFSET[opts.race] ?? { str: 0, agi: 0, intel: 0, sta: 0, spi: 0 }
  const p = {
    str: emptyParts(),
    agi: emptyParts(),
    intel: emptyParts(),
    sta: emptyParts(),
    spi: emptyParts(),
    ap: emptyParts(),
    sp: emptyParts(),
    meleeHit: emptyParts(),
    spellHit: emptyParts(),
    meleeCrit: emptyParts(),
    spellCrit: emptyParts(),
    haste: emptyParts(),
    mhDps: emptyParts(),
    ohDps: emptyParts(),
  }

  addPart(p.str, 'base', base.str + race.str)
  addPart(p.agi, 'base', base.agi + race.agi)
  addPart(p.intel, 'base', base.intel + race.intel)
  addPart(p.sta, 'base', base.sta + race.sta)
  addPart(p.spi, 'base', base.spi + race.spi)
  addPart(p.ap, 'base', base.ap)

  const stanceCrit =
    opts.playerClass === Class.WARRIOR && opts.stance !== WarriorStance.BATTLE && opts.stance !== WarriorStance.DEFENSIVE
      ? 0.03
      : 0
  const stanceDamage = opts.playerClass === Class.WARRIOR && opts.stance === WarriorStance.DEFENSIVE ? -0.1 : 0

  const items: CatalogItem[] = Object.values(opts.gearIds).flatMap((id) => {
    const item = ITEMS.find((entry) => entry.id === id)
    return item ? [item] : []
  })
  for (const item of items) {
    addPart(p.str, 'gear', item.strength ?? 0)
    addPart(p.agi, 'gear', item.agility ?? 0)
    addPart(p.intel, 'gear', item.intellect ?? 0)
    addPart(p.sta, 'gear', item.stamina ?? 0)
    addPart(p.spi, 'gear', item.spirit ?? 0)
    addPart(p.ap, 'gear', item.attackPower ?? 0)
    addPart(p.sp, 'gear', staticSpellPower(item))
    addPart(p.meleeHit, 'gear', item.hitChance ?? 0)
    addPart(p.spellHit, 'gear', item.spellHitChance ?? 0)
    addPart(p.meleeCrit, 'gear', item.critChance ?? 0)
    addPart(p.spellCrit, 'gear', item.spellCritChance ?? 0)
  }
  for (const bonus of activeSetBonuses(items)) {
    addPart(p.str, 'gear', bonus.strength ?? 0)
    addPart(p.agi, 'gear', bonus.agility ?? 0)
    addPart(p.intel, 'gear', bonus.intellect ?? 0)
    addPart(p.sta, 'gear', bonus.stamina ?? 0)
    addPart(p.spi, 'gear', bonus.spirit ?? 0)
    addPart(p.ap, 'gear', bonus.attackPower ?? 0)
    if (opts.playerClass === Class.HUNTER) {
      addPart(p.ap, 'gear', bonus.rangedAttackPower ?? 0)
    }
    addPart(p.sp, 'gear', bonus.spellPower ?? 0)
    addPart(p.meleeHit, 'gear', bonus.hitChance ?? 0)
    addPart(p.spellHit, 'gear', bonus.spellHitChance ?? 0)
    addPart(p.meleeCrit, 'gear', bonus.critChance ?? 0)
    addPart(p.spellCrit, 'gear', bonus.spellCritChance ?? 0)
    addPart(p.haste, 'gear', bonus.haste ?? 0)
  }
  let mhEnchantDmgGear = 0
  let mhEnchantDmgTemp = 0
  let ohEnchantDmgGear = 0
  let ohEnchantDmgTemp = 0
  for (const [slotKey, id] of Object.entries(opts.enchantIds ?? {})) {
    const enchant = enchantById(id)
    if (!enchant) {
      continue
    }
    addPart(p.str, 'gear', enchant.strength ?? 0)
    addPart(p.agi, 'gear', enchant.agility ?? 0)
    addPart(p.intel, 'gear', enchant.intellect ?? 0)
    addPart(p.sta, 'gear', enchant.stamina ?? 0)
    addPart(p.spi, 'gear', enchant.spirit ?? 0)
    addPart(p.ap, 'gear', enchant.attackPower ?? 0)
    addPart(p.sp, 'gear', enchant.spellPower ?? 0)
    addPart(p.meleeHit, 'gear', enchant.hitChance ?? 0)
    addPart(p.spellHit, 'gear', enchant.spellHitChance ?? 0)
    addPart(p.meleeCrit, 'gear', enchant.critChance ?? 0)
    addPart(p.spellCrit, 'gear', enchant.spellCritChance ?? 0)
    addPart(p.haste, 'gear', enchant.haste ?? 0)
    if (Number(slotKey) === ItemSlot.MAIN_HAND) {
      mhEnchantDmgGear += enchant.weaponDamage ?? 0
    }
    if (Number(slotKey) === ItemSlot.OFF_HAND) {
      ohEnchantDmgGear += enchant.weaponDamage ?? 0
    }
  }

  const mhTemp = BUFFS.find((buff) => buff.id === opts.mhWeaponTemp && buff.category === 'Weapon Enchant')
  const ohTemp = BUFFS.find((buff) => buff.id === opts.ohWeaponTemp && buff.category === 'Weapon Enchant')
  if (mhTemp) {
    mhEnchantDmgTemp += mhTemp.weaponDamage ?? 0
    addPart(p.meleeCrit, 'consumables', mhTemp.meleeCrit ?? 0)
    addPart(p.sp, 'consumables', mhTemp.spellPower ?? 0)
    addPart(p.spellCrit, 'consumables', mhTemp.spellCrit ?? 0)
  }

  const mh = ITEMS.find((entry) => entry.id === (opts.gearIds[ItemSlot.MAIN_HAND] ?? 0))
  const oh = ITEMS.find((entry) => entry.id === (opts.gearIds[ItemSlot.OFF_HAND] ?? 0))
  const dualWield = isDualWield(mh, oh)
  const racial = racialPassives(
    opts.race,
    [mh?.itemSubclass, oh?.itemSubclass].filter((value): value is string => Boolean(value)),
  )
  addPart(p.meleeHit, 'base', racial.meleeHit)
  addPart(p.meleeCrit, 'base', racial.meleeCrit)
  addPart(p.spellCrit, 'base', racial.spellCrit)
  addPart(p.haste, 'base', racial.haste)
  if (ohTemp && dualWield) {
    ohEnchantDmgTemp += ohTemp.weaponDamage ?? 0
    addPart(p.meleeCrit, 'consumables', ohTemp.meleeCrit ?? 0)
  }

  for (const item of items) {
    for (const effect of itemEffectsFor(item) as ItemEffect[]) {
      if (effect.kind !== 'use') {
        continue
      }
      const prio = opts.abilityPriorities?.[itemUseAbilityID(item.name)]
      if (prio !== undefined && prio <= 0) {
        continue
      }
      addPart(p.str, 'gear', effect.strength ?? 0)
      addPart(p.agi, 'gear', effect.agility ?? 0)
      addPart(p.sp, 'gear', effect.spellPower ?? 0)
      addPart(p.meleeCrit, 'gear', effect.crit ?? 0)
      addPart(p.haste, 'gear', effect.haste ?? 0)
    }
  }

  const mhSpeed = mh?.weaponDps ? (mh.attackSpeedMs ?? 0) / 1000 : 0
  const ohSpeed = dualWield && oh?.weaponDps ? (oh.attackSpeedMs ?? 0) / 1000 : 0
  if (mh?.weaponDps) {
    addPart(p.mhDps, 'gear', mh.weaponDps)
    if (mhSpeed) {
      addPart(p.mhDps, 'gear', mhEnchantDmgGear / mhSpeed)
      addPart(p.mhDps, 'consumables', mhEnchantDmgTemp / mhSpeed)
    }
  }
  if (dualWield && oh?.weaponDps) {
    addPart(p.ohDps, 'gear', oh.weaponDps)
    if (ohSpeed) {
      addPart(p.ohDps, 'gear', ohEnchantDmgGear / ohSpeed)
      addPart(p.ohDps, 'consumables', ohEnchantDmgTemp / ohSpeed)
    }
  }

  let statMul = 1
  let apMul = 1
  for (const buff of BUFFS) {
    if (!opts.raidBuffs[buff.id] || !buffApplies(buff, opts.playerClass) || buff.category === 'Weapon Enchant') {
      continue
    }
    const part: StatPart = buff.category === 'Consumables' ? 'consumables' : 'buffs'
    addPart(p.str, part, buff.strength ?? 0)
    addPart(p.agi, part, buff.agility ?? 0)
    addPart(p.intel, part, buff.intellect ?? 0)
    addPart(p.ap, part, buff.attackPower ?? 0)
    addPart(p.sp, part, buff.spellPower ?? 0)
    addPart(p.meleeCrit, part, buff.meleeCrit ?? 0)
    addPart(p.spellCrit, part, buff.spellCrit ?? 0)
    addPart(p.meleeHit, part, buff.hitChance ?? 0)
    addPart(p.spellHit, part, buff.spellHit ?? 0)
    statMul *= 1 + (buff.statMul ?? 0)
    apMul *= 1 + (buff.apMul ?? 0)
  }

  mulExtra(p.str, statMul, 'buffs')
  mulExtra(p.agi, statMul, 'buffs')
  mulExtra(p.intel, statMul, 'buffs')
  mulExtra(p.sta, statMul, 'buffs')
  mulExtra(p.spi, statMul, 'buffs')

  const passives = talentPassives(opts.playerClass, opts.talents)
  mulExtra(p.str, passives.strMul, 'talents')
  mulExtra(p.agi, passives.agiMul, 'talents')
  mulExtra(p.intel, passives.intMul, 'talents')
  addPart(p.meleeHit, 'talents', passives.hit)
  addPart(p.meleeCrit, 'talents', passives.meleeCrit)
  addPart(p.ap, 'buffs', selfClassAP(opts.playerClass, opts.talents, opts.raidBuffs))
  mulExtra(p.ap, apMul, 'buffs')

  const str = sumParts(p.str)
  const agi = sumParts(p.agi)
  const intel = sumParts(p.intel)
  const spi = sumParts(p.spi)
  const sta = sumParts(p.sta)

  const melee = usesMeleeAutos(opts.playerClass, opts.talents)
  if (melee) {
    const fromStr = attackPowerFromStats(opts.playerClass, str, 0) * apMul
    const fromAgi =
      (attackPowerFromStats(opts.playerClass, str, agi) - attackPowerFromStats(opts.playerClass, str, 0)) * apMul
    if (str) p.ap = addParts(p.ap, scaleParts(p.str, fromStr / str))
    if (agi) p.ap = addParts(p.ap, scaleParts(p.agi, fromAgi / agi))
    for (const item of items) {
      for (const effect of itemEffectsFor(item) as ItemEffect[]) {
        if (effect.kind !== 'use') continue
        const prio = opts.abilityPriorities?.[itemUseAbilityID(item.name)]
        if (prio !== undefined && prio <= 0) continue
        addPart(p.ap, 'gear', useAttackPower(effect))
      }
    }
  } else {
    p.ap = emptyParts()
  }

  addPart(p.meleeCrit, 'base', classBaseMeleeCrit(opts.playerClass) + stanceCrit)
  if (agi) {
    p.meleeCrit = addParts(p.meleeCrit, scaleParts(p.agi, meleeCritFromAgi(opts.playerClass, agi) / agi))
  }
  addPart(p.spellCrit, 'base', baseSpellCrit(opts.playerClass))
  if (intel) {
    p.spellCrit = addParts(p.spellCrit, scaleParts(p.intel, spellCritFromInt(opts.playerClass, intel) / intel))
  }

  const dwOhHit = dualWield && opts.playerClass === Class.WARRIOR
    ? 0.02 * talentRankByName(opts.talents, 'Dual Wield Specialization')
    : 0
  const ohHitParts = { ...p.meleeHit }
  addPart(ohHitParts, 'talents', dwOhHit)

  const health = healthFromStamina(opts.playerClass, opts.race, sta)
  const fromSta = Math.round(sta) * 10
  let healthParts = emptyParts()
  addPart(healthParts, 'base', CLASS_BASE_HEALTH[opts.playerClass] ?? 1400)
  if (sta) healthParts = addParts(healthParts, scaleParts(p.sta, fromSta / sta))
  addPart(healthParts, 'base', health - sumParts(healthParts))

  const mhSpeedParts = emptyParts()
  const ohSpeedParts = emptyParts()
  addPart(mhSpeedParts, 'gear', mhSpeed)
  addPart(ohSpeedParts, 'gear', ohSpeed)
  const stanceParts = emptyParts()
  addPart(stanceParts, 'base', stanceDamage)

  const attackPower = sumParts(p.ap)
  const spellPower = sumParts(p.sp)
  const meleeHit = sumParts(p.meleeHit)
  const spellHit = sumParts(p.spellHit)
  const meleeCrit = sumParts(p.meleeCrit)
  const spellCrit = sumParts(p.spellCrit)
  const meleeHaste = sumParts(p.haste)
  const mhDps = sumParts(p.mhDps)
  const ohDps = sumParts(p.ohDps)
  const ohHit = dualWield ? meleeHit + dwOhHit : 0

  return {
    strength: str,
    agility: agi,
    intellect: intel,
    spirit: spi,
    stamina: sta,
    health,
    attackPower,
    spellPower,
    meleeHit,
    meleeHitCap: YELLOW_MISS,
    mhHit: meleeHit,
    mhHitCap: dualWield ? WHITE_MISS_DW : YELLOW_MISS,
    ohHit,
    ohHitCap: WHITE_MISS_DW,
    meleeCrit,
    spellHit,
    spellCrit,
    meleeHaste,
    mhDps,
    mhSpeed,
    ohDps,
    ohSpeed,
    melee,
    stanceDamage,
    stanceCrit,
    breakdowns: {
      health: makeBreakdown(health, healthParts, 'int'),
      strength: makeBreakdown(str, p.str, 'int'),
      agility: makeBreakdown(agi, p.agi, 'int'),
      intellect: makeBreakdown(intel, p.intel, 'int'),
      spirit: makeBreakdown(spi, p.spi, 'int'),
      stamina: makeBreakdown(sta, p.sta, 'int'),
      attackPower: makeBreakdown(attackPower, p.ap, 'int'),
      spellPower: makeBreakdown(spellPower, p.sp, 'int'),
      meleeHit: makeBreakdown(meleeHit, p.meleeHit, 'pct'),
      mhHit: makeBreakdown(meleeHit, p.meleeHit, 'pct'),
      ohHit: makeBreakdown(ohHit, ohHitParts, 'pct'),
      meleeCrit: makeBreakdown(meleeCrit, p.meleeCrit, 'pct'),
      spellHit: makeBreakdown(spellHit, p.spellHit, 'pct'),
      spellCrit: makeBreakdown(spellCrit, p.spellCrit, 'pct'),
      meleeHaste: makeBreakdown(meleeHaste, p.haste, 'pct'),
      mhDps: makeBreakdown(mhDps, p.mhDps, 'dps'),
      mhSpeed: makeBreakdown(mhSpeed, mhSpeedParts, 'sec'),
      ohDps: makeBreakdown(ohDps, p.ohDps, 'dps'),
      ohSpeed: makeBreakdown(ohSpeed, ohSpeedParts, 'sec'),
      stanceDamage: makeBreakdown(stanceDamage, stanceParts, 'pct'),
    },
  }
}
