export {}

declare global {
  class Go {
    importObject: WebAssembly.Imports
    run(instance: WebAssembly.Instance): Promise<void>
  }

  interface Window {
    wowfSimRun: (input: Uint8Array) => Uint8Array
    wowfSimReady: () => void
  }
}
