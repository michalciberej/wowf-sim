import raw from './sets.json' with { type: 'json' }

export type SetBonus = {
  count: number
  text: string
  strength?: number
  agility?: number
  stamina?: number
  intellect?: number
  spirit?: number
  attackPower?: number
  rangedAttackPower?: number
  spellPower?: number
  hitChance?: number
  spellHitChance?: number
  critChance?: number
  spellCritChance?: number
  haste?: number
  armor?: number
  defense?: number
  dodgeChance?: number
  parryChance?: number
  mp5?: number
}

export type ItemSet = {
  id: string
  name: string
  total?: number
  pieces: number[]
  aliases?: number[]
  pieceNames?: string[]
  bonuses: SetBonus[]
}

function itemNameKey(name: string) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const ITEM_SETS: ItemSet[] = raw as ItemSet[]

export function equippedSetCount(set: ItemSet, equipped: Iterable<{ id: number; name?: string } | number>): number {
  const inSet = new Set([...(set.pieces ?? []), ...(set.aliases ?? [])])
  const names = new Set((set.pieceNames ?? []).map(itemNameKey).filter(Boolean))
  const seenName = new Set<string>()
  const seenId = new Set<number>()
  let n = 0
  for (const entry of equipped) {
    const id = typeof entry === 'number' ? entry : entry.id
    const name = typeof entry === 'number' ? '' : itemNameKey(entry.name ?? '')
    if (!id || seenId.has(id)) {
      continue
    }
    seenId.add(id)
    if (name && names.has(name) && !seenName.has(name)) {
      seenName.add(name)
      n += 1
      continue
    }
    if (inSet.has(id)) {
      n += 1
    }
  }
  return n
}

export function activeSetBonuses(equipped: Iterable<{ id: number; name?: string } | number>): SetBonus[] {
  const out: SetBonus[] = []
  for (const set of ITEM_SETS) {
    const worn = equippedSetCount(set, equipped)
    if (!worn) {
      continue
    }
    for (const bonus of set.bonuses) {
      if (worn >= bonus.count) {
        out.push(bonus)
      }
    }
  }
  return out
}

export function setForItem(itemId: number): ItemSet | undefined {
  return ITEM_SETS.find((set) => set.pieces.includes(itemId) || set.aliases?.includes(itemId))
}
