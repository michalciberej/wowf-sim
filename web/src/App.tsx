import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { Class, ItemSlot, Race, type SimResult, type StatWeightsResult } from './gen/wowfsim/sim_pb.ts'
import { initEngine, runSim, runStatWeights, mergeSimResults, iterationChunkSize, type TalentRanks } from './sim/engine'
import { ITEMS, canEquipItem } from './catalog/era.ts'
import { emptyWeights, weightsFromMeasured } from './catalog/weights.ts'
import { GearPanel } from './components/GearPanel.tsx'
import { ItemPickerModal } from './components/ItemPickerModal.tsx'
import { ItemTooltip } from './components/ItemTooltip.tsx'
import { TalentTrees } from './components/TalentTrees.tsx'
import { SettingsPanel } from './components/SettingsPanel.tsx'
import { StatWeightsPanel } from './components/StatWeightsPanel.tsx'
import { SimTimeline } from './components/SimTimeline.tsx'
import { SimResultPanel } from './components/SimResultPanel.tsx'
import { CharacterStats } from './components/CharacterStats.tsx'
import { defaultRaidBuffs, enabledBuffIds } from './catalog/buffs.ts'
import { computeSheetStats } from './catalog/character.ts'
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

const STARTING_GEAR: Record<number, number> = {
  [ItemSlot.HEAD]: 16963,
  [ItemSlot.NECK]: 18404,
  [ItemSlot.SHOULDER]: 16961,
  [ItemSlot.BACK]: 18541,
  [ItemSlot.CHEST]: 16966,
  [ItemSlot.WRIST]: 19146,
  [ItemSlot.HANDS]: 16964,
  [ItemSlot.WAIST]: 19137,
  [ItemSlot.LEGS]: 16962,
  [ItemSlot.FEET]: 19387,
  [ItemSlot.FINGER_1]: 18821,
  [ItemSlot.FINGER_2]: 17063,
  [ItemSlot.TRINKET_1]: 11815,
  [ItemSlot.TRINKET_2]: 19406,
  [ItemSlot.MAIN_HAND]: 19019,
  [ItemSlot.OFF_HAND]: 18805,
  [ItemSlot.RANGED]: 17069,
}

