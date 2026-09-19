import { create } from '@bufbuild/protobuf'
import overlayEffects from '../catalog/item-effects.json' with { type: 'json' }
import type { ItemEffect } from '../catalog/era.ts'
import { ActionMetricSchema, type ActionMetric } from '../gen/wowfsim/sim_pb.ts'

export type ResultRow = {
  key: string
  name: string
  action: ActionMetric
  depth: 0 | 1
  parentKey?: string
  parts?: ActionMetric[]
  sourceNames: string[]
}

const AUTO_ORDER = ['Auto Attack', 'Off-Hand', 'Windfury', 'Weaponmaster']
const WW_ORDER = ['Whirlwind', 'Whirlwind Off-Hand']

const extraAttackNames = extraAttackProcNames()

function extraAttackProcNames() {
  const names = new Set<string>(['Weaponmaster', 'Windfury', 'Off-Hand'])
  for (const effects of Object.values(overlayEffects as Record<string, ItemEffect[]>)) {
    for (const effect of effects) {
      if (effect.extraAttack && effect.name) {
        names.add(effect.name)
      }
    }
  }
  return names
}

function isWhirlwindPart(name: string) {
  return name === 'Whirlwind' || name === 'Whirlwind Off-Hand' || name.startsWith('Whirlwind ')
}

function isAutoPart(name: string) {
  return name === 'Auto Attack' || extraAttackNames.has(name)
}

export function isAutoActionName(name: string) {
  return isAutoPart(name)
}

export function childLabel(group: 'auto' | 'whirlwind', name: string) {
  if (name === 'Auto Attack' || name === 'Whirlwind') {
    return 'Main Hand'
  }
  if (name === 'Whirlwind Off-Hand') {
    return 'Off-Hand'
  }
  if (group === 'auto' && name === 'Off-Hand') {
    return 'Off-Hand'
  }
  return name
}

function orderIndex(order: string[], name: string) {
  const i = order.indexOf(name)
  return i < 0 ? order.length : i
}

function sortParts(parts: ActionMetric[], order: string[]) {
  return [...parts].sort((a, b) => {
    const da = orderIndex(order, a.name) - orderIndex(order, b.name)
    if (da !== 0) {
      return da
    }
    return b.dps - a.dps
  })
}

function sumActions(name: string, icon: string, parts: ActionMetric[]): ActionMetric {
  let dps = 0
  let hitDps = 0
  let critDps = 0
  let avgCastDamage = 0
  let casts = 0
  let crits = 0
  let misses = 0
  let dodges = 0
  for (const part of parts) {
    dps += part.dps
    hitDps += part.hitDps
    critDps += part.critDps
    avgCastDamage += part.avgCast * part.casts
    casts += part.casts
    crits += part.crits
    misses += part.misses
    dodges += part.dodges
  }
  return create(ActionMetricSchema, {
    name,
    icon,
    dps,
    hitDps,
    critDps,
    avgCast: casts > 0 ? avgCastDamage / casts : 0,
    casts,
    crits,
    misses,
    dodges,
  })
}

function named(actions: ActionMetric[], name: string) {
  return actions.find((action) => action.name === name)
}

function pushGroup(
  rows: ResultRow[],
  used: Set<string>,
  parts: ActionMetric[],
  order: string[],
  group: 'auto' | 'whirlwind',
  parentName: string,
  parentIcon: string,
  alwaysNest: boolean,
) {
  if (parts.length === 0) {
    return
  }
  for (const part of parts) {
    used.add(part.name)
  }
  if (parts.length === 1 && !alwaysNest) {
    const only = parts[0]
    rows.push({ key: only.name, name: only.name, action: only, depth: 0, sourceNames: [only.name] })
    return
  }
  const sorted = sortParts(parts, order)
  const parent = sumActions(parentName, parentIcon || sorted[0].icon, sorted)
  rows.push({
    key: parentName,
    name: parentName,
    action: parent,
    depth: 0,
    parts: sorted,
    sourceNames: sorted.map((part) => part.name),
  })
  for (const part of sorted) {
    rows.push({
      key: `${parentName}:${part.name}`,
      name: childLabel(group, part.name),
      action: part,
      depth: 1,
      parentKey: parentName,
      sourceNames: [part.name],
    })
  }
}

export function groupResultRows(actions: ActionMetric[]): ResultRow[] {
  const used = new Set<string>()
  const autoParts = actions.filter((action) => isAutoPart(action.name))
  const wwParts = actions.filter((action) => isWhirlwindPart(action.name))
  const grouped: ResultRow[] = []

  const autoIcon = named(autoParts, 'Auto Attack')?.icon || autoParts[0]?.icon || 'inv_sword_04'
  const wwIcon = named(wwParts, 'Whirlwind')?.icon || wwParts[0]?.icon || 'ability_whirlwind'

  const autoRows: ResultRow[] = []
  const wwRows: ResultRow[] = []
  pushGroup(autoRows, used, autoParts, AUTO_ORDER, 'auto', 'Auto Attack', autoIcon, false)
  pushGroup(wwRows, used, wwParts, WW_ORDER, 'whirlwind', 'Whirlwind', wwIcon, true)

  const leftover = actions.filter((action) => !used.has(action.name))
  const tops: ResultRow[] = [
    ...autoRows.filter((row) => row.depth === 0),
    ...wwRows.filter((row) => row.depth === 0),
    ...leftover.map((action) => ({
      key: action.name,
      name: action.name,
      action,
      depth: 0 as const,
      sourceNames: [action.name],
    })),
  ].sort((a, b) => b.action.dps - a.action.dps)

  for (const top of tops) {
    if (top.key === 'Auto Attack' && autoRows.length) {
      grouped.push(...autoRows)
    } else if (top.key === 'Whirlwind' && wwRows.length) {
      grouped.push(...wwRows)
    } else {
      grouped.push(top)
    }
  }
  return grouped
}
