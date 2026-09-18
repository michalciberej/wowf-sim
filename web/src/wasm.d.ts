export {}

declare global {
  class Go {
    importObject: WebAssembly.Imports
    run(instance: WebAssembly.Instance): Promise<void>
  }

  var wowfSimRun: (input: Uint8Array) => Uint8Array
  var wowfSimStatWeights: (input: Uint8Array) => Uint8Array
  var wowfSimReady: () => void
}
