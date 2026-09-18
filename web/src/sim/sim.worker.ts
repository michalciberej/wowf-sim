import { fromBinary, toBinary } from '@bufbuild/protobuf'
import { SimRequestSchema, SimResultSchema, StatWeightsResultSchema, type SimResult } from '../gen/wowfsim/sim_pb.ts'
import { idleBetweenChunks, iterationChunkSize, mergeSimResults } from './merge.ts'
import type { SimWorkerRequest, SimWorkerResponse } from './protocol.ts'
import wasmExecSrc from '../wasm/wasm_exec.js?raw'
import wasmUrl from '../wasm/wowfsim.wasm?url'

declare const self: DedicatedWorkerGlobalScope

let currentId = 0

function post(msg: SimWorkerResponse) {
  self.postMessage(msg)
}

function api() {
  const g = globalThis as typeof globalThis & {
    wowfSimRun: (input: Uint8Array) => unknown
    wowfSimStatWeights: (input: Uint8Array) => unknown
  }
  return g
}

function engineBytes(out: unknown, what: string): Uint8Array {
  if (out instanceof Uint8Array) {
    return out
  }
  if (out instanceof ArrayBuffer) {
    return new Uint8Array(out)
  }
  if (out instanceof Error) {
    throw out
  }
  if (typeof out === 'object' && out && 'message' in out && !('byteLength' in out)) {
    throw new Error(String((out as { message: unknown }).message))
  }
  throw new Error(`${what} was not binary protobuf data`)
}

async function boot() {
  new Function(wasmExecSrc)()

  const ready = new Promise<void>((resolve) => {
    ;(globalThis as typeof globalThis & { wowfSimReady: () => void }).wowfSimReady = () => resolve()
  })

  const wasm = await fetch(wasmUrl)
  if (!wasm.ok) {
    throw new Error(`Failed to load wowfsim.wasm (${wasm.status}). Build the engine first.`)
  }

  const go = new Go()
  const { instance } = await WebAssembly.instantiateStreaming(wasm, go.importObject)
  void go.run(instance)
  await ready
}

function runChunk(request: Uint8Array) {
  return engineBytes(api().wowfSimRun(request), 'sim engine result')
}

async function runSimJob(id: number, requestBytes: Uint8Array) {
  const req = fromBinary(SimRequestSchema, requestBytes)
  const total = req.options?.iterations || 1000
  const duration = req.encounter?.durationSeconds || 60
  const baseSeed = req.options?.rngSeed ?? 0n
  const chunk = iterationChunkSize(duration, total)
  const parts: SimResult[] = []
  let done = 0

  while (done < total) {
    if (currentId !== id) {
      return
    }
    const n = Math.min(chunk, total - done)
    if (!req.options) {
      return
    }
    req.options.iterations = n
    req.options.rngSeed = baseSeed + BigInt(done)
    parts.push(fromBinary(SimResultSchema, runChunk(toBinary(SimRequestSchema, req))))
    done += n
    const merged = mergeSimResults(parts)
    post({
      id,
      kind: 'progress',
      result: toBinary(SimResultSchema, merged),
      done,
      total,
    })
    if (done < total) {
      await idleBetweenChunks()
    }
  }

  if (currentId !== id) {
    return
  }
  post({
    id,
    kind: 'done',
    result: toBinary(SimResultSchema, mergeSimResults(parts)),
    done: total,
    total,
  })
}

self.onmessage = (event: MessageEvent<SimWorkerRequest>) => {
  const msg = event.data
  currentId = msg.id
  void (async () => {
    try {
      if (msg.kind === 'weights') {
        const out = engineBytes(api().wowfSimStatWeights(msg.request), 'stat-weight engine result')
        if (currentId !== msg.id) {
          return
        }
        fromBinary(StatWeightsResultSchema, out)
        post({ id: msg.id, kind: 'done', result: out })
        return
      }
      await runSimJob(msg.id, msg.request)
    } catch (err) {
      if (currentId !== msg.id) {
        return
      }
      post({
        id: msg.id,
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })()
}

boot()
  .then(() => post({ id: 0, kind: 'ready' }))
  .catch((err: unknown) => {
    post({
      id: 0,
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  })
