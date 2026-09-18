import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyInventoryType,
  applySpellToAbility,
  catalogItemFromParsed,
  catalogRacialFromParsed,
  racialRotationAbility,
  catalogEnchantFromParsed,
  extractGearPlannerItems,
  extractListviewItems,
  extractSpellRanks,
  extractTalentCalcDump,
  itemSetsFromItems,
  keepEnchantment,
  parseEnchantment,
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
  gearPlannerDumpUrls,
  gearPlannerItemKey,
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
const webAbilities = join(root, 'web', 'src', 'catalog', 'abilities.json')
const seedsFile = join(root, 'scripts', 'wowhead', 'spell-seeds.json')
const potionsFile = join(root, 'engine', 'internal', 'clientdata', 'potions.json')
const webPotions = join(root, 'web', 'src', 'catalog', 'potions.json')
const enchantsFile = join(root, 'engine', 'internal', 'clientdata', 'enchants.json')
const webEnchants = join(root, 'web', 'src', 'catalog', 'enchants.json')
const racialsFile = join(root, 'engine', 'internal', 'clientdata', 'racials.json')
const webRacials = join(root, 'web', 'src', 'catalog', 'racials.json')
const treesDir = join(root, 'engine', 'internal', 'clientdata', 'talent-trees')
const setsFile = join(root, 'engine', 'internal', 'clientdata', 'sets.json')
const webSets = join(root, 'web', 'src', 'catalog', 'sets.json')

function args() {
  const out = {
    force: false,
    skipItems: false,
    skipSpells: false,
    skipTalents: false,
    skipPotions: false,
    skipEnchants: false,
    skipRacials: false,
    limit: 0,
  }
  for (const a of process.argv.slice(2)) {
    if (a === '--force') {
      out.force = true
    } else if (a === '--skip-items') {
      out.skipItems = true
    } else if (a === '--skip-spells') {
      out.skipSpells = true
    } else if (a === '--skip-talents') {
      out.skipTalents = true
    } else if (a === '--skip-potions') {
      out.skipPotions = true
    } else if (a === '--skip-enchants') {
      out.skipEnchants = true
    } else if (a === '--skip-racials') {
      out.skipRacials = true
    } else if (a.startsWith('--limit=')) {
      out.limit = Number(a.slice(8))
    }
  }
  return out
}

function writePotions(potions) {
  const payload = JSON.stringify(potions, null, 2) + '\n'
  writeFileSync(potionsFile, payload)
  mkdirSync(dirname(webPotions), { recursive: true })
  writeFileSync(webPotions, payload)
}

function keepPotion(parsed) {
  const name = parsed.name || ''
  if (!name || /\[PH\]|\[DEP\]/i.test(name)) {
    return false
  }
  if (/^Perishable |Potion of Experience|Potion of Tradeskill/i.test(name)) {
    return false
  }
  return true
}

