import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySpellToAbility,
  catalogItemFromParsed,
  extractGearPlannerItems,
  extractListviewItems,
  extractSpellRanks,
  extractTalentCalcDump,
  parseItemTooltip,
  parseSpellTooltip,
  pickMaxRank,
  stripHtml,
  talentTreesFromDump,
} from './parse.mjs'

test('stripHtml flattens wowhead markup', () => {
  assert.equal(stripHtml('<b>Heroic Strike</b><br>15 Rage'), 'Heroic Strike\n15 Rage')
})

test('parseItemTooltip reads Lionheart Helm hit and plate', () => {
  const item = parseItemTooltip({
    id: 12640,
    name: 'Lionheart Helm',
    quality: 4,
    icon: 'inv_helmet_36',
    tooltip:
      'Lionheart Helm Item Level 61 Head Plate +18 Strength +15 Stamina Requires Level 60 Equip: Improves your chance to get a critical strike by 2%. Equip: Improves your chance to hit by 2%.',
  })
  assert.equal(item.slot, 1)
  assert.equal(item.armorType, 'Plate')
  assert.equal(item.strength, 18)
  assert.equal(item.critChance, 0.02)
  assert.equal(item.hitChance, 0.02)
})

test('parseItemTooltip reads Thunderfury weapon and stats', () => {
  const item = parseItemTooltip({
    id: 19019,
    name: 'Thunderfury, Blessed Blade of the Windseeker',
    quality: 5,
    icon: 'inv_sword_39',
    tooltip:
      'Thunderfury, Blessed Blade of the Windseeker Item Level 80 Binds when picked up Unique One-Hand Sword 44 - 115 Damage Speed 1.90 +5 Agility +8 Stamina Requires Level 60',
  })
  assert.equal(item.slot, 15)
  assert.equal(item.hand, '1h')
  assert.equal(item.itemSubclass, 'Sword')
  assert.equal(item.agility, 5)
  assert.equal(item.attackSpeedMs, 1900)
  assert.ok(item.weaponDps > 40 && item.weaponDps < 43)
})

test('parseSpellTooltip reads max-rank Heroic Strike', () => {
  const spell = parseSpellTooltip({
    id: 25286,
    name: 'Heroic Strike',
    icon: 'ability_rogue_ambush',
    tooltip:
      'Heroic Strike Rank 9 15 Rage Melee Range Next Melee Requires Warrior Requires level 60 A strong attack that increases melee damage by 157 and causes a high amount of threat.',
  })
  assert.equal(spell.rank, 9)
  assert.equal(spell.cost, 15)
  assert.equal(spell.resource, 'rage')
  assert.equal(spell.damageFlat, 157)
})

test('parseSpellTooltip reads Execute extra rage', () => {
  const spell = parseSpellTooltip({
    id: 20647,
    name: 'Execute',
    tooltip:
      'Execute Rank 5 15 Rage Attempts to finish a foe, causing 600 damage and converting each extra point of rage into 15 additional damage for each point of rage.',
  })
  assert.equal(spell.damageFlat, 600)
  assert.equal(spell.dumpRagePer, 15)
  assert.equal(spell.cost, 15)
})

test('extractSpellRanks reads see-also-ability listview', () => {
  const html = `$.extend(g_spells[78], {"rank":"Rank 1"});
new Listview({template: 'spell', id: 'see-also-ability', name: 'x', data: [{"id":284,"rank":"Rank 2"},{"id":25286,"rank":"Rank 9"}]});`
  const ranks = extractSpellRanks(html, 'classic', 'Heroic Strike')
  assert.deepEqual(pickMaxRank(ranks, 78), { id: 25286, rank: 9 })
})

test('extractGearPlannerItems reads WH.setPageData blobs', () => {
  const db = `WH.setPageData("wow.gearPlanner.classicplus.item", {"19019":{"id":19019,"name":"Thunderfury","quality":5,"itemLevel":80,}});`
  const items = extractGearPlannerItems(db, 'wow.gearPlanner.classicplus.item')
  assert.equal(items['19019'].name, 'Thunderfury')
})

test('extractListviewItems reads unquoted Wowhead listview rows', () => {
  const html = `var listviewitems = [{"id":12640,"quality":4,"level":61,"name":"Lionheart Helm",firstseenpatch: 0,popularity:12}];
new Listview({template: 'item', data: listviewitems});`
  const rows = extractListviewItems(html)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 12640)
  assert.equal(rows[0].quality, 4)
  assert.equal(rows[0].firstseenpatch, 0)
})

test('extractTalentCalcDump maps Forever trees', () => {
  const db = `WH.setPageData("wow.talentCalcClassic.classicplus.data", {"glyphs":[],"talents":{"161":{"12282":{"id":12282,"row":0,"col":0,"icon":"ability_rogue_ambush","name":"Improved Heroic Strike","ranks":[null,null,null],"requires":[],"descriptions":{"1":"a","2":"b","3":"c"}}}},"trees":{"161":{"id":161,"description":"WarriorArms"}}});`
  const dump = extractTalentCalcDump(db, 'wow.talentCalcClassic.classicplus.data')
  const trees = talentTreesFromDump(dump, 'https://example/{treeId}.jpg')
  assert.equal(trees.warrior[0].name, 'Arms')
  assert.equal(trees.warrior[0].talents[0].fieldName, 'improvedHeroicStrike')
  assert.equal(trees.warrior[0].talents[0].maxPoints, 3)
  assert.equal(trees.warrior[0].talents[0].spellIds[0], 12282)
  assert.match(trees.warrior[0].backgroundUrl, /161/)
})

