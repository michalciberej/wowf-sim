export function stripHtml(html) {
  if (!html) {
    return ''
  }
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .replace(/\n+/g, '\n')
    .trim()
}

export function expand(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  })
}

export function parseLooseJson(raw) {
  let text = String(raw).trim().replace(/;\s*$/, '')
  for (let i = 0; i < 8; i++) {
    const next = text.replace(/,(\s*[}\]])/g, '$1')
    if (next === text) {
      break
    }
    text = next
  }
  return JSON.parse(text)
}

export function parseWowheadJs(raw) {
  let text = String(raw).trim().replace(/;\s*$/, '')
  text = text.replace(/([,{[]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
  return parseLooseJson(text)
}

function extractSetPageData(dbContents, matchName) {
  const parts = String(dbContents).split('WH.setPageData(')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed.startsWith('"')) {
      continue
    }
    const nameEnd = trimmed.indexOf('"', 1)
    if (nameEnd < 0) {
      continue
    }
    const dbName = trimmed.slice(1, nameEnd)
    if (matchName && !matchName(dbName)) {
      continue
    }
    const commaIdx = trimmed.indexOf(',')
    if (commaIdx < 0) {
      continue
    }
    let payload = trimmed.slice(commaIdx + 1).trim()
    payload = payload.replace(/\)\s*;?\s*$/, '')
    try {
      return { dbName, data: parseLooseJson(payload) }
    } catch {
      try {
        return { dbName, data: parseWowheadJs(payload) }
      } catch {
        continue
      }
    }
  }
  return null
}

export function extractGearPlannerItems(dbContents, itemKey) {
  const items = {}
  const parts = String(dbContents).split('WH.setPageData(')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed.startsWith('"')) {
      continue
    }
    const nameEnd = trimmed.indexOf('"', 1)
    if (nameEnd < 0) {
      continue
    }
    const dbName = trimmed.slice(1, nameEnd)
    if (itemKey && dbName !== itemKey && !dbName.endsWith('.item')) {
      continue
    }
    if (!dbName.includes('gearPlanner') || !dbName.endsWith('.item')) {
      continue
    }
    const commaIdx = trimmed.indexOf(',')
    if (commaIdx < 0) {
      continue
    }
    let payload = trimmed.slice(commaIdx + 1).trim()
    payload = payload.replace(/\)\s*;?\s*$/, '')
    const parsed = parseLooseJson(payload)
    Object.assign(items, parsed)
  }
  return items
}

export function extractListviewItems(html) {
  const marker = html.indexOf('var listviewitems')
  if (marker < 0) {
    return []
  }
  const eq = html.indexOf('=', marker)
  const start = html.indexOf('[', eq)
  if (start < 0) {
    return []
  }
  let depth = 0
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (ch === '[') {
      depth++
    } else if (ch === ']') {
      depth--
      if (depth === 0) {
        const parsed = parseWowheadJs(html.slice(start, i + 1))
        return Array.isArray(parsed) ? parsed : []
      }
    }
  }
  return []
}

export const FOREVER_TALENT_CLASSES = [
  ['warrior', 1, [
    [161, 'Arms'],
    [164, 'Fury'],
    [163, 'Protection'],
  ]],
  ['paladin', 2, [
    [382, 'Holy'],
    [383, 'Protection'],
    [381, 'Retribution'],
  ]],
  ['hunter', 3, [
    [361, 'Beast Mastery'],
    [363, 'Marksmanship'],
    [362, 'Survival'],
  ]],
  ['rogue', 4, [
    [182, 'Assassination'],
    [181, 'Combat'],
    [183, 'Subtlety'],
  ]],
  ['priest', 5, [
    [201, 'Discipline'],
    [202, 'Holy'],
    [203, 'Shadow'],
  ]],
  ['shaman', 6, [
    [261, 'Elemental'],
    [263, 'Enhancement'],
    [262, 'Restoration'],
  ]],
  ['mage', 7, [
    [81, 'Arcane'],
    [41, 'Fire'],
    [61, 'Frost'],
  ]],
  ['warlock', 8, [
    [302, 'Affliction'],
    [303, 'Demonology'],
    [301, 'Destruction'],
  ]],
  ['druid', 9, [
    [283, 'Balance'],
    [281, 'Feral Combat'],
    [282, 'Restoration'],
  ]],
]

