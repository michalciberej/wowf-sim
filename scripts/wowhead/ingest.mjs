import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyInventoryType,
  applySpellToAbility,
  catalogItemFromParsed,
  extractGearPlannerItems,
  extractListviewItems,
  extractSpellRanks,
  extractTalentCalcDump,
  parseItemTooltip,
  parseSpellTooltip,
  pickMaxRank,
  talentTreesFromDump,
} from './parse.mjs'
import {
  cacheRel,
  cachedJson,
  cachedText,
  cacheDir,
  gearPlannerItemKey,
  gearPlannerUrl,
  itemListUrl,
  itemTooltipUrl,
  loadEndpoints,
  spellPageUrl,
  spellTooltipUrl,
  talentsClassicUrl,
} from './client.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const catalogFile = join(root, 'engine', 'internal', 'clientdata', 'catalog.json')
const webCatalog = join(root, 'web', 'src', 'catalog', 'catalog.json')
const abilitiesFile = join(root, 'engine', 'internal', 'clientdata', 'abilities.json')
const seedsFile = join(root, 'scripts', 'wowhead', 'spell-seeds.json')
const treesDir = join(root, 'engine', 'internal', 'clientdata', 'talent-trees')

function args() {
  const out = { force: false, skipItems: false, skipSpells: false, skipTalents: false, limit: 0 }
  for (const a of process.argv.slice(2)) {
    if (a === '--force') {
      out.force = true
    } else if (a === '--skip-items') {
      out.skipItems = true
    } else if (a === '--skip-spells') {
      out.skipSpells = true
    } else if (a === '--skip-talents') {
      out.skipTalents = true
    } else if (a.startsWith('--limit=')) {
      out.limit = Number(a.slice(8))
    }
  }
  return out
}

function writeCatalog(catalog) {
  const payload = JSON.stringify(catalog, null, 2) + '\n'
  writeFileSync(catalogFile, payload)
  mkdirSync(dirname(webCatalog), { recursive: true })
  writeFileSync(webCatalog, payload)
}

async function ingestSpells(endpoints, abilities, flags) {
  const seeds = JSON.parse(readFileSync(seedsFile, 'utf8'))
  let updated = 0
  for (let i = 0; i < abilities.length; i++) {
    const ability = abilities[i]
    const seed = seeds[ability.id]
    if (!seed) {
      continue
    }
    let ranks = []
    try {
      const html = await cachedText(
        cacheRel(endpoints, join('spells', 'pages', `${seed}.html`)),
        spellPageUrl(endpoints, seed),
        endpoints,
        flags.force,
      )
      ranks = extractSpellRanks(html, endpoints.path, ability.name)
    } catch (err) {
      console.warn('spell page', ability.id, seed, err.message)
    }
    const max = pickMaxRank(ranks, seed)
    try {
      const tip = await cachedJson('spell', max.id, spellTooltipUrl(endpoints, max.id), endpoints)
      const parsed = parseSpellTooltip({ ...tip, id: max.id })
      if (!parsed.rank && max.rank) {
        parsed.rank = max.rank
      }
      abilities[i] = applySpellToAbility(ability, parsed)
      updated++
    } catch (err) {
      console.warn('spell tooltip', ability.id, max.id, err.message)
    }
    if (flags.limit && updated >= flags.limit) {
      break
    }
  }
  return updated
}

function passesItemFilter(parsed, filter, keepIds) {
  if (keepIds.has(parsed.id)) {
    return parsed.slot > 0
  }
  if (!parsed.slot || parsed.junk) {
    return false
  }
  if ((parsed.quality || 0) < (filter.minQuality ?? 0)) {
    return false
  }
  if ((parsed.itemLevel || 0) < (filter.minItemLevel ?? 0)) {
    return false
  }
  return true
}

async function collectListviewRows(endpoints, flags) {
  const byId = {}
  for (const listPath of endpoints.itemLists || []) {
    const slug = String(listPath).replace(/[^\w.-]+/g, '-')
    try {
      const html = await cachedText(
        cacheRel(endpoints, join('lists', `${slug}.html`)),
        itemListUrl(endpoints, listPath),
        endpoints,
        flags.force,
      )
      const rows = extractListviewItems(html)
      console.log('item list', listPath, rows.length)
      for (const row of rows) {
        const id = Number(row.id)
        if (!id) {
          continue
        }
        byId[id] = row
      }
    } catch (err) {
      console.warn('item list', listPath, err.message)
    }
  }
  return byId
}

