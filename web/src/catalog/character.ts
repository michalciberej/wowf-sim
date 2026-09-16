import { Class, ItemSlot, Race } from '../gen/wowfsim/sim_pb.ts'
import { ITEMS, TALENTS, type CatalogItem } from './era.ts'
import { BUFFS } from './buffs.ts'
import overlayEffects from './item-effects.json' with { type: 'json' }
import type { TalentRanks } from '../sim/engine.ts'

export type SheetStats = {
  strength: number
  agility: number
  intellect: number
  spirit: number
  stamina: number
  attackPower: number
  spellPower: number
  meleeHit: number
  meleeCrit: number
  spellHit: number
  spellCrit: number
  mhDps: number
  mhSpeed: number
  melee: boolean
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

export function computeSheetStats(opts: {
  playerClass: Class
  race: Race
  gearIds: Record<number, number>
  raidBuffs: Record<string, boolean>
  talents: TalentRanks
}): SheetStats {
  const base = CLASS_BASE[opts.playerClass] ?? { str: 80, agi: 80, intel: 80, sta: 80, spi: 80, ap: 0 }
  const race = RACE_OFFSET[opts.race] ?? { str: 0, agi: 0, intel: 0, sta: 0, spi: 0 }
  let str = base.str + race.str
  let agi = base.agi + race.agi
  let intel = base.intel + race.intel
  let sta = base.sta + race.sta
  let spi = base.spi + race.spi
  let gearAP = base.ap
  let spellPower = 0
  let meleeHit = 0
  let spellHit = 0
  let gearCrit = 0
  let gearSpellCrit = 0
  let mhDps = 0
  let mhSpeed = 0

  const items: CatalogItem[] = Object.values(opts.gearIds).flatMap((id) => {
    const item = ITEMS.find((entry) => entry.id === id)
    return item ? [item] : []
  })
  for (const item of items) {
    str += item.strength ?? 0
    agi += item.agility ?? 0
    intel += item.intellect ?? 0
    sta += item.stamina ?? 0
    spi += item.spirit ?? 0
    gearAP += item.attackPower ?? 0
    spellPower += staticSpellPower(item)
    meleeHit += item.hitChance ?? 0
    spellHit += item.spellHitChance ?? 0
    gearCrit += item.critChance ?? 0
    gearSpellCrit += item.spellCritChance ?? 0
  }

  const mh = ITEMS.find((entry) => entry.id === (opts.gearIds[ItemSlot.MAIN_HAND] ?? 0))
  if (mh?.weaponDps) {
    mhDps = mh.weaponDps
    mhSpeed = (mh.attackSpeedMs ?? 0) / 1000
  }

  let raidStr = 0
  let raidAgi = 0
  let raidInt = 0
  let raidAP = 0
  let raidSP = 0
  let raidMeleeCrit = 0
  let raidSpellCrit = 0
  let raidHit = 0
  let raidSpellHit = 0
  let statMul = 1
  let apMul = 1
  for (const buff of BUFFS) {
    if (!opts.raidBuffs[buff.id] || !buffApplies(buff, opts.playerClass)) {
      continue
    }
    raidStr += buff.strength ?? 0
    raidAgi += buff.agility ?? 0
    raidInt += buff.intellect ?? 0
    raidAP += buff.attackPower ?? 0
    raidSP += buff.spellPower ?? 0
    raidMeleeCrit += buff.meleeCrit ?? 0
    raidSpellCrit += buff.spellCrit ?? 0
    raidHit += buff.hitChance ?? 0
    raidSpellHit += buff.spellHit ?? 0
    statMul *= 1 + (buff.statMul ?? 0)
    apMul *= 1 + (buff.apMul ?? 0)
  }

  str = (str + raidStr) * statMul
  agi = (agi + raidAgi) * statMul
  intel = (intel + raidInt) * statMul
  sta = sta * statMul
  spi = spi * statMul
  spellPower += raidSP
  meleeHit += raidHit
  spellHit += raidSpellHit
  gearCrit += raidMeleeCrit
  gearSpellCrit += raidSpellCrit

  const melee = usesMeleeAutos(opts.playerClass, opts.talents)
  let attackPower = (gearAP + raidAP + selfClassAP(opts.playerClass, opts.talents, opts.raidBuffs)) * apMul
  if (melee) {
    attackPower += attackPowerFromStats(opts.playerClass, str, agi) * apMul
  } else {
    attackPower = 0
  }

  return {
    strength: str,
    agility: agi,
    intellect: intel,
    spirit: spi,
    stamina: sta,
    attackPower,
    spellPower,
    meleeHit,
    meleeCrit: classBaseMeleeCrit(opts.playerClass) + meleeCritFromAgi(opts.playerClass, agi) + gearCrit,
    spellHit,
    spellCrit: baseSpellCrit(opts.playerClass) + spellCritFromInt(opts.playerClass, intel) + gearSpellCrit,
    mhDps,
    mhSpeed,
    melee,
  }
}
