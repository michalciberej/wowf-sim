import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseItemTooltip } from './wowhead/parse.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = [
  join(root, 'engine', 'internal', 'clientdata', 'catalog.json'),
  join(root, 'web', 'src', 'catalog', 'catalog.json'),
  join(root, 'engine', 'internal', 'clientdata', 'extra-items.json'),
  join(root, 'web', 'src', 'catalog', 'extra-items.json'),
]

function patchItem(item) {
  if (!item?.tooltip) {
    return item
  }
  const parsed = parseItemTooltip(item)
  const next = { ...item, slot: parsed.slot || item.slot }
  if (parsed.hand) {
    next.hand = parsed.hand
  } else {
    delete next.hand
  }
  if (parsed.itemSubclass) {
    next.itemSubclass = parsed.itemSubclass
  } else {
    delete next.itemSubclass
  }
  if (parsed.armorType) {
    next.armorType = parsed.armorType
  }
  if (parsed.weaponDps) {
    next.weaponDps = Math.round(parsed.weaponDps * 10) / 10
  } else {
    delete next.weaponDps
  }
  if (parsed.attackSpeedMs) {
    next.attackSpeedMs = parsed.attackSpeedMs
  } else {
    delete next.attackSpeedMs
  }
  if (parsed.minDamage) {
    next.minDamage = parsed.minDamage
  } else {
    delete next.minDamage
  }
  if (parsed.maxDamage) {
    next.maxDamage = parsed.maxDamage
  } else {
    delete next.maxDamage
  }
  return next
}

for (const file of files) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  if (Array.isArray(raw)) {
    writeFileSync(file, JSON.stringify(raw.map(patchItem), null, 2) + '\n')
    continue
  }
  raw.items = (raw.items || []).map(patchItem)
  writeFileSync(file, JSON.stringify(raw, null, 2) + '\n')
}

console.log('repaired item slot/hand/type from tooltips')
