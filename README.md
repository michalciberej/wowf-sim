# WoWF Sim

All-in-browser DPS simulator for WoW Forever. The React UI talks to a Go engine compiled to WASM. Protobuf is the only contract between them.

```
proto/                 shared SimRequest / SimResult
engine/                Go sim, CLI, WASM entrypoint
  internal/sim         placeholder combat model
  internal/clientdata  future Forever client table loader
web/                   Vite + React UI
```

## Commands

From the repo root:

```
npm run gen     # buf: proto → Go + TypeScript
npm test        # Go engine tests
npm run cli     # native Go smoke run
npm run dev     # build WASM, then Vite on http://localhost:5173
npm run build   # WASM + production web bundle
```

Spell and item numbers will later come from extracted client tables via `engine/internal/clientdata`, not from hardcoded UI constants.