export function talentFieldName(name) {
  const words = String(name)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return words
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (i === 0) {
        return lower
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
}

function talentMaxPoints(row) {
  const described = Object.keys(row.descriptions || {}).length
  if (described) {
    return described
  }
  const ranks = Array.isArray(row.ranks) ? row.ranks.length : 0
  return ranks || 1
}

export function extractTalentCalcDump(dbContents, pageKey) {
  const found = extractSetPageData(dbContents, (name) => {
    if (pageKey && name === pageKey) {
      return true
    }
    return name.includes('talentCalcClassic') && name.endsWith('.data')
  })
  return found?.data || { talents: {}, trees: {} }
}

export function talentTreesFromDump(dump, backgroundTemplate) {
  const out = {}
  const talents = dump.talents || {}
  for (const [file, , trees] of FOREVER_TALENT_CLASSES) {
    out[file] = trees.map(([treeId, name]) => {
      const rows = talents[String(treeId)] || talents[treeId] || {}
      const byId = {}
      const list = []
      for (const row of Object.values(rows)) {
        const id = Number(row.id)
        const entry = {
          fieldName: talentFieldName(row.name || `talent${id}`),
          name: row.name || '',
          icon: row.icon || '',
          location: {
            rowIdx: Number(row.row) || 0,
            colIdx: Number(row.col) || 0,
          },
          spellIds: [id],
          maxPoints: talentMaxPoints(row),
          _id: id,
          _requires: Array.isArray(row.requires) ? row.requires : [],
        }
        byId[id] = entry
        list.push(entry)
      }
      for (const entry of list) {
        const req = entry._requires[0]
        if (req && byId[req.id]) {
          entry.prereqLocation = { ...byId[req.id].location }
        }
        delete entry._id
        delete entry._requires
      }
      list.sort((a, b) => a.location.rowIdx - b.location.rowIdx || a.location.colIdx - b.location.colIdx)
      return {
        name,
        backgroundUrl: backgroundTemplate.replace('{treeId}', String(treeId)),
        talents: list,
      }
    })
  }
  return out
}

const SLOT_PATTERNS = [
  [/ Head /, 1],
  [/ Neck /, 2],
  [/ Shoulder /, 3],
  [/ Back /, 4],
  [/ Chest /, 5],
  [/ Wrist /, 6],
  [/ Hands /, 7],
  [/ Waist /, 8],
  [/ Legs /, 9],
  [/ Feet /, 10],
  [/ Finger /, 11],
  [/ Trinket /, 13],
  [/ ((Main Hand)|(Two-Hand)|(One-Hand)) /, 15],
  [/ ((Off Hand)|(Held In Off-hand)|(Held In Off-Hand)|(Shield)) /, 16],
  [/ (Ranged|Thrown|Relic|Gun|Bow|Crossbow|Wand) /, 17],
]

const WEAPON_SUBCLASS = [
  [/ Fist Weapon /, 'Fist Weapon'],
  [/ Two-Handed Axe | Axe /, 'Axe'],
  [/ Two-Handed Sword | Sword /, 'Sword'],
  [/ Two-Handed Mace | Mace /, 'Mace'],
  [/ Dagger /, 'Dagger'],
  [/ Polearm /, 'Polearm'],
  [/ Staff /, 'Staff'],
  [/ Bow /, 'Bow'],
  [/ Gun /, 'Gun'],
  [/ Crossbow /, 'Crossbow'],
  [/ Wand /, 'Wand'],
  [/ Thrown /, 'Thrown'],
  [/ Shield /, 'Shield'],
]

const INV_TYPE = {
  1: { slot: 1 },
  2: { slot: 2 },
  3: { slot: 3 },
  5: { slot: 5 },
  6: { slot: 8 },
  7: { slot: 9 },
  8: { slot: 10 },
  9: { slot: 6 },
  10: { slot: 7 },
  11: { slot: 11 },
  12: { slot: 13 },
  13: { slot: 15, hand: '1h' },
  14: { slot: 16, hand: 'oh', itemSubclass: 'Shield' },
  15: { slot: 17, hand: 'ranged' },
  16: { slot: 4 },
  17: { slot: 15, hand: '2h' },
  21: { slot: 15, hand: '1h' },
  22: { slot: 16, hand: 'oh' },
  23: { slot: 16, hand: 'oh' },
  25: { slot: 17, hand: 'ranged' },
  26: { slot: 17, hand: 'ranged' },
  28: { slot: 17, hand: 'ranged' },
}

export function applyInventoryType(item, inventoryType) {
  const mapped = INV_TYPE[Number(inventoryType)]
  if (!mapped) {
    return item
  }
  item.slot = mapped.slot
  if (mapped.hand) {
    item.hand = mapped.hand
  }
  if (mapped.itemSubclass && !item.itemSubclass) {
    item.itemSubclass = mapped.itemSubclass
  }
  return item
}

const CLASS_BITS = {
  Warrior: 1,
  Paladin: 2,
  Hunter: 4,
  Rogue: 8,
  Priest: 16,
  Shaman: 64,
  Mage: 128,
  Warlock: 256,
  Druid: 1024,
}

function parseCooldown(raw) {
  if (!raw) {
    return 0
  }
  const min = raw.match(/(\d+(?:\.\d+)?)\s*Min/i)
  const sec = raw.match(/(\d+(?:\.\d+)?)\s*Sec/i)
  return (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0)
}

function intStat(text, re) {
  const m = text.match(re)
  return m ? Number(m[1]) : 0
}

export function parseItemEffects(tooltip) {
  const text = ` ${stripHtml(tooltip || '')} `
  const effects = []
  const useRe = /Use:\s*([\s\S]*?)(?:\(([^)]*Cooldown)\)|$)/gi
  let match
  while ((match = useRe.exec(text))) {
    const body = match[1].replace(/\s+/g, ' ').trim()
    const cooldown = parseCooldown(match[2] || '')
    const duration =
      intStat(body, /(?:lasts|for)\s+(\d+)\s+sec/i) || intStat(body, /(\d+)\s+sec(?:ond)?s?/i)
    const ap =
      intStat(body, /attack power by (\d+)/i) ||
      intStat(body, /melee and ranged attack power by (\d+)/i)
    const spellPower =
      intStat(body, /damage and healing done by magical spells and effects by up to (\d+)/i) ||
      intStat(body, /spell damage(?: taken)? by up to (\d+)/i) ||
      intStat(body, /magical spells and effects by up to (\d+)/i)
    const haste =
      intStat(body, /(?:attack speed|casting speed|haste) by (\d+)%/i) / 100
    const crit = intStat(body, /critical strike chance by (\d+)%/i) / 100
    const strength = intStat(body, /Strength by (\d+)/i)
    const armorIgnore =
      intStat(body, /ignore (\d+) of your target's armor/i) ||
      intStat(body, /(\d+) armor ignore/i) * (intStat(body, /stacking up to (\d+)/i) || 1)
    const stackAP = intStat(body, /Increases attack power by (\d+) every/i)
    const interval = intStat(body, /every (\d+) sec/i)
    effects.push({
      kind: 'use',
      text: `Use: ${body}${match[2] ? ` (${match[2]})` : ''}`.replace(/\s+/g, ' ').trim(),
      attackPower: ap,
      spellPower,
      haste,
      crit,
      strength,
      armorIgnore,
      duration: duration || (stackAP ? 20 : 0),
      cooldown,
      stackAP,
      interval,
    })
  }
  const extra = text.match(/(\d+(?:\.\d+)?)%\s+chance(?: on (?:melee )?(?:hit|attack))? to (?:gain |grant )?(\d+) extra attacks?/i)
    || text.match(/chance on (?:melee )?(?:hit|attack) to gain 1 extra attack/i)
  if (extra) {
    effects.push({
      kind: 'proc',
      text: extra[0].trim(),
      chance: extra[1] ? Number(extra[1]) / 100 : 0.02,
      extraAttack: extra[2] ? Number(extra[2]) : 1,
    })
  } else if (/2%\s+chance.{0,40}extra attack/i.test(text)) {
    effects.push({
      kind: 'proc',
      text: 'Equip: 2% chance on melee hit to gain 1 extra attack.',
      chance: 0.02,
      extraAttack: 1,
    })
  }
  const procAP = text.match(/chance on (?:hitting|melee hit).{0,80}?attack power by (\d+)/i)
  if (procAP) {
    const dur = intStat(text, /for (\d+) sec/i) || 15
    effects.push({
      kind: 'proc',
      text: procAP[0].trim(),
      chance: 0.02,
      attackPower: Number(procAP[1]),
      duration: dur,
    })
  }
  return effects.filter((effect) =>
    effect.attackPower ||
    effect.spellPower ||
    effect.haste ||
    effect.crit ||
    effect.strength ||
    effect.armorIgnore ||
    effect.extraAttack ||
    effect.stackAP,
  )
}

function withoutUseClauses(tooltip) {
  return ` ${tooltip} `.replace(/Use:\s*[\s\S]*?(?:\([^)]*Cooldown\)|\.(?=\s|$))/gi, ' ')
}

