import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { itemSetsFromItems } from './wowhead/parse.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(readFileSync(join(root, 'engine', 'internal', 'clientdata', 'catalog.json'), 'utf8'))
const extra = JSON.parse(readFileSync(join(root, 'engine', 'internal', 'clientdata', 'extra-items.json'), 'utf8'))
const sets = itemSetsFromItems([...(catalog.items || []), ...extra])
const payload = JSON.stringify(sets, null, 2) + '\n'
const engineOut = join(root, 'engine', 'internal', 'clientdata', 'sets.json')
const webOut = join(root, 'web', 'src', 'catalog', 'sets.json')
mkdirSync(dirname(webOut), { recursive: true })
writeFileSync(engineOut, payload)
writeFileSync(webOut, payload)
console.log(`wrote ${sets.length} item sets`)
