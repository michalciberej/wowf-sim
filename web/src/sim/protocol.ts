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
  message?: string
}
