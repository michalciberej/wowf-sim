import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'web', 'public')
mkdirSync(publicDir, { recursive: true })

const goroot = spawnSync('go', ['env', 'GOROOT'], { encoding: 'utf8' })
if (goroot.status !== 0) {
  console.error(goroot.stderr)
  process.exit(1)
}

const gorootDir = goroot.stdout.trim()
const wasmExecCandidates = [
  join(gorootDir, 'lib', 'wasm', 'wasm_exec.js'),
  join(gorootDir, 'misc', 'wasm', 'wasm_exec.js'),
]
const wasmExec = wasmExecCandidates.find((candidate) => {
  try {
    copyFileSync(candidate, join(publicDir, 'wasm_exec.js'))
    return true
  } catch {
    return false
  }
})
if (!wasmExec) {
  console.error('Could not find wasm_exec.js under GOROOT:', gorootDir)
  process.exit(1)
}

const build = spawnSync(
  'go',
  ['build', '-o', join(publicDir, 'wowfsim.wasm'), './cmd/wasm'],
  {
    cwd: join(root, 'engine'),
    stdio: 'inherit',
    env: { ...process.env, GOOS: 'js', GOARCH: 'wasm' },
  },
)

process.exit(build.status ?? 1)