test('applySpellToAbility keeps opener cooldown', () => {
  const next = applySpellToAbility(
    { id: 'charge', cooldown: 999, gain: 15, kind: 'opener' },
    { spellId: 11578, name: 'Charge', cooldown: 15, gain: 15, icon: 'ability_warrior_charge', rank: 3 },
  )
  assert.equal(next.cooldown, 999)
  assert.equal(next.spellId, 11578)
})

test('applySpellToAbility keeps DoT damage', () => {
  const next = applySpellToAbility(
    { id: 'rend', kind: 'dot', duration: 21, cost: 10 },
    { spellId: 11574, name: 'Rend', damageFlat: 147, duration: 21, cost: 10, rank: 7 },
  )
  assert.equal(next.damageFlat, 147)
  assert.equal(next.duration, 21)
})

test('parseItemTooltip reads spell power and spell crit', () => {
  const item = parseItemTooltip({
    id: 19397,
    name: "Ring of Blackrock",
    quality: 4,
    tooltip:
      'Ring of Blackrock Item Level 83 Finger +19 Stamina Requires Level 60 Equip: Increases damage and healing done by magical spells and effects by up to 36. Equip: Improves your chance to get a critical strike with spells by 1%. Equip: Improves your chance to hit with spells by 1%.',
  })
  assert.equal(item.itemLevel, 83)
  assert.equal(item.spellPower, 36)
  assert.equal(item.spellCritChance, 0.01)
  assert.equal(item.spellHitChance, 0.01)
  assert.equal(item.critChance, 0)
  assert.equal(item.hitChance, 0)
})

test('parseSpellTooltip reads Rend bleed total', () => {
  const spell = parseSpellTooltip({
    id: 11574,
    name: 'Rend',
    tooltip:
      'Rend Rank 7 10 Rage Melee Range Instant Requires Warrior Requires level 60 Wounds the target causing them to bleed for 147 damage over 21 sec.',
  })
  assert.equal(spell.rank, 7)
  assert.equal(spell.duration, 21)
  assert.equal(spell.damageFlat, 147)
})

test('parseSpellTooltip reads fireball cast time and coefficient', () => {
  const spell = parseSpellTooltip({
    id: 25306,
    name: 'Fireball',
    tooltip:
      'Fireball Rank 12 410 Mana 35 yd range 3.5 sec cast Requires Mage Requires level 60 Hurls a fiery ball that causes 596 to 760 Fire damage and an additional 76 Fire damage over 8 sec.',
  })
  assert.equal(spell.castTime, 3.5)
  assert.equal(spell.damageSP, 1)
  assert.ok(spell.damageFlat > 700)
})

test('parseItemTooltip keeps Use effects off static spell power', () => {
  const item = parseItemTooltip({
    id: 18820,
    name: 'Talisman of Ephemeral Power',
    quality: 4,
    tooltip:
      'Talisman of Ephemeral Power Item Level 66 Binds when picked up Unique Trinket Requires Level 60 Use: Increases damage and healing done by magical spells and effects by up to 175 for 15 sec. (1 Min, 30 Sec Cooldown)',
  })
  assert.equal(item.spellPower, 0)
  assert.equal(item.effects.length, 1)
  assert.equal(item.effects[0].kind, 'use')
  assert.equal(item.effects[0].spellPower, 175)
  assert.equal(item.effects[0].duration, 15)
  assert.equal(item.effects[0].cooldown, 90)
})

test('parseItemTooltip reads Earthstrike on-use AP and Hand of Justice proc', () => {
  const earth = parseItemTooltip({
    id: 21180,
    name: 'Earthstrike',
    tooltip:
      'Earthstrike Item Level 66 Unique Trinket Requires Level 60 Use: Increases your melee and ranged attack power by 280. Effect lasts 20 sec. (2 Min Cooldown)',
  })
  assert.equal(earth.effects[0].attackPower, 280)
  assert.equal(earth.effects[0].duration, 20)
  assert.equal(earth.effects[0].cooldown, 120)
  const hoj = parseItemTooltip({
    id: 11815,
    name: 'Hand of Justice',
    tooltip:
      'Hand of Justice Item Level 58 Unique Trinket +20 Attack Power Equip: 2% chance on melee hit to gain 1 extra attack.',
  })
  assert.equal(hoj.attackPower, 20)
  assert.equal(hoj.effects[0].extraAttack, 1)
  assert.equal(hoj.effects[0].chance, 0.02)
})

test('catalogItemFromParsed omits zero stats', () => {
  const row = catalogItemFromParsed({
    id: 1,
    name: 'Test',
    slot: 1,
    icon: 'x',
    quality: 4,
    strength: 10,
    agility: 0,
  })
  assert.equal(row.strength, 10)
  assert.equal(row.agility, undefined)
})
