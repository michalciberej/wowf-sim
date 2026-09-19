import { Class, ItemSlot, Race, WarriorStance, type SimResult } from './gen/wowfsim/sim_pb.ts'
import { ITEMS, TALENTS, canEquipItem } from './catalog/era.ts'
import { enchantById, enchantFitsSlot } from './catalog/enchants.ts'
import { BUFFS, defaultRaidBuffs, isMhOnlyWeaponTemp, isWeaponTemp, WEAPON_TEMPS } from './catalog/buffs.ts'
import { defaultPriorities, defaultExecutePriorities } from './catalog/abilities.ts'
import { defaultCombatPotionId, POTIONS, potionUsableByClass } from './catalog/potions.ts'
import { defaultWeightsFor } from './catalog/weights.ts'
import type { TalentRanks } from './sim/engine.ts'

export const STORAGE_KEY = 'wowf-sim.setup.v1'
const VERSION = 2

export type EncounterFoe = {
  name: string
  armor: number
}

export const DEFAULT_BOSS_ARMOR = 7700
export const MAX_ENCOUNTER_TARGETS = 8

export const DEFAULT_ENCOUNTER_TARGETS: EncounterFoe[] = [{ name: 'Boss', armor: DEFAULT_BOSS_ARMOR }]

export type SavedGearSet = {
  id: string
  name: string
  gearIds: Record<number, number>
  enchantIds: Record<number, number>
}

export type DpsBaseline = {
  dpsMean: number
  dpsStdev: number
  actions: Record<string, number>
}

export type ClassSetup = {
  race: Race
  stance: WarriorStance
  gearIds: Record<number, number>
  enchantIds: Record<number, number>
  gearSets: SavedGearSet[]
  activeGearSetId: string
  talentRanks: TalentRanks
  raidBuffs: Record<string, boolean>
  mhWeaponTemp: string
  ohWeaponTemp: string
  abilityPriorities: Record<string, number>
  executePriorities: Record<string, number>
  combatPotion: number
  customEP: Record<string, number>
  dpsBaseline: DpsBaseline | null
}

