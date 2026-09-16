import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expand } from './parse.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function loadEndpoints() {
  const file = join(root, 'scripts', 'wowhead', 'endpoints.json')
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function cacheDir() {
  return join(root, 'data', 'wowhead')
}

export function tooltipPath(kind, id) {
  return join(cacheDir(), 'tooltips', kind, `${id}.json`)
}

export async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

export async function fetchText(url, endpoints) {
  const res = await fetch(url, {
    headers: { 'User-Agent': endpoints.userAgent || 'wowf-sim-wowhead/0.1' },
  })
  if (!res.ok) {
    const err = new Error(`GET ${url} -> ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.text()
}

export async function cachedJson(kind, id, url, endpoints) {
  const dest = tooltipPath(kind, id)
  if (existsSync(dest)) {
    return JSON.parse(readFileSync(dest, 'utf8'))
  }
  const text = await fetchText(url, endpoints)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, text)
  await sleep(endpoints.requestDelayMs || 50)
  return JSON.parse(text)
}

export async function cachedText(relPath, url, endpoints, force = false) {
  const dest = join(cacheDir(), relPath)
  if (!force && existsSync(dest)) {
    return readFileSync(dest, 'utf8')
  }
  const text = await fetchText(url, endpoints)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, text)
  await sleep(endpoints.requestDelayMs || 50)
  return text
}

export function itemTooltipUrl(endpoints, id) {
  return expand(endpoints.tooltipItem, { ...endpoints, id })
}

export function spellTooltipUrl(endpoints, id) {
  return expand(endpoints.tooltipSpell, { ...endpoints, id })
}

export function spellPageUrl(endpoints, id) {
  return expand(endpoints.spellPage, { ...endpoints, id })
}

export function cacheRel(endpoints, relPath) {
  return join(endpoints.name || 'wowhead', relPath)
}

export function gearPlannerUrl(endpoints) {
  return expand(endpoints.gearPlanner, endpoints)
}

export function gearPlannerItemKey(endpoints) {
  return expand(endpoints.gearPlannerItemKey, endpoints)
}

export function itemListUrl(endpoints, listPath) {
  return expand(endpoints.itemList, { ...endpoints, listPath })
}

export function talentsClassicUrl(endpoints) {
  return expand(endpoints.talentsClassic, endpoints)
}