export function parseItemTooltip(raw) {
  const tooltip = stripHtml(raw.tooltip || '')
  const padded = ` ${tooltip} `
  const staticText = withoutUseClauses(tooltip)
  const effects = parseItemEffects(tooltip)

  let slot = 0
  for (const [re, id] of SLOT_PATTERNS) {
    if (re.test(padded)) {
      slot = id
      break
    }
  }
  let itemSubclass = ''
  for (const [re, name] of WEAPON_SUBCLASS) {
    if (re.test(padded)) {
      itemSubclass = name
      break
    }
  }
  let hand = ''
  if (/ Two-Hand /.test(padded)) {
    hand = '2h'
    slot = 15
  } else if (/ One-Hand | Main Hand /.test(padded)) {
    hand = '1h'
    slot = 15
  } else if (/ Off Hand | Held In Off-hand | Held In Off-Hand | Shield /.test(padded)) {
    hand = 'oh'
    slot = 16
  } else if (slot === 17) {
    hand = 'ranged'
  }

  let armorType = ''
  if (/ Plate /.test(padded)) {
    armorType = 'Plate'
  } else if (/ Mail /.test(padded)) {
    armorType = 'Mail'
  } else if (/ Leather /.test(padded)) {
    armorType = 'Leather'
  } else if (/ Cloth /.test(padded)) {
    armorType = 'Cloth'
  }

  const range = padded.match(/ (\d+)\s*-\s*(\d+)\s+Damage /)
  const speedM = padded.match(/ Speed (\d+\.\d+) /)
  let weaponDps = 0
  let attackSpeedMs = 0
  if (range && speedM) {
    const speed = Number(speedM[1])
    attackSpeedMs = Math.round(speed * 1000)
    weaponDps = (Number(range[1]) + Number(range[2])) / 2 / speed
  } else {
    const dpsM = padded.match(/ (\d+\.\d+) damage per second /i)
    if (dpsM) {
      weaponDps = Number(dpsM[1])
    }
    if (speedM) {
      attackSpeedMs = Math.round(Number(speedM[1]) * 1000)
    }
  }

  const bothCrit = intStat(
    staticText,
    /critical strike with melee and ranged attacks and with spells by (\d+)%/i,
  )
  const spellCritPct =
    bothCrit || intStat(staticText, /critical strike with spells by (\d+)%/i)
  const meleeCritPct = bothCrit || intStat(staticText, /get a critical strike by (\d+)%/i)
  const spellHitPct = intStat(staticText, /chance to hit with spells by (\d+)%/i)
  const meleeHitPct = intStat(staticText, /chance to hit by (\d+)%/i)
  const spellPower =
    intStat(staticText, /damage and healing done by magical spells and effects by up to (\d+)/i) +
    intStat(staticText, /damage done by magical spells and effects by up to (\d+)/i) +
    intStat(staticText, /damage done by Fire spells and effects by up to (\d+)/i) +
    intStat(staticText, /damage done by Frost spells and effects by up to (\d+)/i) +
    intStat(staticText, /damage done by Shadow spells and effects by up to (\d+)/i) +
    intStat(staticText, /damage done by Arcane spells and effects by up to (\d+)/i) +
    intStat(staticText, /damage done by Nature spells and effects by up to (\d+)/i) +
    intStat(staticText, /damage done by Holy spells and effects by up to (\d+)/i)

  let classMask = 0
  const req = padded.match(/Requires ((?:Warrior|Paladin|Hunter|Rogue|Priest|Shaman|Mage|Warlock|Druid)(?:, (?:Warrior|Paladin|Hunter|Rogue|Priest|Shaman|Mage|Warlock|Druid))*)/)
  if (req) {
    for (const name of req[1].split(/,\s*/)) {
      classMask |= CLASS_BITS[name] || 0
    }
  }

  const junk = /^(Design|Recipe|Pattern|Plans|Schematic):/.test(raw.name || '') ||
    / Design: | Recipe: | Pattern: | Plans: | Schematic: /.test(padded)

  return {
    id: Number(raw.id) || 0,
    name: raw.name || '',
    icon: raw.icon || 'inv_misc_questionmark',
    quality: Number(raw.quality) || 0,
    slot,
    hand,
    armorType,
    classMask,
    junk,
    itemLevel: intStat(padded, /Item Level (\d+)/),
    requiredLevel: intStat(padded, /Requires Level (\d+)/),
    strength: intStat(staticText, /([+-]\d+) Strength/),
    agility: intStat(staticText, /([+-]\d+) Agility/),
    stamina: intStat(staticText, /([+-]\d+) Stamina/),
    intellect: intStat(staticText, /([+-]\d+) Intellect/),
    spirit: intStat(staticText, /([+-]\d+) Spirit/),
    attackPower:
      intStat(staticText, /\+(\d+) Attack Power/) + intStat(staticText, /\+ (\d+) Attack Power/),
    spellPower,
    armor: intStat(staticText, /(\d+) Armor/),
    defense: intStat(staticText, /Increases defense by (\d+)/i),
    dodgeChance: intStat(staticText, /chance to dodge by (\d+)%/i) / 100,
    parryChance: intStat(staticText, /chance to parry by (\d+)%/i) / 100,
    rangedAttackPower: intStat(staticText, /(\d+) ranged Attack Power/i),
    mp5: intStat(staticText, /(\d+) mana per 5/i),
    minDamage: range ? Number(range[1]) : 0,
    maxDamage: range ? Number(range[2]) : 0,
    unique: / Unique /.test(padded),
    binds: /Binds when picked up/.test(padded)
      ? 'Binds when picked up'
      : /Binds when equipped/.test(padded)
        ? 'Binds when equipped'
        : '',
    critChance: meleeCritPct / 100,
    hitChance: meleeHitPct / 100,
    spellCritChance: spellCritPct / 100,
    spellHitChance: spellHitPct / 100,
    weaponDps,
    attackSpeedMs,
    itemSubclass,
    tooltip,
    effects,
  }
}

