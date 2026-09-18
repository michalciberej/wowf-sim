import { Class, ItemSlot, Race, WarriorStance } from './gen/wowfsim/sim_pb.ts'
import { ITEMS, TALENTS, canEquipItem } from './catalog/era.ts'
import { enchantById, enchantFitsSlot } from './catalog/enchants.ts'
import { BUFFS, defaultRaidBuffs, isMhOnlyWeaponTemp, isWeaponTemp, WEAPON_TEMPS } from './catalog/buffs.ts'
import { defaultPriorities } from './catalog/abilities.ts'
import { defaultCombatPotionId, POTIONS, potionUsableByClass } from './catalog/potions.ts'
import { defaultWeightsFor } from './catalog/weights.ts'
import type { TalentRanks } from './sim/engine.ts'

export const STORAGE_KEY = 'wowf-sim.setup.v1'
const VERSION = 1

export type SettingsTab = 'gear' | 'talents' | 'rotation' | 'settings' | 'weights'

export type ClassSetup = {
  race: Race
  stance: WarriorStance
  gearIds: Record<number, number>
  enchantIds: Record<number, number>
  talentRanks: TalentRanks
  raidBuffs: Record<string, boolean>
  mhWeaponTemp: string
  ohWeaponTemp: string
  abilityPriorities: Record<string, number>
  combatPotion: number
  customEP: Record<string, number>
}

export type SavedRoot = {
  v: number
  playerClass: Class
  duration: number
  iterations: number
  rngSeed: number
  tab: SettingsTab
  byClass: Record<number, ClassSetup>
}

export const DEFAULT_GEAR: Record<number, number> = {
  [ItemSlot.HEAD]: 16963,
  [ItemSlot.NECK]: 18404,
  [ItemSlot.SHOULDER]: 16961,
  [ItemSlot.BACK]: 18541,
  [ItemSlot.CHEST]: 16966,
  [ItemSlot.WRIST]: 19146,
  [ItemSlot.HANDS]: 16964,
  [ItemSlot.WAIST]: 19137,
  [ItemSlot.LEGS]: 16962,
  [ItemSlot.FEET]: 19387,
  [ItemSlot.FINGER_1]: 18821,
  [ItemSlot.FINGER_2]: 17063,
  [ItemSlot.TRINKET_1]: 11815,
  [ItemSlot.TRINKET_2]: 19406,
  [ItemSlot.MAIN_HAND]: 19019,
  [ItemSlot.OFF_HAND]: 18805,
  [ItemSlot.RANGED]: 17069,
}

const TABS: SettingsTab[] = ['gear', 'talents', 'rotation', 'settings', 'weights']

function isClass(value: unknown): value is Class {
  return typeof value === 'number' && value >= Class.WARRIOR && value <= Class.DRUID
}

function isRace(value: unknown): value is Race {
  return typeof value === 'number' && value >= Race.HUMAN && value <= Race.SKYBORNE
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, value))
}

function sanitizeWeaponTemp(raw: unknown, legacyBuffs: Record<string, unknown>): string {
  const id = String(raw ?? '')
  if (isWeaponTemp(id)) {
    return id
  }
  for (const buff of WEAPON_TEMPS) {
    if (legacyBuffs[buff.id]) {
      return buff.id
    }
  }
  return ''
}

function numberMap(raw: unknown): Record<number, number> {
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  const out: Record<number, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key)
    const n = Number(value)
    if (Number.isFinite(id) && Number.isFinite(n)) {
      out[id] = n
    }
  }
  return out
}

function stringNumberMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value)
    if (key && Number.isFinite(n)) {
      out[key] = n
    }
  }
  return out
}

export function sanitizeEnchants(
  enchantIds: Record<number, number>,
  gearIds: Record<number, number>,
): Record<number, number> {
  const next: Record<number, number> = {}
  for (const [slotKey, id] of Object.entries(enchantIds)) {
    if (!id) {
      continue
    }
    const slot = Number(slotKey) as ItemSlot
    const enchant = enchantById(id)
    const item = ITEMS.find((entry) => entry.id === (gearIds[slot] ?? 0))
    if (!item || !enchant || enchant.kind !== 'permanent' || !enchantFitsSlot(enchant, slot, item)) {
      continue
    }
    next[slot] = id
  }
  return next
}

export function sanitizeGear(gearIds: Record<number, number>, playerClass: Class): Record<number, number> {
  const next: Record<number, number> = {}
  for (const [slotKey, id] of Object.entries(gearIds)) {
    if (!id) {
      continue
    }
    const slot = Number(slotKey) as ItemSlot
    const item = ITEMS.find((entry) => entry.id === id)
    if (item && canEquipItem(item, playerClass, slot)) {
      next[slot] = id
    }
  }
  return next
}

export function defaultClassSetup(playerClass: Class, race: Race): ClassSetup {
  const safeRace = isRace(race) ? race : Race.ORC
  const gearIds = sanitizeGear(DEFAULT_GEAR, playerClass)
  const combatPotion = defaultCombatPotionId(playerClass)
  return {
    race: safeRace,
    stance: WarriorStance.BERSERKER,
    gearIds,
    enchantIds: {},
    talentRanks: {},
    raidBuffs: defaultRaidBuffs(),
    mhWeaponTemp: '',
    ohWeaponTemp: '',
    combatPotion,
    abilityPriorities: defaultPriorities(playerClass, safeRace, gearIds, combatPotion),
    customEP: defaultWeightsFor(playerClass),
  }
}

