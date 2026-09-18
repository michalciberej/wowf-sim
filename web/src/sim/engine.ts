import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import {
  SimRequestSchema,
  SimResultSchema,
  StatWeightsResultSchema,
  Class,
  Race,
  type SimRequest,
  type SimResult,
  type StatWeightsResult,
} from '../gen/wowfsim/sim_pb.ts'
import type { CatalogItem } from '../catalog/era.ts'
import wasmUrl from '../wasm/wowfsim.wasm?url'
import wasmExecUrl from '../wasm/wasm_exec.js?url'
import { idleBetweenChunks, iterationChunkSize, mergeSimResults, progressView } from './merge.ts'
import type { SimWorkerInit, SimWorkerRequest, SimWorkerResponse } from './protocol.ts'

export type { SimResult }
export { mergeSimResults, iterationChunkSize }

type Job = {
  resolve: (bytes: Uint8Array) => void
  reject: (err: Error) => void
  onProgress?: SimProgress
}

type PoolWorker = {
  worker: Worker
  busy: boolean
}

let mode: 'pool' | 'main' | null = null
let ready: Promise<void> | null = null
let pool: PoolWorker[] = []
let nextId = 1
const jobs = new Map<number, Job>()
let mainBooted = false
let execSrc = ''
let wasmModule: WebAssembly.Module | null = null

export function initEngine(): Promise<void> {
  if (!ready) {
    ready = bootEngine().catch((err) => {
      ready = null
      mode = null
      throw err
    })
  }
  return ready
}

function assetUrl(path: string) {
  return new URL(path, window.location.href).href
}

function poolSize() {
  const cores = navigator.hardwareConcurrency || 2
  return Math.min(4, Math.max(1, cores > 4 ? cores - 2 : Math.max(1, cores - 1)))
}

async function loadExec() {
  if (execSrc) {
    return
  }
  const response = await fetch(assetUrl(wasmExecUrl))
  if (!response.ok) {
    throw new Error(`Failed to load wasm_exec.js (${response.status})`)
  }
  execSrc = await response.text()
}

async function bootEngine() {
  await loadExec()
  await bootOnMain()
  mode = 'main'
  void startPoolInBackground()
}

async function startPoolInBackground() {
  try {
    const first = await startOneWorker()
    pool = [first]
    mode = 'pool'
    void spawnExtraWorkers()
  } catch (err) {
    console.warn('sim workers unavailable, using main thread', err)
  }
}

async function spawnExtraWorkers() {
  const extra = poolSize() - pool.length
  for (let i = 0; i < extra; i++) {
    try {
      pool.push(await startOneWorker())
    } catch (err) {
      console.warn('extra sim worker failed', err)
    }
  }
}

function stopPool() {
  for (const item of pool) {
    item.worker.terminate()
  }
  pool = []
  jobs.clear()
}