export function parseSpellTooltip(raw) {
  const tooltip = stripHtml(raw.tooltip || '')
  const padded = ` ${tooltip} `

  const rage = intStat(padded, /(\d+) Rage/)
  const energy = intStat(padded, /(\d+) Energy/)
  let cost = 0
  let resource = ''
  if (rage) {
    cost = rage
    resource = 'rage'
  } else if (energy) {
    cost = energy
    resource = 'energy'
  }

  let cooldown = 0
  const secCd = padded.match(/(\d+(?:\.\d+)?) sec cooldown/i)
  const minCd = padded.match(/(\d+(?:\.\d+)?) min(?:ute)?s? cooldown/i)
  if (minCd) {
    cooldown = Number(minCd[1]) * 60
  } else if (secCd) {
    cooldown = Number(secCd[1])
  }

  let duration = 0
  const lasts = padded.match(/Lasts (\d+) sec/i) || padded.match(/for (\d+) sec/i)
  if (lasts) {
    duration = Number(lasts[1])
  }
  const over = padded.match(/over (\d+) sec/i)
  if (over && !duration) {
    duration = Number(over[1])
  }

  const range = padded.match(/(\d+)\s+to\s+(\d+)/)
  let damageFlat = 0
  if (range) {
    damageFlat = (Number(range[1]) + Number(range[2])) / 2
  }
  const causing = padded.match(/causing (\d+)(?:\s+to\s+(\d+))? damage/i)
  if (causing) {
    damageFlat = causing[2]
      ? (Number(causing[1]) + Number(causing[2])) / 2
      : Number(causing[1])
  }

  const plusMelee = padded.match(/increases melee damage by (\d+)/i)
  const plusWeapon = padded.match(/weapon damage plus (\d+)/i)
  const plusDmg = padded.match(/plus (\d+)(?: damage)?(?!\s+for each)/i)
  if (plusMelee) {
    damageFlat = Number(plusMelee[1])
  } else if (plusWeapon) {
    damageFlat = Number(plusWeapon[1])
  } else if (!range && plusDmg) {
    damageFlat = Number(plusDmg[1])
  }
  const extraDot = padded.match(/additional (\d+)(?:\s+\w+)? damage over/i)
  if (extraDot) {
    damageFlat += Number(extraDot[1])
  }
  if (!damageFlat) {
    const overDmg = padded.match(/(\d+) damage over \d+/i)
    if (overDmg) {
      damageFlat = Number(overDmg[1])
    }
  }

  let damageWeapon = 0
  const pct = padded.match(/causing (\d+(?:\.\d+)?)%\s+(?:of )?weapon damage/i) || padded.match(/(\d+)% (?:weapon )?damage/i)
  if (/weapon damage/i.test(padded) && !/increases melee damage by/i.test(padded)) {
    if (pct) {
      damageWeapon = Number(pct[1]) / 100
    } else {
      damageWeapon = 1
    }
    if (/two extra attacks|2 attacks|both weapons/i.test(padded)) {
      damageWeapon = 2
    }
  }

  let damageAP = 0
  const apPct = padded.match(/(\d+(?:\.\d+)?)%\s+of your (?:melee )?attack power/i)
  if (apPct) {
    damageAP = Number(apPct[1]) / 100
  }

  const dumpRagePer = intStat(padded, /(\d+) additional damage for each point of rage/i) ||
    intStat(padded, /(\d+) damage for each point of rage/i)

  const buffAP = intStat(padded, /(?:by |Grants you )(\d+) (?:melee )?attack power/i)
  const buffDamagePct = intStat(padded, /increases (?:physical |all )?damage(?: done)? by (\d+)%/i)
  const buffHastePct =
    intStat(padded, /attack speed by (\d+)%/i) || intStat(padded, /haste by (\d+)%/i)
  const buffCritPct = /next (?:\d+ )?attacks? will be critical|causing critical hits/i.test(padded)
    ? 100
    : intStat(padded, /critical strike chance by (\d+)%/i)

  const gain = intStat(padded, /generates (\d+) rage/i) || intStat(padded, /gain (\d+) rage/i)

  let castTime = 0
  const castM = padded.match(/(\d+(?:\.\d+)?) sec cast/i)
  const channelM = padded.match(/(\d+(?:\.\d+)?) sec channel/i)
  if (castM) {
    castTime = Number(castM[1])
  } else if (channelM) {
    castTime = Number(channelM[1])
  }
  const instant = / Instant /.test(padded)

  let damageSP = 0
  const meleeSpell =
    Boolean(resource) || damageWeapon > 0 || dumpRagePer > 0 || /weapon damage/i.test(padded)
  if (!meleeSpell && damageFlat > 0) {
    if (castTime > 0) {
      damageSP = Math.min(1, castTime / 3.5)
    } else if (duration > 0 && /over \d+ sec/i.test(padded) && instant) {
      damageSP = Math.min(1, duration / 15)
    } else {
      damageSP = 1.5 / 3.5
    }
  }

  return {
    spellId: Number(raw.id) || 0,
    name: raw.name || '',
    icon: raw.icon || 'inv_misc_questionmark',
    rank: intStat(padded, /Rank (\d+)/),
    cost,
    resource,
    cooldown,
    duration,
    damageFlat,
    damageWeapon,
    damageAP,
    dumpRagePer,
    castTime,
    damageSP,
    buffAP,
    buffDamage: buffDamagePct / 100,
    buffHaste: buffHastePct / 100,
    buffCrit: buffCritPct / 100,
    gain,
    tooltip,
  }
}

