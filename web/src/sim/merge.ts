import { create } from '@bufbuild/protobuf'
import { ActionMetricSchema, SimResultSchema, type SimResult } from '../gen/wowfsim/sim_pb.ts'

export const CHUNK_IDLE_MS = 0

export function iterationChunkSize(durationSeconds: number, iterations: number) {
  const seconds = Math.max(1, durationSeconds)
  const perChunk = Math.max(32, Math.round(4800 / seconds))
  return Math.min(iterations, perChunk)
}

export function idleBetweenChunks(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })
}

export function progressView(result: SimResult): SimResult {
  if (!result.timeline.length) {
    return result
  }
  return { ...result, timeline: [] }
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
      hitDps: number
      critDps: number
      avgCastDamage: number
      casts: number
      crits: number
      misses: number
    }
  >()
  const iterationDps: number[] = []

  for (const part of parts) {
    const n = part.iterations
    iterations += n
    meanAcc += part.dpsMean * n
    secondMoment += n * (part.dpsStdev * part.dpsStdev + part.dpsMean * part.dpsMean)
    dpsMin = Math.min(dpsMin, part.dpsMin)
    dpsMax = Math.max(dpsMax, part.dpsMax)
    iterationDps.push(...part.iterationDps)
    for (const action of part.actions) {
      const current = actions.get(action.name)
      if (!current) {
        actions.set(action.name, {
          name: action.name,
          icon: action.icon,
          dps: action.dps * n,
          hitDps: action.hitDps * n,
          critDps: action.critDps * n,
          avgCastDamage: action.avgCast * action.casts * n,
          casts: action.casts * n,
          crits: action.crits * n,
          misses: action.misses * n,
        })
      } else {
        current.dps += action.dps * n
        current.hitDps += action.hitDps * n
        current.critDps += action.critDps * n
        current.avgCastDamage += action.avgCast * action.casts * n
        current.casts += action.casts * n
        current.crits += action.crits * n
        current.misses += action.misses * n
      }
    }
  }

  const mean = meanAcc / iterations
  let variance = secondMoment / iterations - mean * mean
  if (variance < 0) {
    variance = 0
  }

  const mergedActions = [...actions.values()].map((action) =>
    create(ActionMetricSchema, {
      name: action.name,
      icon: action.icon,
      dps: action.dps / iterations,
      hitDps: action.hitDps / iterations,
      critDps: action.critDps / iterations,
      avgCast: action.casts > 0 ? action.avgCastDamage / action.casts : 0,
      casts: action.casts / iterations,
      crits: action.crits / iterations,
      misses: action.misses / iterations,
    }),
  )
  mergedActions.sort((a, b) => b.dps - a.dps)

  return create(SimResultSchema, {
    dpsMean: mean,
    dpsStdev: Math.sqrt(variance),
    dpsMin,
    dpsMax,
    iterations,
    actions: mergedActions,
    modifiers: parts[0].modifiers,
    timeline: parts[0].timeline,
    iterationDps,
  })
}