async function collectListRows(endpoints, flags, listPaths) {
  const byId = {}
  for (const listPath of listPaths || []) {
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

function writeAbilities(abilities) {
  const payload = JSON.stringify(abilities, null, 2) + '\n'
  writeFileSync(abilitiesFile, payload)
  mkdirSync(dirname(webAbilities), { recursive: true })
  writeFileSync(webAbilities, payload)
}

function writeRacials(racials) {
  const payload = JSON.stringify(racials, null, 2) + '\n'
  writeFileSync(racialsFile, payload)
  mkdirSync(dirname(webRacials), { recursive: true })
  writeFileSync(webRacials, payload)
}

function writeEnchants(enchants) {
  const payload = JSON.stringify(enchants, null, 2) + '\n'
  writeFileSync(enchantsFile, payload)
  mkdirSync(dirname(webEnchants), { recursive: true })
  writeFileSync(webEnchants, payload)
}

async function ingestEnchants(endpoints, flags) {
  const lists = endpoints.enchantLists || {}
  const enchants = []
  const seen = new Set()
  for (const [kind, listPath] of Object.entries(lists)) {
    const rows = await collectListRows(endpoints, flags, [listPath])
    const ordered = Object.keys(rows)
      .map(Number)
      .sort((a, b) => a - b)
    console.log('enchant list', kind, ordered.length)
    let fetched = 0
    for (const id of ordered) {
      if (flags.limit && fetched >= flags.limit) {
        break
      }
      if (seen.has(id)) {
        continue
      }
      try {
        const tip = await cachedJson('item', id, itemTooltipUrl(endpoints, id), endpoints, flags.force)
        const parsed = parseEnchantment({ ...tip, id }, kind)
        if (!keepEnchantment(parsed)) {
          continue
        }
        seen.add(id)
        enchants.push(catalogEnchantFromParsed(parsed))
        fetched++
      } catch (err) {
        console.warn('enchant', id, err.message)
      }
    }
  }
  enchants.sort((a, b) => (a.kind || '').localeCompare(b.kind || '') || (a.slots?.[0] || 0) - (b.slots?.[0] || 0) || a.id - b.id)
  return enchants
}

async function ingestPotions(endpoints, flags) {
  const listRows = await collectListRows(endpoints, flags, endpoints.consumableLists)
  const ordered = Object.keys(listRows)
    .map(Number)
    .sort((a, b) => a - b)
  console.log('potion tooltip fetches', ordered.length)
  const potions = []
  let fetched = 0
  for (const id of ordered) {
    if (flags.limit && fetched >= flags.limit) {
      break
    }
    try {
      const tip = await cachedJson('item', id, itemTooltipUrl(endpoints, id), endpoints, flags.force)
      const parsed = parseItemTooltip({ ...tip, id })
      if (!keepPotion(parsed)) {
        continue
      }
      const item = catalogItemFromParsed(parsed)
      if (item.effects) {
        item.effects = item.effects.map((effect) => {
          if (effect.kind === 'use' && !effect.cooldown) {
            return { ...effect, cooldown: 120 }
          }
          return effect
        })
      }
      potions.push(item)
      fetched++
    } catch (err) {
      console.warn('potion', id, err.message)
    }
  }
  potions.sort((a, b) => a.id - b.id)
  return potions
}

function writeCatalog(catalog) {
  const payload = JSON.stringify(catalog, null, 2) + '\n'
  writeFileSync(catalogFile, payload)
  mkdirSync(dirname(webCatalog), { recursive: true })
  writeFileSync(webCatalog, payload)
  writeSets(itemSetsFromItems(catalog.items || []))
}

function writeSets(sets) {
  const payload = JSON.stringify(sets, null, 2) + '\n'
  writeFileSync(setsFile, payload)
  mkdirSync(dirname(webSets), { recursive: true })
  writeFileSync(webSets, payload)
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
      const tip = await cachedJson('spell', max.id, spellTooltipUrl(endpoints, max.id), endpoints, flags.force)
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

async function ingestRacials(endpoints, abilities, flags) {
  const listPath = endpoints.racialTraitList || 'spells/racial-traits'
  const html = await cachedText(
    cacheRel(endpoints, join('lists', 'spells-racial-traits.html')),
    itemListUrl(endpoints, listPath),
    endpoints,
    flags.force,
  )
  const rows = extractListviewItems(html)
  console.log('racial traits', rows.length)
  const racials = []
  const bySpell = new Map(abilities.map((ability, index) => [Number(ability.spellId) || 0, index]))
  let fetched = 0
  let updated = 0
  for (const row of rows) {
    const id = Number(row.id)
    if (!id) {
      continue
    }
    if (flags.limit && fetched >= flags.limit) {
      break
    }
    try {
      const tip = await cachedJson('spell', id, spellTooltipUrl(endpoints, id), endpoints, flags.force)
      const parsed = parseSpellTooltip({ ...tip, id })
      racials.push(catalogRacialFromParsed(parsed, row))
      fetched++
      const index = bySpell.get(id)
      if (index != null) {
        abilities[index] = applySpellToAbility(abilities[index], parsed)
        updated++
      } else {
        const ability = racialRotationAbility(parsed, row)
        if (ability) {
          bySpell.set(id, abilities.length)
          abilities.push(ability)
          updated++
        }
      }
    } catch (err) {
      console.warn('racial', id, err.message)
    }
  }
  racials.sort((a, b) => (a.race || 0) - (b.race || 0) || a.id - b.id)
  return { racials, updated }
}

function passesItemFilter(parsed, filter) {
  if (!parsed.slot || parsed.junk) {
    return false
  }
  if ((parsed.quality || 0) < (filter.minQuality ?? 0)) {
    return false
  }
  if (filter.minItemLevel != null && (parsed.itemLevel || 0) < filter.minItemLevel) {
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

async function loadGearPlannerItems(endpoints, flags) {
  const rel = cacheRel(endpoints, 'gear-planner.txt')
  const dest = join(cacheDir(), rel)
  const key = gearPlannerItemKey(endpoints)
  const urls = await gearPlannerDumpUrls(endpoints, { ...flags, force: true })
  for (const url of urls) {
    try {
      const raw = await cachedText(rel, url, endpoints, true)
      const items = extractGearPlannerItems(raw, key)
      if (Object.keys(items).length) {
        console.log('gear planner items', Object.keys(items).length, 'from', url)
        return items
      }
      console.warn('gear planner empty', url)
    } catch (err) {
      console.warn('gear planner', url, err.message)
    }
  }
  if (existsSync(dest)) {
    const cached = extractGearPlannerItems(readFileSync(dest, 'utf8'), key)
    if (Object.keys(cached).length) {
      console.warn('gear planner using cache', Object.keys(cached).length)
      return cached
    }
  }
  return {}
}

async function ingestItems(endpoints, catalog, flags) {
  const filter = endpoints.itemFilter || {}
  const keepIds = new Set(
    filter.keepCatalogIds ? catalog.items.map((item) => item.id) : [],
  )
  const planner = await loadGearPlannerItems(endpoints, flags)

  const listRows = await collectListviewRows(endpoints, flags)

  const ids = new Set()
  const plannerCount = Object.keys(planner).length
  for (const [id, row] of Object.entries(planner)) {
    const n = Number(id)
    const quality = Number(row.quality ?? 0)
    const ilvl = Number(row.itemLevel ?? row.ilvl ?? 0)
    const version = Number(row.versionNum ?? 0)
    if (quality < (filter.minQuality ?? 0)) {
      continue
    }
    if (filter.minItemLevel != null && ilvl < filter.minItemLevel) {
      continue
    }
    if (filter.maxVersionNum && version > filter.maxVersionNum) {
      continue
    }
    ids.add(n)
  }
  if (plannerCount) {
    for (const id of keepIds) {
      if (planner[id] || planner[String(id)]) {
        ids.add(id)
      }
    }
  }

  // Listviews cap at 1000 and still list Classic IDs Forever removed from tooltip.
  // When the planner dump loaded, it is the Forever ID list; listviews only fill gaps.
  if (!plannerCount) {
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
      if (filter.minItemLevel != null && ilvl < filter.minItemLevel) {
        continue
      }
      ids.add(n)
    }
  }

  const ordered = [...ids].sort((a, b) => a - b)
  console.log('item tooltip fetches', ordered.length)
  const items = []
  let fetched = 0
  let missing = 0
  for (const id of ordered) {
    if (flags.limit && fetched >= flags.limit) {
      break
    }
    try {
      const tip = await cachedJson('item', id, itemTooltipUrl(endpoints, id), endpoints, flags.force)
      const parsed = parseItemTooltip({ ...tip, id })
      const row = planner[String(id)] || planner[id] || listRows[String(id)] || listRows[id]
      if (row) {
        if (row.classMask && !parsed.classMask) {
          parsed.classMask = Number(row.classMask)
        }
        if (row.inventoryType) {
          applyInventoryType(parsed, row.inventoryType)
        }
      }
      if (!passesItemFilter(parsed, filter)) {
        continue
      }
      items.push(catalogItemFromParsed(parsed))
      fetched++
    } catch (err) {
      if (err.status === 404) {
        missing += 1
        continue
      }
      console.warn('item', id, err.message)
    }
  }
  if (missing) {
    console.warn('item tooltips not in Forever', missing)
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
    writeAbilities(abilities)
    console.log('abilities updated', n)
  }

  if (!flags.skipRacials) {
    const { racials, updated } = await ingestRacials(endpoints, abilities, flags)
    if (racials.length) {
      writeRacials(racials)
      writeAbilities(abilities)
      console.log('racials', racials.length, 'abilities patched', updated)
    } else {
      console.warn('no racial traits parsed; racials.json unchanged')
    }
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
  }

  if (!flags.skipPotions) {
    const potions = await ingestPotions(endpoints, flags)
    if (potions.length) {
      writePotions(potions)
      console.log('potions', potions.length)
    } else {
      console.warn('no potions parsed; potions.json unchanged')
    }
  }

  if (!flags.skipEnchants) {
    const enchants = await ingestEnchants(endpoints, flags)
    if (enchants.length) {
      writeEnchants(enchants)
      console.log('enchants', enchants.length)
    } else {
      console.warn('no enchants parsed; enchants.json unchanged')
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