type LowerPanel = 'gear' | 'talents' | 'settings' | 'weights' | 'result' | 'timeline'

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
  const [runProgress, setRunProgress] = useState('')
  const [result, setResult] = useState<SimResult | null>(null)
  const [fightLength, setFightLength] = useState(60)
  const [gearIds, setGearIds] = useState<Record<number, number>>(STARTING_GEAR)
  const [talentRanks, setTalentRanks] = useState<TalentRanks>({})
  const [raidBuffs, setRaidBuffs] = useState<Record<string, boolean>>(defaultRaidBuffs)
  const [statWeights, setStatWeights] = useState<StatWeightsResult | null>(null)
  const [customEP, setCustomEP] = useState<Record<string, number>>(emptyWeights)
  const [openSlot, setOpenSlot] = useState<ItemSlot | null>(null)
  const [lowerPanel, setLowerPanel] = useState<LowerPanel>('gear')
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(
    null,
  )

  const hoveredItem = hover ? ITEMS.find((item) => item.id === hover.id) : null
  const classLabel = CLASSES.find((entry) => entry.value === playerClass)?.label ?? 'Player'
  const busy = running || engineState !== 'ready'
  const sheet = useMemo(
    () =>
      computeSheetStats({
        playerClass,
        race,
        gearIds,
        raidBuffs,
        talents: talentRanks,
      }),
    [playerClass, race, gearIds, raidBuffs, talentRanks],
  )

  useEffect(() => {
    initEngine()
      .then(() => setEngineState('ready'))
      .catch((err: unknown) => {
        setEngineState('error')
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  useEffect(() => {
    setTalentRanks({})
    setResult(null)
    setStatWeights(null)
    setCustomEP(emptyWeights())
    setLowerPanel('gear')
    setGearIds((current) => {
      const next = { ...current }
      for (const [slotKey, id] of Object.entries(next)) {
        if (!id) {
          continue
        }
        const slot = Number(slotKey) as ItemSlot
        const item = ITEMS.find((entry) => entry.id === id)
        if (!item || !canEquipItem(item, playerClass, slot)) {
          next[slot] = 0
        }
      }
      return next
    })
  }, [playerClass])

  function selectedItems() {
    return Object.entries(gearIds).flatMap(([slotKey, id]) => {
      if (!id) {
        return []
      }
      const item = ITEMS.find((entry) => entry.id === id)
      if (!item) {
        return []
      }
      return [{ ...item, slot: Number(slotKey) as ItemSlot }]
    })
  }

  function setSlot(slot: ItemSlot, id: number) {
    setGearIds((current) => {
      const next = { ...current, [slot]: id }
      if (slot === ItemSlot.MAIN_HAND) {
        const item = ITEMS.find((entry) => entry.id === id)
        if (item?.hand === '2h') {
          next[ItemSlot.OFF_HAND] = 0
        }
      }
      return next
    })
    setOpenSlot(null)
  }

  function onHoverItem(itemId: number, event: MouseEvent) {
    setHover({ id: itemId, x: event.clientX, y: event.clientY })
  }

  async function onRun() {
    setRunning(true)
    setRunProgress('')
    setError(null)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    try {
      const chunk = iterationChunkSize(duration, iterations)
      const parts: SimResult[] = []
      let done = 0
      while (done < iterations) {
        const n = Math.min(chunk, iterations - done)
        setRunProgress(`${done + n} / ${iterations}`)
        parts.push(
          runSim({
            class: playerClass,
            race,
            durationSeconds: duration,
            iterations: n,
            seed: 1n + BigInt(done),
            items: selectedItems(),
            talents: talentRanks,
            raidBuffs: enabledBuffIds(raidBuffs),
          }),
        )
        done += n
        if (done < iterations) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }
      setResult(mergeSimResults(parts))
      setFightLength(duration)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      setRunProgress('')
    }
  }

  async function onCalcWeights() {
    setRunning(true)
    setRunProgress('')
    setError(null)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    try {
      const next = runStatWeights({
        class: playerClass,
        race,
        durationSeconds: duration,
        iterations,
        seed: 1n,
        items: selectedItems(),
        talents: talentRanks,
        raidBuffs: enabledBuffIds(raidBuffs),
      })
      setStatWeights(next)
      setCustomEP(weightsFromMeasured(next.weights))
      setLowerPanel('weights')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">WF</span>
          <div>
            <p className="brand-kicker">Forever sim</p>
            <h1>{classLabel}</h1>
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <section className="rail-card rail-run">
            <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={onRun}>
              {running
                ? runProgress
                  ? `Simulating ${runProgress}`
                  : 'Simulating…'
                : engineState === 'loading'
                  ? 'Loading engine…'
                  : 'Simulate'}
            </button>
            <div className="rail-dps">
              {result ? (
                <>
                  <strong>{result.dpsMean.toFixed(1)}</strong>
                  <span>DPS ± {result.dpsStdev.toFixed(1)}</span>
                </>
              ) : (
                <span>No result yet</span>
              )}
            </div>
          </section>
          <section className="rail-card">
            <h2>Character</h2>
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
            <CharacterStats stats={sheet} playerClass={playerClass} />
          </section>
          {error ? <p className="error">{error}</p> : null}
        </aside>

        <section className="main">
          <nav className="tabs">
            {(
              [
                ['gear', 'Gear'],
                ['talents', 'Talents'],
                ['settings', 'Settings'],
                ['weights', 'Weights'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={lowerPanel === id ? 'active' : ''}
                onClick={() => setLowerPanel(id)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={lowerPanel === 'result' ? 'active' : ''}
              disabled={!result}
              onClick={() => result && setLowerPanel('result')}
            >
              Results
            </button>
            <button
              type="button"
              className={lowerPanel === 'timeline' ? 'active' : ''}
              disabled={!result}
              onClick={() => result && setLowerPanel('timeline')}
            >
              Timeline
            </button>
          </nav>

          <div className="main-body">
            {lowerPanel === 'timeline' && result ? (
              <SimTimeline result={result} durationSeconds={fightLength} />
            ) : lowerPanel === 'result' && result ? (
              <SimResultPanel result={result} />
            ) : lowerPanel === 'settings' ? (
              <SettingsPanel
                race={race}
                duration={duration}
                iterations={iterations}
                selected={raidBuffs}
                onRace={setRace}
                onDuration={setDuration}
                onIterations={setIterations}
                onChange={setRaidBuffs}
              />
            ) : lowerPanel === 'weights' ? (
              <StatWeightsPanel
                result={statWeights}
                ep={customEP}
                running={busy}
                onCalculate={onCalcWeights}
                onChange={(id, value) => setCustomEP((current) => ({ ...current, [id]: value }))}
                onResetMeasured={() => {
                  if (statWeights) {
                    setCustomEP(weightsFromMeasured(statWeights.weights))
                  }
                }}
                onZero={() => setCustomEP(emptyWeights())}
              />
            ) : lowerPanel === 'gear' ? (
              <GearPanel
                classLabel={classLabel}
                gearIds={gearIds}
                onOpenSlot={(slot) => {
                  setHover(null)
                  setOpenSlot(slot)
                }}
                onClearGear={() => setGearIds({})}
                onHoverItem={onHoverItem}
                onLeaveItem={() => setHover(null)}
              />
            ) : (
              <TalentTrees
                playerClass={playerClass}
                ranks={talentRanks}
                onChange={setTalentRanks}
              />
            )}
          </div>
        </section>
      </div>

      {openSlot != null && openSlot !== ItemSlot.UNSPECIFIED ? (
        <ItemPickerModal
          slot={openSlot}
          itemId={gearIds[openSlot] ?? 0}
          playerClass={playerClass}
          statEP={customEP}
          onSelect={(id) => {
            setSlot(openSlot, id)
            setOpenSlot(null)
          }}
          onClose={() => setOpenSlot(null)}
        />
      ) : null}

      {hoveredItem && openSlot == null ? (
        <ItemTooltip item={hoveredItem} x={hover?.x ?? 0} y={hover?.y ?? 0} />
      ) : null}
    </div>
  )
}

export default App
