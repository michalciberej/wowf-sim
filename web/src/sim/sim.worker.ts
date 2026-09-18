import { fromBinary, toBinary } from '@bufbuild/protobuf'
import { SimRequestSchema, SimResultSchema, type SimResult } from '../gen/wowfsim/sim_pb.ts'
import { idleBetweenChunks, iterationChunkSize, mergeSimResults } from './merge.ts'
import type { SimWorkerRequest, SimWorkerResponse } from './protocol.ts'

declare const self: DedicatedWorkerGlobalScope

let currentId = 0

function post(msg: SimWorkerResponse) {
  self.postMessage(msg)
}

function api() {
  const g = globalThis as typeof globalThis & {
    wowfSimRun: (input: Uint8Array) => Uint8Array
    wowfSimStatWeights: (input: Uint8Array) => Uint8Array
  }
  return g
}

async function boot() {
  const base = import.meta.env.BASE_URL
  const origin = self.location.origin
  const wasmExec = await fetch(new URL(`${base}wasm_exec.js`, origin)).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to load wasm_exec.js (${res.status})`)
    }
    return res.text()
  })
  new Function(wasmExec)()

  const ready = new Promise<void>((resolve) => {
    ;(globalThis as typeof globalThis & { wowfSimReady: () => void }).wowfSimReady = () => resolve()
  })

  const wasm = await fetch(new URL(`${base}wowfsim.wasm`, origin))
  if (!wasm.ok) {
    throw new Error(`Failed to load wowfsim.wasm (${wasm.status}). Build the engine first.`)
  }

  const go = new Go()
  const { instance } = await WebAssembly.instantiateStreaming(wasm, go.importObject)
  void go.run(instance)
  await ready
}

function runChunk(request: Uint8Array) {
  return api().wowfSimRun(request)
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
        const out = api().wowfSimStatWeights(msg.request)
        if (currentId !== msg.id) {
          return
        }
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
