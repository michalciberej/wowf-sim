import { useEffect, useState } from 'react'
import { Class, Race, type SimResult } from './gen/wowfsim/sim_pb.ts'
import { initEngine, runSim } from './sim/engine'
import './App.css'

const CLASSES: Array<{ value: Class; label: string }> = [
  { value: Class.WARRIOR, label: 'Warrior' },
  { value: Class.ROGUE, label: 'Rogue' },
  { value: Class.HUNTER, label: 'Hunter' },
  { value: Class.MAGE, label: 'Mage' },
  { value: Class.PALADIN, label: 'Paladin' },
  { value: Class.PRIEST, label: 'Priest' },
  { value: Class.SHAMAN, label: 'Shaman' },
  { value: Class.WARLOCK, label: 'Warlock' },
  { value: Class.DRUID, label: 'Druid' },
]

const RACES: Array<{ value: Race; label: string }> = [
  { value: Race.ORC, label: 'Orc' },
  { value: Race.HUMAN, label: 'Human' },
  { value: Race.TROLL, label: 'Troll' },
  { value: Race.UNDEAD, label: 'Undead' },
  { value: Race.TAUREN, label: 'Tauren' },
  { value: Race.DWARF, label: 'Dwarf' },
  { value: Race.NIGHT_ELF, label: 'Night Elf' },
  { value: Race.GNOME, label: 'Gnome' },
  { value: Race.SKYBORNE, label: 'Skyborne' },
]

function App() {
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [error, setError] = useState<string | null>(null)
  const [playerClass, setPlayerClass] = useState(Class.WARRIOR)
  const [race, setRace] = useState(Race.ORC)
  const [duration, setDuration] = useState(60)
  const [iterations, setIterations] = useState(1000)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SimResult | null>(null)

  useEffect(() => {
    initEngine()
      .then(() => setEngineState('ready'))
      .catch((err: unknown) => {
        setEngineState('error')
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  function onRun() {
    setRunning(true)
    setError(null)
    try {
      const next = runSim({
        class: playerClass,
        race,
        durationSeconds: duration,
        iterations,
        seed: 1n,
      })
      setResult(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">WoW Forever</p>
        <h1>DPS Simulator</h1>
        <p className="lede">
          React UI, Go engine in WASM, protobuf on the wire. The sim runs in
          this browser tab.
        </p>
      </header>

      <section className="panel">
        <label>
          Class
          <select
            value={playerClass}
            onChange={(e) => setPlayerClass(Number(e.target.value) as Class)}
          >
            {CLASSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Race
          <select
            value={race}
            onChange={(e) => setRace(Number(e.target.value) as Race)}
          >
            {RACES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fight length (s)
          <input
            type="number"
            min={10}
            max={600}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </label>
        <label>
          Iterations
          <input
            type="number"
            min={1}
            max={20000}
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={engineState !== 'ready' || running}
          onClick={onRun}
        >
          {running
            ? 'Running…'
            : engineState === 'loading'
              ? 'Loading engine…'
              : 'Run sim'}
        </button>
      </section>

      {error ? <p className="error">{error}</p> : null}

      {result ? (
        <section className="results">
          <h2>
            {result.dpsMean.toFixed(1)}{' '}
            <span>DPS ± {result.dpsStdev.toFixed(1)}</span>
          </h2>
          <p>
            {result.iterations} iterations · min {result.dpsMin.toFixed(1)} · max{' '}
            {result.dpsMax.toFixed(1)}
          </p>
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>DPS</th>
                <th>Casts / iter</th>
              </tr>
            </thead>
            <tbody>
              {result.actions.map((action) => (
                <tr key={action.name}>
                  <td>{action.name}</td>
                  <td>{action.dps.toFixed(1)}</td>
                  <td>{action.casts.toString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  )
}

export default App