export function sanitizeClassSetup(raw: unknown, playerClass: Class, fallbackRace: Race): ClassSetup {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const race = isRace(src.race) ? src.race : fallbackRace
  const gearIds = sanitizeGear(numberMap(src.gearIds), playerClass)
  const enchantIds = sanitizeEnchants(numberMap(src.enchantIds), gearIds)
  const knownBuffs = new Set(BUFFS.map((buff) => buff.id))
  const raidBuffs: Record<string, boolean> = {}
  if (src.raidBuffs && typeof src.raidBuffs === 'object') {
    for (const [id, on] of Object.entries(src.raidBuffs as Record<string, unknown>)) {
      if (knownBuffs.has(id) && !isWeaponTemp(id)) {
        raidBuffs[id] = Boolean(on)
      }
    }
  } else {
    Object.assign(raidBuffs, defaultRaidBuffs())
  }
  const mhWeaponTemp = sanitizeWeaponTemp(
    src.mhWeaponTemp,
    src.raidBuffs && typeof src.raidBuffs === 'object' ? (src.raidBuffs as Record<string, unknown>) : {},
  )
  const ohWeaponTemp = sanitizeWeaponTemp(src.ohWeaponTemp, {})
  const ohBuff = BUFFS.find((buff) => buff.id === ohWeaponTemp)
  const ohTemp = ohBuff && !isMhOnlyWeaponTemp(ohBuff) ? ohWeaponTemp : ''
  const talentRanks: TalentRanks = {}
  for (const [idKey, rank] of Object.entries(numberMap(src.talentRanks))) {
    const id = Number(idKey)
    const talent = TALENTS.find((entry) => entry.id === id && entry.class === playerClass)
    if (!talent || rank <= 0) {
      continue
    }
    talentRanks[id] = Math.min(talent.maxRank, Math.floor(rank))
  }
  let combatPotion = Number(src.combatPotion) || 0
  if (combatPotion) {
    const item = POTIONS.find((entry) => entry.id === combatPotion)
    if (!item || !potionUsableByClass(item, playerClass)) {
      combatPotion = defaultCombatPotionId(playerClass)
    }
  }
  const stance =
    src.stance === WarriorStance.BATTLE ||
    src.stance === WarriorStance.BERSERKER ||
    src.stance === WarriorStance.DEFENSIVE
      ? src.stance
      : WarriorStance.BERSERKER
  return {
    race,
    stance,
    gearIds,
    enchantIds,
    talentRanks,
    raidBuffs,
    mhWeaponTemp,
    ohWeaponTemp: ohTemp,
    combatPotion,
    abilityPriorities: {
      ...defaultPriorities(playerClass, race, gearIds, combatPotion),
      ...stringNumberMap(src.abilityPriorities),
    },
    customEP: { ...defaultWeightsFor(playerClass), ...stringNumberMap(src.customEP) },
  }
}

export function emptySavedRoot(): SavedRoot {
  const playerClass = Class.WARRIOR
  return {
    v: VERSION,
    playerClass,
    duration: 180,
    iterations: 1000,
    rngSeed: 0,
    tab: 'gear',
    byClass: {
      [playerClass]: defaultClassSetup(playerClass, Race.ORC),
    },
  }
}

export function loadSavedRoot(): SavedRoot {
  const fallback = emptySavedRoot()
  try {
    if (typeof localStorage === 'undefined') {
      return fallback
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return fallback
    }
    const parsed = JSON.parse(raw) as Partial<SavedRoot>
    const playerClass = isClass(parsed.playerClass) ? parsed.playerClass : Class.WARRIOR
    const byClass: Record<number, ClassSetup> = {}
    if (parsed.byClass && typeof parsed.byClass === 'object') {
      for (const [key, setup] of Object.entries(parsed.byClass)) {
        const cls = Number(key)
        if (isClass(cls)) {
          byClass[cls] = sanitizeClassSetup(setup, cls, Race.ORC)
        }
      }
    }
    if (!byClass[playerClass]) {
      byClass[playerClass] = defaultClassSetup(playerClass, Race.ORC)
    }
    const tab = TABS.includes(parsed.tab as SettingsTab) ? (parsed.tab as SettingsTab) : 'gear'
    return {
      v: VERSION,
      playerClass,
      duration: clamp(Number(parsed.duration), 10, 600, 180),
      iterations: clamp(Math.floor(Number(parsed.iterations)), 1, 20000, 1000),
      rngSeed: clamp(Math.floor(Number(parsed.rngSeed)), 0, Number.MAX_SAFE_INTEGER, 0),
      tab,
      byClass,
    }
  } catch {
    return fallback
  }
}

export function writeSavedRoot(root: SavedRoot) {
  try {
    if (typeof localStorage === 'undefined') {
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...root, v: VERSION }))
  } catch {
    // Private mode or quota — keep the session usable.
  }
}
