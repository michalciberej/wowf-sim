import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expand, extractGearPlannerDumpUrls, isForeverTooltipPayload } from './parse.mjs'

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

function tooltipFromJson(raw, url) {
  const data = JSON.parse(raw)
  if (!isForeverTooltipPayload(data)) {
    const err = new Error(`GET ${url} -> empty Forever tooltip`)
    err.status = 404
    throw err
  }
  return data
}

export async function cachedJson(kind, id, url, endpoints, force = false) {
  const dest = tooltipPath(kind, id)
  if (!force && existsSync(dest)) {
    try {
      return tooltipFromJson(readFileSync(dest, 'utf8'), url)
    } catch {
      // Cached error payloads or truncated files are refetched.
    }
  }
  const text = await fetchText(url, endpoints)
  const data = tooltipFromJson(text, url)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, text)
  await sleep(endpoints.requestDelayMs || 50)
  return data
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

export async function gearPlannerDumpUrls(endpoints, flags = {}) {
  const urls = []
  const pageUrl = `${endpoints.www}/${endpoints.path}/gear-planner`
  try {
    const html = await cachedText(
      cacheRel(endpoints, 'gear-planner.html'),
      pageUrl,
      endpoints,
      flags.force,
    )
    urls.push(...extractGearPlannerDumpUrls(html))
  } catch (err) {
    console.warn('gear planner page', err.message)
  }
  urls.push(gearPlannerUrl(endpoints))
  urls.push(`${endpoints.origin}/${endpoints.path}/data/gear-planner`)
  return [...new Set(urls.filter(Boolean))]
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