function startOneWorker(): Promise<PoolWorker> {
  return new Promise((resolve, reject) => {
    if (!execSrc) {
      reject(new Error('WASM assets are not loaded'))
      return
    }
    const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
    const item: PoolWorker = { worker, busy: false }
    const init: SimWorkerInit = { kind: 'init', execSrc, wasmUrl: assetUrl(wasmUrl) }
    const timer = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('sim worker timed out while loading the engine'))
    }, 20000)

    worker.onmessage = (event: MessageEvent<SimWorkerResponse>) => {
      const msg = event.data
      if (msg.kind === 'ready') {
        window.clearTimeout(timer)
        resolve(item)
        return
      }
      if (msg.id === 0 && msg.kind === 'error') {
        window.clearTimeout(timer)
        worker.terminate()
        reject(new Error(msg.message || 'Failed to start sim engine'))
        return
      }
      const job = jobs.get(msg.id)
      if (!job) {
        return
      }
      if (msg.kind === 'progress') {
        let live: SimResult | undefined
        if (msg.result) {
          try {
            live = fromBinary(SimResultSchema, msg.result)
          } catch {
            live = undefined
          }
        }
        job.onProgress?.({
          done: msg.done ?? 0,
          total: msg.total ?? 0,
          dpsMean: msg.dpsMean ?? 0,
          dpsStdev: msg.dpsStdev ?? 0,
          result: live,
        })
        return
      }
      jobs.delete(msg.id)
      item.busy = false
      if (msg.kind === 'error') {
        job.reject(new Error(msg.message || 'sim worker failed'))
        return
      }
      if (!msg.result) {
        job.reject(new Error('sim worker returned no result'))
        return
      }
      job.resolve(msg.result)
    }
    worker.onerror = (event) => {
      window.clearTimeout(timer)
      const err = new Error(event.message || 'sim worker failed')
      reject(err)
      for (const [id, job] of jobs) {
        jobs.delete(id)
        job.reject(err)
      }
    }
    try {
      worker.postMessage(init)
    } catch (err) {
      window.clearTimeout(timer)
      worker.terminate()
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

function postJob(worker: Worker, item: PoolWorker, kind: SimWorkerRequest['kind'], request: Uint8Array, onProgress?: SimProgress) {
  const id = nextId++
  const payload = request.slice()
  item.busy = true
  return new Promise<Uint8Array>((resolve, reject) => {
    jobs.set(id, { resolve, reject, onProgress })
    worker.postMessage({ id, kind, request: payload } satisfies SimWorkerRequest)
  })
}

function engineBytes(out: unknown, what: string): Uint8Array {
  if (out instanceof Uint8Array) {
    return out.slice()
  }
  if (out instanceof ArrayBuffer) {
    return new Uint8Array(out).slice()
  }
  if (out instanceof Error) {
    throw out
  }
  if (typeof out === 'object' && out && 'message' in out && !('byteLength' in out)) {
    throw new Error(String((out as { message: unknown }).message))
  }
  throw new Error(`${what} was not binary protobuf data`)
}

async function bootOnMain() {
  if (mainBooted) {
    return
  }
  await loadExec()
  new Function(execSrc)()
  const started = new Promise<void>((resolve) => {
    ;(globalThis as typeof globalThis & { wowfSimReady: () => void }).wowfSimReady = () => resolve()
  })
  const go = new Go()
  let instance: WebAssembly.Instance
  if (wasmModule) {
    instance = await WebAssembly.instantiate(wasmModule, go.importObject)
  } else {
    const href = assetUrl(wasmUrl)
    const result = await WebAssembly.instantiateStreaming(fetch(href), go.importObject).catch(async () => {
      const response = await fetch(href)
      if (!response.ok) {
        throw new Error(`Failed to load wowfsim.wasm (${response.status}). Build the engine first.`)
      }
      return WebAssembly.instantiate(await response.arrayBuffer(), go.importObject)
    })
    instance = result.instance
    wasmModule = result.module
  }
  void go.run(instance)
  await started
  mainBooted = true
}

function callMain(kind: 'sim' | 'weights', request: Uint8Array): Uint8Array {
  const fn =
    kind === 'weights'
      ? (globalThis as typeof globalThis & { wowfSimStatWeights: (input: Uint8Array) => unknown }).wowfSimStatWeights
      : (globalThis as typeof globalThis & { wowfSimRun: (input: Uint8Array) => unknown }).wowfSimRun
  return engineBytes(fn(request), kind === 'weights' ? 'stat-weight engine result' : 'sim engine result')
}

export type TalentRanks = Record<number, number>

export type SimInput = {
  class: Class
  race: Race
  durationSeconds: number
  iterations: number
  seed: bigint
  items: Array<CatalogItem & { enchantId?: number }>
  talents: TalentRanks
  raidBuffs?: string[]
  abilityPriorities?: Record<string, number>
  executeAbilityPriorities?: Record<string, number>
  stance?: number
  combatPotion?: number
  mhWeaponTemp?: string
  ohWeaponTemp?: string
}

export type SimProgress = (update: {
  done: number
  total: number
  dpsMean: number
  dpsStdev: number
  result?: SimResult
}) => void

function toRequest(input: SimInput, overrides?: { iterations?: number; seed?: bigint; name?: string }): SimRequest {
  return create(SimRequestSchema, {
    player: {
      name: overrides?.name ?? 'Player',
      class: input.class,
      race: input.race,
      level: 60,
      gear: {
        items: input.items.map((item) => ({
          id: item.id,
          name: item.name,
          slot: item.slot,
          weaponDps: item.weaponDps ?? 0,
          attackSpeedMs: item.attackSpeedMs ?? 0,
          strength: item.strength ?? 0,
          agility: item.agility ?? 0,
          attackPower: item.attackPower ?? 0,
          critChance: item.critChance ?? 0,
          hitChance: item.hitChance ?? 0,
          itemSubclass: item.itemSubclass ?? '',
          hand: item.hand ?? '',
          intellect: item.intellect ?? 0,
          spellPower: item.spellPower ?? 0,
          spellCritChance: item.spellCritChance ?? 0,
          spellHitChance: item.spellHitChance ?? 0,
          enchantId: item.enchantId ?? 0,
          effects: (item.effects ?? []).map((effect) => ({
            kind: effect.kind ?? '',
            name: effect.name ?? item.name,
            text: effect.text ?? '',
            attackPower: effect.attackPower ?? 0,
            spellPower: effect.spellPower ?? 0,
            haste: effect.haste ?? 0,
            crit: effect.crit ?? 0,
            strength: effect.strength ?? 0,
            agility: effect.agility ?? 0,
            armorIgnore: effect.armorIgnore ?? 0,
            rage: effect.rage ?? 0,
            duration: effect.duration ?? 0,
            cooldown: effect.cooldown ?? 0,
            chance: effect.chance ?? 0,
            extraAttack: effect.extraAttack ?? 0,
            stackAp: effect.stackAP ?? 0,
            interval: effect.interval ?? 0,
            icon: effect.icon ?? '',
          })),
        })),
      },
      talents: Object.entries(input.talents)
        .filter(([, rank]) => rank > 0)
        .map(([id, rank]) => ({ id: Number(id), rank })),
      raidBuffs: input.raidBuffs ?? [],
      abilityPriorities: Object.entries(input.abilityPriorities ?? {})
        .filter(([id]) => id)
        .map(([id, priority]) => ({ id, priority })),
      executeAbilityPriorities: Object.entries(input.executeAbilityPriorities ?? {})
        .filter(([id]) => id)
        .map(([id, priority]) => ({ id, priority })),
      stance: input.stance ?? 0,
      combatPotion: input.combatPotion ?? 0,
      mhWeaponTemp: input.mhWeaponTemp ?? '',
      ohWeaponTemp: input.ohWeaponTemp ?? '',
    },
    encounter: {
      durationSeconds: input.durationSeconds,
      armor: 7700,
    },
    options: {
      iterations: overrides?.iterations ?? input.iterations,
      rngSeed: overrides?.seed ?? input.seed,
    },
  })
}

function splitWork(total: number, workers: number) {
  const n = Math.max(1, Math.min(workers, total))
  const base = Math.floor(total / n)
  let extra = total % n
  const slices: Array<{ offset: number; count: number }> = []
  let offset = 0
  for (let i = 0; i < n; i++) {
    const count = base + (extra > 0 ? 1 : 0)
    if (extra > 0) {
      extra -= 1
    }
    slices.push({ offset, count })
    offset += count
  }
  return slices
}

async function runSimOnMain(input: SimInput, onProgress?: SimProgress): Promise<SimResult> {
  const req = toRequest(input)
  const total = req.options?.iterations || 1000
  const duration = req.encounter?.durationSeconds || 60
  const baseSeed = req.options?.rngSeed ?? 0n
  const chunk = Math.min(iterationChunkSize(duration, total), 12)
  const parts: SimResult[] = []
  let done = 0
  while (done < total) {
    const n = Math.min(chunk, total - done)
    if (!req.options) {
      break
    }
    req.options.iterations = n
    req.options.rngSeed = baseSeed + BigInt(done)
    if (req.player && done > 0) {
      req.player.name = '-'
    }
    parts.push(fromBinary(SimResultSchema, callMain('sim', toBinary(SimRequestSchema, req))))
    done += n
    const merged = mergeSimResults(parts)
    onProgress?.({
      done,
      total,
      dpsMean: merged.dpsMean,
      dpsStdev: merged.dpsStdev,
      result: progressView(merged),
    })
    if (done < total) {
      await idleBetweenChunks()
    }
  }
  return mergeSimResults(parts)
}

export async function runSim(input: SimInput, onProgress?: SimProgress): Promise<SimResult> {
  await initEngine()
  if (mode !== 'pool' || pool.length === 0) {
    return runSimOnMain(input, onProgress)
  }

  const slices = splitWork(input.iterations, pool.length)
  const sliceDone = slices.map(() => 0)
  const sliceParts: Array<SimResult | null> = slices.map(() => null)

  const parts = await Promise.all(
    slices.map(async (slice, index) => {
      if (slice.count <= 0) {
        return null
      }
      const worker = pool[index]
      const bytes = await postJob(
        worker.worker,
        worker,
        'sim',
        toBinary(
          SimRequestSchema,
          toRequest(input, {
            iterations: slice.count,
            seed: input.seed + BigInt(slice.offset),
            name: index === 0 ? 'Player' : '-',
          }),
        ),
        (update) => {
          sliceDone[index] = update.done
          if (update.result) {
            sliceParts[index] = update.result
          }
          const done = sliceDone.reduce((sum, n) => sum + n, 0)
          const liveParts = sliceParts.filter((part): part is SimResult => Boolean(part))
          const live = liveParts.length ? mergeSimResults(liveParts) : null
          onProgress?.({
            done,
            total: input.iterations,
            dpsMean: live?.dpsMean ?? 0,
            dpsStdev: live?.dpsStdev ?? 0,
            result: live ? progressView(live) : undefined,
          })
        },
      )
      return fromBinary(SimResultSchema, bytes)
    }),
  )
  return mergeSimResults(parts.filter((part): part is SimResult => Boolean(part)))
}

export async function runStatWeights(input: SimInput): Promise<StatWeightsResult> {
  await initEngine()
  const request = toBinary(SimRequestSchema, toRequest(input))
  if (mode === 'pool' && pool[0]) {
    const bytes = await postJob(pool[0].worker, pool[0], 'weights', request)
    return fromBinary(StatWeightsResultSchema, bytes)
  }
  return fromBinary(StatWeightsResultSchema, callMain('weights', request))
}

export function randomSimSeed(): bigint {
  const bits = new Uint32Array(2)
  crypto.getRandomValues(bits)
  const n = (BigInt(bits[0]) << 31n) | BigInt(bits[1] >>> 1)
  return n === 0n ? 1n : n
}
