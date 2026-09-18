import { fromBinary, toBinary } from '@bufbuild/protobuf'
import { SimRequestSchema, SimResultSchema, type SimResult } from '../gen/wowfsim/sim_pb.ts'
import { iterationChunkSize, mergeSimResults, progressView } from './merge.ts'
import type { SimWorkerRequest, SimWorkerResponse } from './protocol.ts'

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

function callEngine(kind: SimWorkerRequest['kind'], request: Uint8Array): Uint8Array {
  const fn =
    kind === 'weights'
      ? (globalThis as typeof globalThis & { wowfSimStatWeights: (input: Uint8Array) => unknown }).wowfSimStatWeights
      : (globalThis as typeof globalThis & { wowfSimRun: (input: Uint8Array) => unknown }).wowfSimRun
  if (typeof fn !== 'function') {
    throw new Error('sim engine is not ready in this worker')
  }
  return engineBytes(fn(request), kind === 'weights' ? 'stat-weight engine result' : 'sim engine result')
}

export function runWorkerJob(data: SimWorkerRequest, post: (msg: SimWorkerResponse) => void) {
  const { id, kind, request } = data
  if (kind === 'weights') {
    post({ id, kind: 'done', result: callEngine('weights', request) })
    return
  }

  const req = fromBinary(SimRequestSchema, request)
  const total = req.options?.iterations || 1000
  const duration = req.encounter?.durationSeconds || 60
  const baseSeed = req.options?.rngSeed ?? 0n
  const chunk = Math.min(iterationChunkSize(duration, total), 24)
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
    parts.push(fromBinary(SimResultSchema, callEngine('sim', toBinary(SimRequestSchema, req))))
    done += n
    const merged = mergeSimResults(parts)
    post({
      id,
      kind: 'progress',
      done,
      total,
      dpsMean: merged.dpsMean,
      dpsStdev: merged.dpsStdev,
      result: toBinary(SimResultSchema, progressView(merged)),
    })
  }

  const final = mergeSimResults(parts)
  post({ id, kind: 'done', result: toBinary(SimResultSchema, final), done: total, total })
}
