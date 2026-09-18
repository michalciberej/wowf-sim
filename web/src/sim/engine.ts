import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import {
  SimRequestSchema,
  SimResultSchema,
  StatWeightsResultSchema,
  Class,
  Race,
  type SimResult,
  type StatWeightsResult,
} from '../gen/wowfsim/sim_pb.ts'
import type { CatalogItem } from '../catalog/era.ts'
import type { SimWorkerRequest, SimWorkerResponse } from './protocol.ts'

export type { SimResult }
export { mergeSimResults, iterationChunkSize } from './merge.ts'

let ready: Promise<void> | null = null
let worker: Worker | null = null
let jobId = 0

export function initEngine(): Promise<void> {
  if (!ready) {
    ready = startWorker()
  }
  return ready
}

function startWorker(): Promise<void> {
  const simWorker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
  worker = simWorker
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<SimWorkerResponse>) => {
      if (event.data.kind === 'ready') {
        simWorker.removeEventListener('message', onMessage)
        resolve()
        return
      }
      if (event.data.kind === 'error' && event.data.id === 0) {
        simWorker.removeEventListener('message', onMessage)
        reject(new Error(event.data.message || 'Engine worker failed to start'))
      }
    }
    simWorker.addEventListener('message', onMessage)
    simWorker.addEventListener(
      'error',
      () => {
        reject(new Error('Engine worker crashed while loading'))
      },
      { once: true },
    )
  })
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
  stance?: number
  combatPotion?: number
  mhWeaponTemp?: string
  ohWeaponTemp?: string
}

export type SimProgress = (result: SimResult, done: number, total: number) => void

function toRequest(input: SimInput) {
  return create(SimRequestSchema, {
    player: {
      name: 'Player',
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
        })),
      },
      talents: Object.entries(input.talents)
        .filter(([, rank]) => rank > 0)
        .map(([id, rank]) => ({ id: Number(id), rank })),
      raidBuffs: input.raidBuffs ?? [],
      abilityPriorities: Object.entries(input.abilityPriorities ?? {})
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
      iterations: input.iterations,
      rngSeed: input.seed,
    },
  })
}

function requestBytes(input: SimInput) {
  return toBinary(SimRequestSchema, toRequest(input))
}

function callWorker(
  kind: SimWorkerRequest['kind'],
  request: Uint8Array,
  onProgress?: SimProgress,
): Promise<Uint8Array> {
  if (!worker) {
    return Promise.reject(new Error('Engine is not ready'))
  }
  const id = ++jobId
  const target = worker
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<SimWorkerResponse>) => {
      if (event.data.id !== id) {
        return
      }
      if (event.data.kind === 'progress' && event.data.result && onProgress) {
        onProgress(
          fromBinary(SimResultSchema, event.data.result),
          event.data.done ?? 0,
          event.data.total ?? 0,
        )
        return
      }
      if (event.data.kind === 'done' && event.data.result) {
        target.removeEventListener('message', onMessage)
        resolve(event.data.result)
        return
      }
      if (event.data.kind === 'error') {
        target.removeEventListener('message', onMessage)
        reject(new Error(event.data.message || 'Simulation failed'))
      }
    }
    target.addEventListener('message', onMessage)
    const msg: SimWorkerRequest = { id, kind, request }
    target.postMessage(msg)
  })
}

export async function runSim(input: SimInput, onProgress?: SimProgress): Promise<SimResult> {
  await initEngine()
  const out = await callWorker('sim', requestBytes(input), onProgress)
  return fromBinary(SimResultSchema, out)
}

export async function runStatWeights(input: SimInput): Promise<StatWeightsResult> {
  await initEngine()
  const out = await callWorker('weights', requestBytes(input))
  return fromBinary(StatWeightsResultSchema, out)
}

export function randomSimSeed(): bigint {
  const bits = new Uint32Array(2)
  crypto.getRandomValues(bits)
  const n = (BigInt(bits[0]) << 31n) | BigInt(bits[1] >>> 1)
  return n === 0n ? 1n : n
}