async function ingestTalents(endpoints, flags) {
  const raw = await cachedText(
    cacheRel(endpoints, 'talents-classic.js'),
    talentsClassicUrl(endpoints),
    endpoints,
    flags.force,
  )
  const dump = extractTalentCalcDump(raw, endpoints.talentCalcDataKey)
  const trees = talentTreesFromDump(dump, endpoints.talentBackground)
  mkdirSync(treesDir, { recursive: true })
  let count = 0
  for (const [file, payload] of Object.entries(trees)) {
    writeFileSync(join(treesDir, `${file}.json`), JSON.stringify(payload, null, 2) + '\n')
    count += payload.reduce((n, tree) => n + tree.talents.length, 0)
  }
  return count
}

async function ingestItems(endpoints, catalog, flags) {
  const filter = endpoints.itemFilter || {}
  const keepIds = new Set(
    filter.keepCatalogIds ? catalog.items.map((item) => item.id) : [],
  )
  let planner = {}
  try {
    const raw = await cachedText(
      cacheRel(endpoints, 'gear-planner.txt'),
      gearPlannerUrl(endpoints),
      endpoints,
      flags.force,
    )
    planner = extractGearPlannerItems(raw, gearPlannerItemKey(endpoints))
    console.log('gear planner items', Object.keys(planner).length)
  } catch (err) {
    console.warn('gear planner', err.message)
  }

  const listRows = await collectListviewRows(endpoints, flags)

  const ids = new Set(keepIds)
  for (const [id, row] of Object.entries(planner)) {
    const n = Number(id)
    const quality = Number(row.quality ?? 0)
    const ilvl = Number(row.itemLevel ?? row.ilvl ?? 0)
    const version = Number(row.versionNum ?? 0)
    if (keepIds.has(n)) {
      ids.add(n)
      continue
    }
    if (quality < (filter.minQuality ?? 0)) {
      continue
    }
    if (ilvl < (filter.minItemLevel ?? 0)) {
      continue
    }
    if (filter.maxVersionNum && version > filter.maxVersionNum) {
      continue
    }
    ids.add(n)
  }

  for (const [id, row] of Object.entries(listRows)) {
    const n = Number(id)
    if (keepIds.has(n)) {
      ids.add(n)
      continue
    }
    const quality = Number(row.quality ?? 0)
    const ilvl = Number(row.level ?? row.itemLevel ?? row.ilvl ?? 0)
    if (quality < (filter.minQuality ?? 0)) {
      continue
    }
    if (ilvl < (filter.minItemLevel ?? 0)) {
      continue
    }
    ids.add(n)
  }

  const ordered = [...ids].sort((a, b) => a - b)
  console.log('item tooltip fetches', ordered.length)
  const items = []
  let fetched = 0
  for (const id of ordered) {
    if (flags.limit && fetched >= flags.limit) {
      break
    }
    try {
      const tip = await cachedJson('item', id, itemTooltipUrl(endpoints, id), endpoints)
      const parsed = parseItemTooltip({ ...tip, id })
      const row = planner[String(id)] || planner[id]
      if (row) {
        if (row.classMask && !parsed.classMask) {
          parsed.classMask = Number(row.classMask)
        }
        if (row.inventoryType) {
          applyInventoryType(parsed, row.inventoryType)
        }
      }
      if (!passesItemFilter(parsed, filter, keepIds)) {
        continue
      }
      items.push(catalogItemFromParsed(parsed))
      fetched++
    } catch (err) {
      console.warn('item', id, err.message)
    }
  }

  items.sort((a, b) => a.slot - b.slot || a.id - b.id)
  return items
}

async function main() {
  const flags = args()
  const endpoints = loadEndpoints()
  mkdirSync(cacheDir(), { recursive: true })
  console.log('wowhead', endpoints.name, endpoints.path)

  const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'))
  const abilities = JSON.parse(readFileSync(abilitiesFile, 'utf8'))

  if (!flags.skipSpells) {
    const n = await ingestSpells(endpoints, abilities, flags)
    writeFileSync(abilitiesFile, JSON.stringify(abilities, null, 2) + '\n')
    console.log('abilities updated', n)
  }

  if (!flags.skipTalents) {
    const n = await ingestTalents(endpoints, flags)
    console.log('talent trees updated', n)
    console.log('run npm run catalog to bake talent rows into catalog.json')
  }

  if (!flags.skipItems) {
    const items = await ingestItems(endpoints, catalog, flags)
    if (items.length) {
      catalog.items = items
      writeCatalog(catalog)
      console.log('items', items.length)
    } else {
      console.warn('no items parsed; catalog unchanged')
    }
  } else {
    writeCatalog(catalog)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