export type SavedRoot = {
  v: number
  playerClass: Class
  duration: number
  iterations: number
  rngSeed: number
  tab: SettingsTab
  encounterTargets: EncounterFoe[]
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

export function cloneSlotMap(ids: Record<number, number>): Record<number, number> {
  return { ...ids }
}

export function newGearSetId() {
  return `gs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function nextGearSetName(sets: SavedGearSet[]) {
  const used = new Set(sets.map((set) => set.name))
  let n = 1
  while (used.has(`Gear set ${n}`)) {
    n += 1
  }
  return `Gear set ${n}`
}

function slotMapsEqual(a: Record<number, number>, b: Record<number, number>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if ((a[Number(key)] ?? 0) !== (b[Number(key)] ?? 0)) {
      return false
    }
  }
  return true
}

export function gearSnapshotEquals(
  a: { gearIds: Record<number, number>; enchantIds: Record<number, number> },
  b: { gearIds: Record<number, number>; enchantIds: Record<number, number> },
) {
  return slotMapsEqual(a.gearIds, b.gearIds) && slotMapsEqual(a.enchantIds, b.enchantIds)
}

export function snapshotGearSet(
  name: string,
  gearIds: Record<number, number>,
  enchantIds: Record<number, number>,
  id = newGearSetId(),
): SavedGearSet {
  return {
    id,
    name: name.trim().slice(0, 40) || 'Gear set',
    gearIds: cloneSlotMap(gearIds),
    enchantIds: cloneSlotMap(enchantIds),
  }
}

function sanitizeEncounterTargets(raw: unknown): EncounterFoe[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_ENCOUNTER_TARGETS.map((row) => ({ ...row }))
  }
  const out: EncounterFoe[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue
    }
    const src = row as Record<string, unknown>
    const name = String(src.name ?? '').trim().slice(0, 32) || `Target ${out.length + 1}`
    out.push({
      name,
      armor: clamp(Number(src.armor), 0, 20000, DEFAULT_BOSS_ARMOR),
    })
    if (out.length >= MAX_ENCOUNTER_TARGETS) {
      break
    }
  }
  if (!out.length) {
    return DEFAULT_ENCOUNTER_TARGETS.map((row) => ({ ...row }))
  }
  return out
}

function sanitizeGearSets(raw: unknown, playerClass: Class): SavedGearSet[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: SavedGearSet[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue
    }
    const src = row as Record<string, unknown>
    const id = String(src.id ?? '').trim()
    const name = String(src.name ?? '').trim().slice(0, 40)
    if (!id || !name || seen.has(id)) {
      continue
    }
    seen.add(id)
    const gearIds = sanitizeGear(numberMap(src.gearIds), playerClass)
    out.push({
      id,
      name,
      gearIds,
      enchantIds: sanitizeEnchants(numberMap(src.enchantIds), gearIds),
    })
  }
  return out
}

export function baselineFromResult(result: SimResult): DpsBaseline {
  const actions: Record<string, number> = {}
  for (const action of result.actions) {
    if (action.name) {
      actions[action.name] = action.dps
    }
  }
  return {
    dpsMean: result.dpsMean,
    dpsStdev: result.dpsStdev,
    actions,
  }
}

function sanitizeDpsBaseline(raw: unknown): DpsBaseline | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const src = raw as Record<string, unknown>
  const dpsMean = Number(src.dpsMean)
  if (!Number.isFinite(dpsMean) || dpsMean < 0) {
    return null
  }
  return {
    dpsMean,
    dpsStdev: Number.isFinite(Number(src.dpsStdev)) ? Math.max(0, Number(src.dpsStdev)) : 0,
    actions: stringNumberMap(src.actions),
  }
}

export function sanitizeGear(gearIds: Record<number, number>, playerClass: Class): Record<number, number> {
  if (ITEMS.length === 0) {
    return { ...gearIds }
  }
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
    gearSets: [],
    activeGearSetId: '',
    talentRanks: {},
    raidBuffs: defaultRaidBuffs(),
    mhWeaponTemp: '',
    ohWeaponTemp: '',
    combatPotion,
    abilityPriorities: defaultPriorities(playerClass, safeRace, gearIds, combatPotion),
    executePriorities: defaultExecutePriorities(playerClass, safeRace, gearIds, combatPotion),
    customEP: defaultWeightsFor(playerClass),
    dpsBaseline: null,
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
    if (TALENTS.length === 0) {
      if (rank > 0) {
        talentRanks[id] = Math.floor(rank)
      }
      continue
    }
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
  const gearSets = sanitizeGearSets(src.gearSets, playerClass)
  const activeGearSetId = gearSets.some((set) => set.id === src.activeGearSetId)
    ? String(src.activeGearSetId)
    : ''
  return {
    race,
    stance,
    gearIds,
    enchantIds,
    gearSets,
    activeGearSetId,
    talentRanks,
    raidBuffs,
    mhWeaponTemp,
    ohWeaponTemp: ohTemp,
    combatPotion,
    abilityPriorities: {
      ...defaultPriorities(playerClass, race, gearIds, combatPotion),
      ...stringNumberMap(src.abilityPriorities),
    },
    executePriorities: {
      ...defaultExecutePriorities(playerClass, race, gearIds, combatPotion),
      ...stringNumberMap(src.executePriorities),
    },
    customEP: { ...defaultWeightsFor(playerClass), ...stringNumberMap(src.customEP) },
    dpsBaseline: sanitizeDpsBaseline(src.dpsBaseline),
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
    encounterTargets: DEFAULT_ENCOUNTER_TARGETS.map((row) => ({ ...row })),
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
    const storedVersion = Number(parsed.v) || 0
    if (storedVersion < 2 && Object.keys(byClass[playerClass].gearIds).length === 0) {
      byClass[playerClass] = {
        ...byClass[playerClass],
        gearIds: sanitizeGear(DEFAULT_GEAR, playerClass),
      }
    }
    const rawTab = parsed.tab === 'execute' ? 'rotation' : parsed.tab
    const tab = TABS.includes(rawTab as SettingsTab) ? (rawTab as SettingsTab) : 'gear'
    return {
      v: VERSION,
      playerClass,
      duration: clamp(Number(parsed.duration), 10, 600, 180),
      iterations: clamp(Math.floor(Number(parsed.iterations)), 1, 20000, 1000),
      rngSeed: clamp(Math.floor(Number(parsed.rngSeed)), 0, Number.MAX_SAFE_INTEGER, 0),
      tab,
      encounterTargets: sanitizeEncounterTargets(parsed.encounterTargets),
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
