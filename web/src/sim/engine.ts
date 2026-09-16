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

let ready: Promise<void> | null = null

export function initEngine(): Promise<void> {
  if (!ready) {
    ready = loadWasm()
  }
  return ready
}

async function loadWasm(): Promise<void> {
  const go = new Go()
  const wasmReady = new Promise<void>((resolve) => {
    window.wowfSimReady = () => resolve()
  })

  const response = await fetch(`${import.meta.env.BASE_URL}wowfsim.wasm`)
  if (!response.ok) {
    throw new Error(
      `Failed to load wowfsim.wasm (${response.status}). Build the engine first.`,
    )
  }

  const { instance } = await WebAssembly.instantiateStreaming(
    response,
    go.importObject,
  )
  void go.run(instance)
  await wasmReady
}

export type TalentRanks = Record<number, number>

export type SimInput = {
  class: Class
  race: Race
  durationSeconds: number
  iterations: number
  seed: bigint
  items: CatalogItem[]
  talents: TalentRanks
  raidBuffs?: string[]
}

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
        })),
      },
      talents: Object.entries(input.talents)
        .filter(([, rank]) => rank > 0)
        .map(([id, rank]) => ({ id: Number(id), rank })),
      raidBuffs: input.raidBuffs ?? [],
    },
    encounter: {
      durationSeconds: input.durationSeconds,
    },
    options: {
      iterations: input.iterations,
      rngSeed: input.seed,
    },
  })
}

export function runSim(input: SimInput): SimResult {
  const bytes = toBinary(SimRequestSchema, toRequest(input))
  const out = window.wowfSimRun(bytes)
  return fromBinary(SimResultSchema, out)
}

export function runStatWeights(input: SimInput): StatWeightsResult {
  const bytes = toBinary(SimRequestSchema, toRequest(input))
  const out = window.wowfSimStatWeights(bytes)
  return fromBinary(StatWeightsResultSchema, out)
}

export function mergeSimResults(parts: SimResult[]): SimResult {
  if (parts.length === 1) {
    return parts[0]
  }

  let iterations = 0
  let meanAcc = 0
  let secondMoment = 0
  let dpsMin = Number.POSITIVE_INFINITY
  let dpsMax = Number.NEGATIVE_INFINITY
  const actions = new Map<
    string,
    {
      name: string
      icon: string
      dps: number
      casts: bigint
      crits: bigint
      misses: bigint
    }
  >()

  for (const part of parts) {
    const n = part.iterations
    iterations += n
    meanAcc += part.dpsMean * n
    secondMoment += n * (part.dpsStdev * part.dpsStdev + part.dpsMean * part.dpsMean)
    dpsMin = Math.min(dpsMin, part.dpsMin)
    dpsMax = Math.max(dpsMax, part.dpsMax)
    for (const action of part.actions) {
      const current = actions.get(action.name)
      const weight = BigInt(n)
      if (!current) {
        actions.set(action.name, {
          name: action.name,
          icon: action.icon,
          dps: action.dps * n,
          casts: action.casts * weight,
          crits: action.crits * weight,
          misses: action.misses * weight,
        })
      } else {
        current.dps += action.dps * n
        current.casts += action.casts * weight
        current.crits += action.crits * weight
        current.misses += action.misses * weight
      }
    }
  }

  const mean = meanAcc / iterations
  let variance = secondMoment / iterations - mean * mean
  if (variance < 0) {
    variance = 0
  }

  const mergedActions = [...actions.values()].map((action) => ({
    name: action.name,
    icon: action.icon,
    dps: action.dps / iterations,
    casts: action.casts / BigInt(iterations),
    crits: action.crits / BigInt(iterations),
    misses: action.misses / BigInt(iterations),
  }))
  mergedActions.sort((a, b) => {
    if (a.name === 'Auto Attack') {
      return -1
    }
    if (b.name === 'Auto Attack') {
      return 1
    }
    return b.dps - a.dps
  })

  return {
    ...parts[0],
    dpsMean: mean,
    dpsStdev: Math.sqrt(variance),
    dpsMin,
    dpsMax,
    iterations,
    actions: mergedActions,
    timeline: parts[0].timeline,
  }
}

export function iterationChunkSize(durationSeconds: number, iterations: number) {
  const work = durationSeconds * iterations
  if (work <= 40_000) {
    return iterations
  }
  const chunks = Math.ceil(work / 80_000)
  return Math.max(40, Math.min(400, Math.ceil(iterations / chunks)))
}
