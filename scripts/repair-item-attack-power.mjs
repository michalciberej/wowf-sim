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
    return { item, changed: false }
  }
  const parsed = parseItemTooltip(item)
  const want = parsed.attackPower || 0
  const have = item.attackPower || 0
  if (want === have) {
    return { item, changed: false }
  }
  const next = { ...item }
  if (want) {
    next.attackPower = want
  } else {
    delete next.attackPower
  }
  return { item: next, changed: true }
}

let total = 0
for (const file of files) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  let changed = 0
  const patchList = (list) =>
    list.map((entry) => {
      const result = patchItem(entry)
      if (result.changed) changed++
      return result.item
    })
  if (Array.isArray(raw)) {
    const items = patchList(raw)
    if (changed) writeFileSync(file, JSON.stringify(items, null, 2) + '\n')
  } else {
    raw.items = patchList(raw.items || [])
    if (changed) writeFileSync(file, JSON.stringify(raw, null, 2) + '\n')
  }
  total += changed
  console.log(`${file}: ${changed} attackPower fixes`)
}
console.log(`total ${total}`)