export function extractSpellRanks(html, path, spellName = '') {
  const ranks = []
  const seen = new Set()
  const add = (id, rank) => {
    if (!id || !rank || seen.has(id)) {
      return
    }
    seen.add(id)
    ranks.push({ id, rank })
  }

  const listMatch = html.match(/id:\s*'see-also-ability'[\s\S]{0,800}?data:\s*(\[[\s\S]*?\])\s*\}\)/)
  if (listMatch) {
    try {
      const data = JSON.parse(listMatch[1])
      for (const row of data) {
        const rank = Number(String(row.rank || '').replace(/Rank\s+/i, ''))
        add(Number(row.id), rank)
      }
    } catch {
      /* fall through to other parsers */
    }
  }

  const self = html.match(/\$\.extend\(g_spells\[(\d+)\],\s*\{[\s\S]*?"rank":"Rank (\d+)"/)
  if (self) {
    add(Number(self[1]), Number(self[2]))
  }

  if (spellName) {
    const escaped = spellName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const gather = new RegExp(
      `"(\\d+)":\\{[^}]*"name_enus":"${escaped}"[^}]*"rank_enus":"Rank (\\d+)"`,
      'g',
    )
    let m
    while ((m = gather.exec(html))) {
      add(Number(m[1]), Number(m[2]))
    }
  }

  const re = new RegExp(`/${path}/spell=(\\d+)[^"'\\s>]*["'][^>]*>\\s*Rank\\s+(\\d+)`, 'gi')
  let m
  while ((m = re.exec(html))) {
    add(Number(m[1]), Number(m[2]))
  }
  ranks.sort((a, b) => a.rank - b.rank)
  return ranks
}

export function pickMaxRank(ranks, fallbackId) {
  if (!ranks.length) {
    return { id: fallbackId, rank: 0 }
  }
  return ranks[ranks.length - 1]
}

export function catalogItemFromParsed(item) {
  const out = {
    id: item.id,
    name: item.name,
    slot: item.slot,
    icon: item.icon,
    quality: item.quality,
  }
  if (item.strength) {
    out.strength = item.strength
  }
  if (item.agility) {
    out.agility = item.agility
  }
  if (item.stamina) {
    out.stamina = item.stamina
  }
  if (item.intellect) {
    out.intellect = item.intellect
  }
  if (item.spirit) {
    out.spirit = item.spirit
  }
  if (item.attackPower) {
    out.attackPower = item.attackPower
  }
  if (item.spellPower) {
    out.spellPower = item.spellPower
  }
  if (item.critChance) {
    out.critChance = item.critChance
  }
  if (item.hitChance) {
    out.hitChance = item.hitChance
  }
  if (item.spellCritChance) {
    out.spellCritChance = item.spellCritChance
  }
  if (item.spellHitChance) {
    out.spellHitChance = item.spellHitChance
  }
  if (item.armorType) {
    out.armorType = item.armorType
  }
  if (item.hand) {
    out.hand = item.hand
  }
  if (item.classMask) {
    out.classMask = item.classMask
  }
  if (item.weaponDps) {
    out.weaponDps = Math.round(item.weaponDps * 10) / 10
  }
  if (item.attackSpeedMs) {
    out.attackSpeedMs = item.attackSpeedMs
  }
  if (item.itemSubclass) {
    out.itemSubclass = item.itemSubclass
  }
  if (item.itemLevel) {
    out.itemLevel = item.itemLevel
  }
  if (item.armor) {
    out.armor = item.armor
  }
  if (item.defense) {
    out.defense = item.defense
  }
  if (item.dodgeChance) {
    out.dodgeChance = item.dodgeChance
  }
  if (item.parryChance) {
    out.parryChance = item.parryChance
  }
  if (item.rangedAttackPower) {
    out.rangedAttackPower = item.rangedAttackPower
  }
  if (item.mp5) {
    out.mp5 = item.mp5
  }
  if (item.minDamage) {
    out.minDamage = item.minDamage
  }
  if (item.maxDamage) {
    out.maxDamage = item.maxDamage
  }
  if (item.unique) {
    out.unique = true
  }
  if (item.binds) {
    out.binds = item.binds
  }
  if (item.requiredLevel) {
    out.requiredLevel = item.requiredLevel
  }
  if (item.tooltip) {
    out.tooltip = item.tooltip
  }
  if (item.effects?.length) {
    out.effects = item.effects.map((effect) => {
      const next = { kind: effect.kind, text: effect.text }
      for (const key of ['attackPower', 'spellPower', 'haste', 'crit', 'strength', 'armorIgnore', 'duration', 'cooldown', 'chance', 'extraAttack', 'stackAP', 'interval']) {
        if (effect[key]) {
          next[key] = effect[key]
        }
      }
      return next
    })
  }
  return out
}

export function applySpellToAbility(ability, spell, openerKeepCd = true) {
  const next = { ...ability, spellId: spell.spellId }
  if (spell.name) {
    next.name = spell.name
  }
  if (spell.icon && spell.icon !== 'inv_misc_questionmark') {
    next.icon = spell.icon
  }
  if (spell.rank) {
    next.rank = spell.rank
  }
  if (spell.cost) {
    next.cost = spell.cost
  }
  if (spell.resource && !next.resource) {
    next.resource = spell.resource
  }
  if (spell.cooldown && !(openerKeepCd && next.cooldown >= 999)) {
    next.cooldown = spell.cooldown
  }
  if (spell.duration && (ability.duration > 0 || ability.kind === 'buff')) {
    next.duration = spell.duration
  }
  const damaging =
    ability.kind === 'strike' ||
    ability.kind === 'queue' ||
    ability.kind === 'dot' ||
    (ability.kind === 'opener' && ability.duration > 0)
  if (!damaging) {
    delete next.damageFlat
    delete next.damageWeapon
    delete next.damageAP
    delete next.dumpRagePer
  } else {
    if (spell.damageFlat) {
      next.damageFlat = spell.damageFlat
    }
    if (spell.damageWeapon) {
      next.damageWeapon = spell.damageWeapon
    }
    if (spell.damageAP) {
      next.damageAP = spell.damageAP
    }
    if (spell.dumpRagePer) {
      next.dumpRagePer = spell.dumpRagePer
    }
    if (spell.castTime) {
      next.castTime = spell.castTime
    }
    if (spell.damageSP) {
      next.damageSP = Math.round(spell.damageSP * 1000) / 1000
    }
  }
  if (ability.kind === 'buff' && spell.buffAP) {
    next.buffAP = spell.buffAP
  }
  if (ability.kind === 'buff' && spell.buffDamage) {
    next.buffDamage = spell.buffDamage
  }
  if (ability.kind === 'buff' && spell.buffHaste) {
    next.buffHaste = spell.buffHaste
  }
  if (ability.kind === 'buff' && spell.buffCrit) {
    next.buffCrit = spell.buffCrit
  }
  if (spell.gain) {
    next.gain = spell.gain
  }
  return next
}
