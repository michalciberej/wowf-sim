import type { SimWorkerInit, SimWorkerRequest, SimWorkerResponse } from './protocol.ts'

function post(msg: SimWorkerResponse) {
  ;(self as unknown as Worker).postMessage(msg)
}

async function boot(init: SimWorkerInit) {
  new Function(init.execSrc)()
  const started = new Promise<void>((resolve) => {
    ;(globalThis as typeof globalThis & { wowfSimReady: () => void }).wowfSimReady = () => resolve()
  })
  const go = new Go()
  const wasmHref = init.wasmUrl
  if (!wasmHref) {
    throw new Error('sim worker init is missing wasmUrl')
  }
  const response = await fetch(wasmHref)
  if (!response.ok) {
    throw new Error(`Failed to load wowfsim.wasm (${response.status}). Build the engine first.`)
  }
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject)
  void go.run(instance)
  await started
}

let booted: Promise<void> | null = null

self.onmessage = (event: MessageEvent<SimWorkerInit | SimWorkerRequest>) => {
  const data = event.data
  if (data.kind === 'init') {
    booted = boot(data)
      .then(() => {
        post({ id: 0, kind: 'ready' })
        void import('./sim.worker.jobs.ts')
      })
      .catch((err: unknown) => {
        post({ id: 0, kind: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return
  }

  const { id } = data
  ;(async () => {
    try {
      if (!booted) {
        throw new Error('sim worker was not initialized')
      }
      await booted
      const { runWorkerJob } = await import('./sim.worker.jobs.ts')
      runWorkerJob(data, post)
    } catch (err: unknown) {
      post({ id, kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  })()
}
