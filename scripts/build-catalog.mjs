import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expand } from './wowhead/parse.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const endpoints = JSON.parse(readFileSync(join(root, 'scripts', 'wowhead', 'endpoints.json'), 'utf8'))
const treesDir = join(root, 'engine', 'internal', 'clientdata', 'talent-trees')
const outFile = join(root, 'engine', 'internal', 'clientdata', 'catalog.json')
const webOut = join(root, 'web', 'src', 'catalog', 'catalog.json')
const cacheFile = join(treesDir, 'icon-cache.json')

const CLASS_FILES = [
  ['warrior', 1],
  ['paladin', 2],
  ['hunter', 3],
  ['rogue', 4],
  ['priest', 5],
  ['shaman', 6],
  ['mage', 7],
  ['warlock', 8],
  ['druid', 9],
]

function titleCase(fieldName) {
  return fieldName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

function talentEffect(fieldName, tree) {
  const n = fieldName.toLowerCase()
  const empty = {
    damage: 0,
    crit: 0,
    haste: 0,
    heroic: 0,
    extraAction: 0,
    extraActionName: '',
    utility: false,
  }

  if (
    /heal|renew|rejuvenat|regrowth|tranquility|prayer|holylight|flashoflight|spiritofredemption|inspiration|meditation|improvedresurrection|ancestralhealing|purification|natureswiftness|laststand|improvedtaunt|improveddisarm|icebarrier|frostward|fireward|divineintervention|repentance|preparation|improvedhealthstone|soulstone|feldomination|blessingofsalvation|blessingofprotection|blessingofsanctuary|redoubt|reckoning|blessingofkings|improvedlayonhands|unyieldingfaith|illumination/.test(
      n,
    )
  ) {
    return { ...empty, utility: true }
  }
  if (/cruelty|malice|lethalshots|conviction|sharpenedclaws|criticalmass|holyspecialization|shadowweaving|incinerate|improvedscorch/.test(n)) {
    return { ...empty, crit: 0.01 }
  }
  if (/impale|iceshards|lethality|mortalshots/.test(n)) {
    return { ...empty, damage: 0.02 }
  }
  if (/flurry|lightningreflexes|improvedberserker|naturesguidance|improvedinnerfire/.test(n)) {
    return { ...empty, haste: 0.01 }
  }
  if (/improvedheroicstrike/.test(n)) {
    return { ...empty, heroic: 0.03 }
  }
  if (
    /mortalstrike|bloodthirst|shieldslam|stormstrike|conflagrate|pyroblast|shadowburn|adrenalinerush|coldblood|bestialwrath|elementalmastery|shadowform|moonkinform|arcanepower|combustion/.test(
      n,
    )
  ) {
    return {
      ...empty,
      extraAction: 0.12,
      extraActionName: titleCase(fieldName),
      damage: /mortalstrike|bloodthirst|stormstrike|conflagrate/.test(n) ? 0.04 : 0,
    }
  }
  if (
    /twohandedweaponspecialization|dualwieldspecialization|onehandedweaponspecialization|polearmspecialization|axespecialization|swordspecialization|macespecialization|fistweaponspecialization|daggerspecialization|shadowmastery|concussion|predatorystrikes|savagefury|vampiricembrace|ruin|bane|improvedshadowbolt|emberstorm|improvefireball|improvedfrostbolt|improvedarcane|vengeance|sealspecialization|improvedblessingofmight|unleashedrage|weaponmastery|savagery|divinestrength|heartofthewild|improvedstrengthofearth|graceofair|unleashedfury|ferocity|spiritbond/.test(
      n,
    )
  ) {
    return { ...empty, damage: 0.02 }
  }
  if (/improvedbattleshout|improveddemoralizing|improvedsunder/.test(n)) {
    return { ...empty, damage: 0.01 }
  }
  void tree
  return { ...empty, damage: 0.008 }
}

async function wowhead(kind, id, cache) {
  const key = `${kind}:${id}`
  if (cache[key]) {
    return cache[key]
  }
  const template = kind === 'item' ? endpoints.tooltipItem : endpoints.tooltipSpell
  const url = expand(template, { ...endpoints, id })
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': endpoints.userAgent || 'wowf-sim-catalog/0.1' },
    })
    if (!res.ok) {
      cache[key] = { icon: 'inv_misc_questionmark' }
      return cache[key]
    }
    const data = await res.json()
    cache[key] = {
      icon: data.icon || 'inv_misc_questionmark',
      name: data.name,
      quality: data.quality,
    }
  } catch {
    cache[key] = { icon: 'inv_misc_questionmark' }
  }
  await new Promise((r) => setTimeout(r, 40))
  return cache[key]
}

function writeCatalog(catalog) {
  const payload = JSON.stringify(catalog, null, 2) + '\n'
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, payload)
  mkdirSync(dirname(webOut), { recursive: true })
  writeFileSync(webOut, payload)
}

const existing = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : { items: [], talents: [] }
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {}
const talents = []

for (const [file, classId] of CLASS_FILES) {
  const trees = JSON.parse(readFileSync(join(treesDir, `${file}.json`), 'utf8'))
  for (const tree of trees) {
    for (const talent of tree.talents) {
      const spellId = talent.spellIds[0]
      const tip =
        talent.icon && talent.icon !== 'inv_misc_questionmark'
          ? { icon: talent.icon, name: talent.name }
          : await wowhead('spell', spellId, cache)
      const icon =
        tip.icon && tip.icon !== 'inv_misc_questionmark' ? tip.icon : talent.icon || 'inv_misc_questionmark'
      talents.push({
        id: spellId,
        class: classId,
        tree: tree.name,
        name: tip.name || talent.name || titleCase(talent.fieldName),
        icon,
        maxRank: talent.maxPoints,
        row: talent.location.rowIdx + 1,
        col: talent.location.colIdx + 1,
        prereqRow: talent.prereqLocation ? talent.prereqLocation.rowIdx + 1 : 0,
        prereqCol: talent.prereqLocation ? talent.prereqLocation.colIdx + 1 : 0,
        backgroundUrl: tree.backgroundUrl,
        effect: talentEffect(talent.fieldName, tree.name),
      })
    }
  }
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
  console.log('talents', file, talents.filter((t) => t.class === classId).length)
}

writeCatalog({ items: existing.items || [], talents })
writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
console.log('wrote', outFile, 'and', webOut, 'talents', talents.length, 'items', (existing.items || []).length)
