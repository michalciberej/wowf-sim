import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import {
  SimRequestSchema,
  SimResultSchema,
  Class,
  Race,
  type SimResult,
} from '../gen/wowfsim/sim_pb.ts'

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

  const response = await fetch('/wowfsim.wasm')
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

export function runSim(input: {
  class: Class
  race: Race
  durationSeconds: number
  iterations: number
  seed: bigint
}): SimResult {
  const request = create(SimRequestSchema, {
    player: {
      name: 'Player',
      class: input.class,
      race: input.race,
      level: 60,
    },
    encounter: {
      durationSeconds: input.durationSeconds,
    },
    options: {
      iterations: input.iterations,
      rngSeed: input.seed,
    },
  })

  const bytes = toBinary(SimRequestSchema, request)
  const out = window.wowfSimRun(bytes)
  return fromBinary(SimResultSchema, out)
}
