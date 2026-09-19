import { Class, ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import catalogUrl from './catalog.json?url'
import overlayEffects from './item-effects.json' with { type: 'json' }
import extraItems from './extra-items.json' with { type: 'json' }
import { equippedSetCount, setForItem } from './sets.ts'

export const TALENT_POINTS = 51
export const TALENT_ROWS = 7
export const TALENT_COLS = 4

export type ItemEffect = {
  kind: 'use' | 'proc' | string
  name?: string
  text?: string
  attackPower?: number
  spellPower?: number
  haste?: number
  crit?: number
  strength?: number
  agility?: number
  armorIgnore?: number
  duration?: number
  cooldown?: number
  chance?: number
  extraAttack?: number
  stackAP?: number
  interval?: number
  rage?: number
  icon?: string
}

export type CatalogItem = {
  id: number
  name: string
  slot: ItemSlot
  weaponDps?: number
  attackSpeedMs?: number
  strength?: number
  agility?: number
  stamina?: number
  intellect?: number
  spirit?: number
  attackPower?: number
  critChance?: number
  hitChance?: number
  spellPower?: number
  spellCritChance?: number
  spellHitChance?: number
  itemLevel?: number
  itemSubclass?: string
  armorType?: string
  hand?: '1h' | '2h' | 'oh' | 'mh' | 'ranged'
  classMask?: number
  icon?: string
  quality?: number
  armor?: number
  defense?: number
  dodgeChance?: number
  parryChance?: number
  rangedAttackPower?: number
  mp5?: number
  minDamage?: number
  maxDamage?: number
  unique?: boolean
  binds?: string
  requiredLevel?: number
  tooltip?: string
  effects?: ItemEffect[]
}

export type CatalogTalent = {
  id: number
  class: Class
  tree: string
  name: string
  icon?: string
  maxRank: number
  row: number
  col: number
  prereqRow?: number
  prereqCol?: number
  backgroundUrl?: string
  ranks?: string[]
}

export const CLASS_TREES: Record<number, [string, string, string]> = {
  [Class.WARRIOR]: ['Arms', 'Fury', 'Protection'],
  [Class.PALADIN]: ['Holy', 'Protection', 'Retribution'],
  [Class.HUNTER]: ['Beast Mastery', 'Marksmanship', 'Survival'],
  [Class.ROGUE]: ['Assassination', 'Combat', 'Subtlety'],
  [Class.PRIEST]: ['Discipline', 'Holy', 'Shadow'],
  [Class.SHAMAN]: ['Elemental', 'Enhancement', 'Restoration'],
  [Class.MAGE]: ['Arcane', 'Fire', 'Frost'],
  [Class.WARLOCK]: ['Affliction', 'Demonology', 'Destruction'],
  [Class.DRUID]: ['Balance', 'Feral Combat', 'Restoration'],
}

export const RACIALS: Array<{ race: number; label: string; effect: string }> = [
  { race: 1, label: 'Human', effect: '+1% damage with swords and maces' },
  { race: 2, label: 'Orc', effect: 'Blood Fury on pull (Axe Command if using an axe)' },
  { race: 3, label: 'Dwarf', effect: '+1% gun / mace damage' },
  { race: 4, label: 'Night Elf', effect: '+1% dodge (small DPS loss vs standing still)' },
  { race: 5, label: 'Undead', effect: '+1% damage (Touch of the Grave stub)' },
  { race: 6, label: 'Tauren', effect: '+5% health (no direct DPS)' },
  { race: 7, label: 'Gnome', effect: '+2% caster damage' },
  { race: 8, label: 'Troll', effect: 'Berserking on pull' },
  { race: 9, label: 'Skyborne', effect: '+2% damage (Forever placeholder)' },
]

export const PAPERDOLL_LEFT: Array<{ slot: ItemSlot; label: string }> = [
  { slot: ItemSlot.HEAD, label: 'Head' },
  { slot: ItemSlot.NECK, label: 'Neck' },
  { slot: ItemSlot.SHOULDER, label: 'Shoulder' },
  { slot: ItemSlot.BACK, label: 'Back' },
  { slot: ItemSlot.CHEST, label: 'Chest' },
  { slot: ItemSlot.WRIST, label: 'Wrist' },
]

export const PAPERDOLL_RIGHT: Array<{ slot: ItemSlot; label: string }> = [
  { slot: ItemSlot.HANDS, label: 'Hands' },
  { slot: ItemSlot.WAIST, label: 'Waist' },
  { slot: ItemSlot.LEGS, label: 'Legs' },
  { slot: ItemSlot.FEET, label: 'Feet' },
  { slot: ItemSlot.FINGER_1, label: 'Finger' },
  { slot: ItemSlot.FINGER_2, label: 'Finger' },
  { slot: ItemSlot.TRINKET_1, label: 'Trinket' },
  { slot: ItemSlot.TRINKET_2, label: 'Trinket' },
]

export const PAPERDOLL_WEAPONS: Array<{ slot: ItemSlot; label: string }> = [
  { slot: ItemSlot.MAIN_HAND, label: 'Main Hand' },
  { slot: ItemSlot.OFF_HAND, label: 'Off Hand' },
  { slot: ItemSlot.RANGED, label: 'Ranged' },
]

export const GEAR_SLOTS = [...PAPERDOLL_LEFT, ...PAPERDOLL_RIGHT, ...PAPERDOLL_WEAPONS]

const overlayByName = overlayEffects as Record<string, ItemEffect[]>

function withEffects(item: CatalogItem): CatalogItem {
  if (item.effects?.length) {
    return item
  }
  const extra = overlayByName[item.name]
  return extra ? { ...item, effects: extra } : item
}

export const ITEMS: CatalogItem[] = []
export const TALENTS: CatalogTalent[] = []

let catalogLoading: Promise<void> | null = null

export function loadCatalog(): Promise<void> {
  if (!catalogLoading) {
    catalogLoading = fetch(catalogUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load item catalog (${response.status})`)
        }
        return response.json() as Promise<{ items: CatalogItem[]; talents: CatalogTalent[] }>
      })
      .then((catalog) => {
        const byId = new Map<number, CatalogItem>()
        for (const item of [...catalog.items, ...(extraItems as CatalogItem[])]) {
          if (!byId.has(item.id)) {
            byId.set(item.id, withEffects(item))
          }
        }
        ITEMS.splice(0, ITEMS.length, ...byId.values())
        TALENTS.splice(0, TALENTS.length, ...catalog.talents)
      })
  }
  return catalogLoading
}

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

const ARMOR_RANK: Record<string, number> = {
  Cloth: 1,
  Leather: 2,
  Mail: 3,
  Plate: 4,
}

const ARMOR_MAX: Record<number, number> = {
  [Class.WARRIOR]: 4,
  [Class.PALADIN]: 4,
  [Class.HUNTER]: 3,
  [Class.SHAMAN]: 3,
  [Class.ROGUE]: 2,
  [Class.DRUID]: 2,
  [Class.PRIEST]: 1,
  [Class.MAGE]: 1,
  [Class.WARLOCK]: 1,
}

const WEAPONS: Record<number, string[]> = {
  [Class.WARRIOR]: ['Axe', 'Sword', 'Mace', 'Dagger', 'Fist Weapon', 'Polearm', 'Staff', 'Bow', 'Gun', 'Crossbow', 'Thrown', 'Shield'],
  [Class.PALADIN]: ['Axe', 'Sword', 'Mace', 'Polearm', 'Staff', 'Shield'],
  [Class.HUNTER]: ['Axe', 'Sword', 'Dagger', 'Fist Weapon', 'Polearm', 'Staff', 'Bow', 'Gun', 'Crossbow', 'Thrown'],
  [Class.ROGUE]: ['Dagger', 'Fist Weapon', 'Sword', 'Mace', 'Bow', 'Gun', 'Crossbow', 'Thrown'],
  [Class.PRIEST]: ['Mace', 'Staff', 'Dagger', 'Wand'],
  [Class.SHAMAN]: ['Mace', 'Staff', 'Dagger', 'Fist Weapon', 'Axe', 'Shield'],
  [Class.MAGE]: ['Staff', 'Dagger', 'Wand', 'Sword'],
  [Class.WARLOCK]: ['Staff', 'Dagger', 'Wand', 'Sword'],
  [Class.DRUID]: ['Staff', 'Dagger', 'Fist Weapon', 'Mace', 'Polearm'],
}

const DUAL_WIELD = new Set([Class.WARRIOR, Class.ROGUE, Class.HUNTER])

export function canDualWield(playerClass: Class) {
  return DUAL_WIELD.has(playerClass)
}

export function canEquipItem(item: CatalogItem, playerClass: Class, slot: ItemSlot): boolean {
  if (item.classMask && (item.classMask & (CLASS_MASK[playerClass] ?? 0)) === 0) {
    return false
  }
  if (item.armorType) {
    const rank = ARMOR_RANK[item.armorType]
    if (rank && rank > (ARMOR_MAX[playerClass] ?? 0)) {
      return false
    }
  }
  const weapon = item.itemSubclass
  const armed =
    item.hand === '1h' ||
    item.hand === '2h' ||
    item.hand === 'mh' ||
    item.hand === 'oh' ||
    item.hand === 'ranged' ||
    item.slot === ItemSlot.MAIN_HAND ||
    item.slot === ItemSlot.OFF_HAND ||
    item.slot === ItemSlot.RANGED
  if (weapon && armed) {
    const allow = WEAPONS[playerClass]
    if (allow && !allow.includes(weapon)) {
      return false
    }
  }
  if (slot === ItemSlot.MAIN_HAND) {
    if (item.itemSubclass === 'Shield' || item.hand === 'oh') {
      return false
    }
    if (item.hand === '2h' || item.hand === '1h' || item.hand === 'mh') {
      return true
    }
    return item.slot === ItemSlot.MAIN_HAND
  }
  if (slot === ItemSlot.OFF_HAND) {
    if (item.hand === '2h' || item.hand === 'mh') {
      return false
    }
    const bodySlot =
      item.slot !== ItemSlot.MAIN_HAND &&
      item.slot !== ItemSlot.OFF_HAND &&
      item.slot !== ItemSlot.RANGED &&
      item.slot !== ItemSlot.UNSPECIFIED
    if (bodySlot && !item.weaponDps) {
      return false
    }
    if (item.itemSubclass === 'Shield' || item.hand === 'oh' || item.slot === ItemSlot.OFF_HAND) {
      return true
    }
    if (item.hand === '1h') {
      return canDualWield(playerClass)
    }
    return false
  }
  if (slot === ItemSlot.RANGED) {
    return item.hand === 'ranged' || item.slot === ItemSlot.RANGED
  }
  if (slot === ItemSlot.FINGER_2) {
    return item.slot === ItemSlot.FINGER_1 || item.slot === ItemSlot.FINGER_2
  }
  if (slot === ItemSlot.TRINKET_2) {
    return item.slot === ItemSlot.TRINKET_1 || item.slot === ItemSlot.TRINKET_2
  }
  return item.slot === slot
}

export function itemsForSlot(slot: ItemSlot, playerClass?: Class): CatalogItem[] {
  return ITEMS.filter((item) => {
    if (playerClass != null) {
      return canEquipItem(item, playerClass, slot)
    }
    if (slot === ItemSlot.FINGER_2) {
      return item.slot === ItemSlot.FINGER_1 || item.slot === ItemSlot.FINGER_2
    }
    if (slot === ItemSlot.TRINKET_2) {
      return item.slot === ItemSlot.TRINKET_1 || item.slot === ItemSlot.TRINKET_2
    }
    return item.slot === slot
  })
}

export function iconUrl(icon?: string) {
  const name = icon || 'inv_misc_questionmark'
  return `https://wow.zamimg.com/images/wow/icons/large/${name}.jpg`
}

export function wowheadItemUrl(id: number) {
  return `https://www.wowhead.com/forever/item=${id}`
}

export function talentsForClass(playerClass: Class): CatalogTalent[] {
  return TALENTS.filter((talent) => talent.class === playerClass)
}

export function treesForClass(playerClass: Class): string[] {
  const fromData = [...new Set(talentsForClass(playerClass).map((talent) => talent.tree))]
  if (fromData.length > 0) {
    return fromData
  }
  return CLASS_TREES[playerClass] ?? []
}

export function treeBackground(playerClass: Class, tree: string): string | undefined {
  return talentsForClass(playerClass).find((talent) => talent.tree === tree)?.backgroundUrl
}

export const SLOT_LABELS: Record<number, string> = {
  [ItemSlot.HEAD]: 'Head',
  [ItemSlot.NECK]: 'Neck',
  [ItemSlot.SHOULDER]: 'Shoulder',
  [ItemSlot.BACK]: 'Back',
  [ItemSlot.CHEST]: 'Chest',
  [ItemSlot.WRIST]: 'Wrist',
  [ItemSlot.HANDS]: 'Hands',
  [ItemSlot.WAIST]: 'Waist',
  [ItemSlot.LEGS]: 'Legs',
  [ItemSlot.FEET]: 'Feet',
  [ItemSlot.FINGER_1]: 'Finger',
  [ItemSlot.FINGER_2]: 'Finger',
  [ItemSlot.TRINKET_1]: 'Trinket',
  [ItemSlot.TRINKET_2]: 'Trinket',
  [ItemSlot.MAIN_HAND]: 'Main Hand',
  [ItemSlot.OFF_HAND]: 'Off Hand',
  [ItemSlot.RANGED]: 'Ranged',
}

export type TooltipLine = {
  text: string
  kind: 'name' | 'slot' | 'stat' | 'weapon' | 'bind' | 'use' | 'equip' | 'set' | 'set-piece' | 'set-bonus'
  active?: boolean
}

function annotateSetTooltip(item: CatalogItem, lines: TooltipLine[], equippedIds: number[]): TooltipLine[] {
  const set = setForItem(item.id)
  if (!set) {
    return lines
  }
  const worn = equippedSetCount(
    set,
    equippedIds.map((id) => {
      const piece = ITEMS.find((entry) => entry.id === id)
      return { id, name: piece?.name }
    }),
  )
  const equippedNames = new Set(
    equippedIds.flatMap((id) => {
      const piece = ITEMS.find((entry) => entry.id === id)
      return piece ? [piece.name.toLowerCase()] : []
    }),
  )
  const pieceNames = new Set(
    (set.pieceNames ?? []).map((name) => name.toLowerCase()),
  )
  for (const id of [...set.pieces, ...(set.aliases ?? [])]) {
    const piece = ITEMS.find((entry) => entry.id === id)
    if (piece) {
      pieceNames.add(piece.name.toLowerCase())
    }
  }
  return lines.map((line) => {
    const header = line.text.match(/^(.+?)\s*\((\d+)\/(\d+)\)\s*$/)
    if (header && header[1].trim().toLowerCase() === set.name.toLowerCase()) {
      return { text: `${set.name} (${worn}/${set.total || set.pieces.length})`, kind: 'set' as const, active: worn > 0 }
    }
    const bonus = line.text.match(/^\((\d+)\)\s*Set\s*:/i)
    if (bonus) {
      return { ...line, kind: 'set-bonus' as const, active: worn >= Number(bonus[1]) }
    }
    if (pieceNames.has(line.text.toLowerCase())) {
      return { ...line, kind: 'set-piece' as const, active: equippedNames.has(line.text.toLowerCase()) }
    }
    return line
  })
}

export function itemTooltipLines(item: CatalogItem, equippedIds: number[] = []): TooltipLine[] {
  if (item.tooltip) {
    const parts = item.tooltip
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((text) => text && !/^Sell Price/i.test(text) && !/^Durability\b/i.test(text))
    const lines = parts.map((text, index) => {
      let kind: TooltipLine['kind'] = 'slot'
      if (index === 0) {
        kind = 'name'
      } else if (/^Use:/i.test(text)) {
        kind = 'use'
      } else if (/^Equip:/i.test(text)) {
        kind = 'equip'
      } else if (/^[+-]?\d/.test(text) || /Armor|Damage|Speed|DPS/.test(text)) {
        kind = text.includes('Damage') || text.includes('Speed') || text.includes('DPS') ? 'weapon' : 'stat'
      } else if (/Binds|Unique|Requires/.test(text)) {
        kind = 'bind'
      }
      return { text, kind }
    })
    return annotateSetTooltip(item, lines, equippedIds)
  }
  const lines: TooltipLine[] = [{ text: item.name, kind: 'name' }]
  if (item.itemLevel) {
    lines.push({ text: `Item Level ${item.itemLevel}`, kind: 'slot' })
  }
  if (item.binds) {
    lines.push({ text: item.binds, kind: 'bind' })
  }
  if (item.unique) {
    lines.push({ text: 'Unique', kind: 'bind' })
  }
  const slot = SLOT_LABELS[item.slot] ?? 'Item'
  const typeBits = [
    item.hand === '2h' ? 'Two-Hand' : item.hand === '1h' ? 'One-Hand' : item.hand === 'mh' ? 'Main Hand' : '',
    item.armorType,
    item.itemSubclass,
  ].filter(Boolean)
  lines.push({ text: typeBits.length ? `${slot}    ${typeBits.join(' ')}` : slot, kind: 'slot' })
  if (item.minDamage && item.maxDamage && item.attackSpeedMs) {
    const speed = (item.attackSpeedMs / 1000).toFixed(2)
    lines.push({ text: `${item.minDamage} - ${item.maxDamage} Damage    Speed ${speed}`, kind: 'weapon' })
  }
  if (item.weaponDps) {
    lines.push({ text: `(${item.weaponDps.toFixed(1)} damage per second)`, kind: 'weapon' })
  }
  if (item.armor) {
    lines.push({ text: `${item.armor} Armor`, kind: 'stat' })
  }
  if (item.strength) {
    lines.push({ text: `+${item.strength} Strength`, kind: 'stat' })
  }
  if (item.agility) {
    lines.push({ text: `+${item.agility} Agility`, kind: 'stat' })
  }
  if (item.stamina) {
    lines.push({ text: `+${item.stamina} Stamina`, kind: 'stat' })
  }
  if (item.intellect) {
    lines.push({ text: `+${item.intellect} Intellect`, kind: 'stat' })
  }
  if (item.spirit) {
    lines.push({ text: `+${item.spirit} Spirit`, kind: 'stat' })
  }
  if (item.attackPower) {
    lines.push({ text: `Equip: +${item.attackPower} Attack Power.`, kind: 'equip' })
  }
  if (item.rangedAttackPower) {
    lines.push({ text: `Equip: +${item.rangedAttackPower} ranged Attack Power.`, kind: 'equip' })
  }
  if (item.spellPower) {
    const useSP = (item.effects ?? (overlayEffects as Record<string, ItemEffect[]>)[item.name] ?? []).some(
      (effect) => effect.kind === 'use' && effect.spellPower === item.spellPower,
    )
    if (!useSP) {
      lines.push({ text: `Equip: Increases damage and healing done by magical spells and effects by up to ${item.spellPower}.`, kind: 'equip' })
    }
  }
  if (item.hitChance) {
    lines.push({
      text: `Equip: Improves your chance to hit by ${(item.hitChance * 100).toFixed(0)}%.`,
      kind: 'equip',
    })
  }
  if (item.critChance) {
    lines.push({
      text: `Equip: Improves your chance to get a critical strike by ${(item.critChance * 100).toFixed(0)}%.`,
      kind: 'equip',
    })
  }
  if (item.spellHitChance) {
    lines.push({
      text: `Equip: Improves your chance to hit with spells by ${(item.spellHitChance * 100).toFixed(0)}%.`,
      kind: 'equip',
    })
  }
  if (item.spellCritChance) {
    lines.push({
      text: `Equip: Improves your chance to get a critical strike with spells by ${(item.spellCritChance * 100).toFixed(0)}%.`,
      kind: 'equip',
    })
  }
  if (item.dodgeChance) {
    lines.push({ text: `Equip: Increases your chance to dodge by ${(item.dodgeChance * 100).toFixed(0)}%.`, kind: 'equip' })
  }
  if (item.parryChance) {
    lines.push({ text: `Equip: Increases your chance to parry by ${(item.parryChance * 100).toFixed(0)}%.`, kind: 'equip' })
  }
  if (item.defense) {
    lines.push({ text: `Equip: Increased Defense +${item.defense}.`, kind: 'equip' })
  }
  if (item.mp5) {
    lines.push({ text: `Equip: Restores ${item.mp5} mana per 5 sec.`, kind: 'equip' })
  }
  if (item.requiredLevel) {
    lines.push({ text: `Requires Level ${item.requiredLevel}`, kind: 'bind' })
  }
  const effects = item.effects?.length
    ? item.effects
    : (overlayEffects as Record<string, ItemEffect[]>)[item.name]
  if (effects) {
    for (const effect of effects) {
      if (effect.text) {
        lines.push({ text: effect.text, kind: effect.kind === 'use' ? 'use' : 'equip' })
      }
    }
  }
  const set = setForItem(item.id)
  if (set) {
    const worn = equippedSetCount(
      set,
      equippedIds.map((id) => {
        const piece = ITEMS.find((entry) => entry.id === id)
        return { id, name: piece?.name }
      }),
    )
    lines.push({ text: `${set.name} (${worn}/${set.total || set.pieces.length})`, kind: 'set', active: worn > 0 })
    for (const id of set.pieces) {
      const piece = ITEMS.find((entry) => entry.id === id)
      lines.push({
        text: piece?.name ?? `Item ${id}`,
        kind: 'set-piece',
        active: equippedIds.some((equippedId) => {
          const equipped = ITEMS.find((entry) => entry.id === equippedId)
          return equipped?.name === piece?.name || equippedId === id
        }),
      })
    }
    for (const bonus of set.bonuses) {
      lines.push({
        text: `(${bonus.count}) Set : ${bonus.text}`,
        kind: 'set-bonus',
        active: worn >= bonus.count,
      })
    }
  }
  return lines
}

export type StatEP = Record<string, number>

export function itemEP(item: CatalogItem, ep: StatEP | null | undefined): number | null {
  if (!ep) {
    return null
  }
  const score =
    (item.strength ?? 0) * (ep.strength ?? 0) +
    (item.agility ?? 0) * (ep.agility ?? 0) +
    (item.intellect ?? 0) * (ep.intellect ?? 0) +
    (item.attackPower ?? 0) * (ep['attack-power'] ?? 0) +
    (item.spellPower ?? 0) * (ep['spell-power'] ?? 0) +
    (item.critChance ?? 0) * 100 * (ep['melee-crit'] ?? 0) +
    (item.hitChance ?? 0) * 100 * (ep['melee-hit'] ?? 0) +
    (item.spellCritChance ?? 0) * 100 * (ep['spell-crit'] ?? 0) +
    (item.spellHitChance ?? 0) * 100 * (ep['spell-hit'] ?? 0) +
    (item.weaponDps ?? 0) * (ep['weapon-dps'] ?? 0)
  return score
}

export function itemPowerScore(item: CatalogItem, ep?: StatEP | null): number | null {
  return itemEP(item, ep)
}

export const QUALITY_COLORS: Record<number, string> = {
  0: '#9d9d9d',
  1: '#ffffff',
  2: '#1eff00',
  3: '#0070dd',
  4: '#a335ee',
  5: '#ff8000',
  6: '#e6cc80',
}

export function itemQualityColor(item: CatalogItem) {
  return QUALITY_COLORS[item.quality ?? 4] ?? QUALITY_COLORS[4]
}

export function pointsAboveRow(
  treeTalents: CatalogTalent[],
  ranks: Record<number, number>,
  row: number,
) {
  return treeTalents
    .filter((talent) => talent.row < row)
    .reduce((sum, talent) => sum + (ranks[talent.id] ?? 0), 0)
}

export function prereqOf(treeTalents: CatalogTalent[], talent: CatalogTalent) {
  if (!talent.prereqRow || !talent.prereqCol) {
    return undefined
  }
  return treeTalents.find(
    (entry) => entry.row === talent.prereqRow && entry.col === talent.prereqCol,
  )
}

export function isTreeStateValid(
  treeTalents: CatalogTalent[],
  ranks: Record<number, number>,
) {
  return treeTalents.every((talent) => {
    const rank = ranks[talent.id] ?? 0
    if (rank <= 0) {
      return true
    }
    if (pointsAboveRow(treeTalents, ranks, talent.row) < (talent.row - 1) * 5) {
      return false
    }
    const pre = prereqOf(treeTalents, talent)
    if (pre && (ranks[pre.id] ?? 0) < pre.maxRank) {
      return false
    }
    return true
  })
}
