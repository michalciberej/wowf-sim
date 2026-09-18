export type SimWorkerInit = {
  kind: 'init'
  execSrc: string
  wasmModule?: WebAssembly.Module
  wasmUrl?: string
}

export type SimWorkerRequest = {
  id: number
  kind: 'sim' | 'weights'
  request: Uint8Array
}

export type SimWorkerResponse = {
  id: number
  kind: 'ready' | 'progress' | 'done' | 'error'
  result?: Uint8Array
  done?: number
  total?: number
  dpsMean?: number
  dpsStdev?: number
  message?: string
}
