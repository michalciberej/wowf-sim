import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Class, ItemSlot, type SimResult, type StatWeightsResult } from './gen/wowfsim/sim_pb.ts'
import { initEngine, runSim, runStatWeights, randomSimSeed } from './sim/engine'
import { ITEMS } from './catalog/era.ts'
import { defaultWeightsFor, emptyWeights, weightsFromMeasured } from './catalog/weights.ts'
import { defaultPriorities, useTrinketAbilities } from './catalog/abilities.ts'
import { potionUseAbility, POTIONS } from './catalog/potions.ts'
import {
  defaultClassSetup,
  loadSavedRoot,
  writeSavedRoot,
  type ClassSetup,
  type SettingsTab,
} from './persist.ts'
import { GearPanel } from './components/GearPanel.tsx'
import { ItemPickerModal } from './components/ItemPickerModal.tsx'
import { ItemTooltip } from './components/ItemTooltip.tsx'
import { RotationPanel } from './components/RotationPanel.tsx'
import { TalentTrees } from './components/TalentTrees.tsx'
import { SettingsPanel } from './components/SettingsPanel.tsx'
import { StatWeightsPanel } from './components/StatWeightsPanel.tsx'
import { SimTimeline } from './components/SimTimeline.tsx'
import { SimResultPanel } from './components/SimResultPanel.tsx'
import { CharacterStats } from './components/CharacterStats.tsx'
import { enabledBuffIds } from './catalog/buffs.ts'
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

type LowerPanel = SettingsTab | 'result' | 'timeline'
const SETTINGS_TABS: SettingsTab[] = ['gear', 'talents', 'rotation', 'settings', 'weights']

function isSettingsTab(panel: LowerPanel): panel is SettingsTab {
  return SETTINGS_TABS.includes(panel as SettingsTab)
}

function App() {
  const initial = useMemo(() => loadSavedRoot(), [])
  const initialClass = initial.byClass[initial.playerClass]
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [error, setError] = useState<string | null>(null)
  const [playerClass, setPlayerClass] = useState(initial.playerClass)
  const [race, setRace] = useState(initialClass.race)
  const [duration, setDuration] = useState(initial.duration)
  const [iterations, setIterations] = useState(initial.iterations)
  const [rngSeed, setRngSeed] = useState(initial.rngSeed)
  const [usedSeed, setUsedSeed] = useState<bigint | null>(null)
  const [running, setRunning] = useState(false)
  const [runProgress, setRunProgress] = useState('')
  const [result, setResult] = useState<SimResult | null>(null)
  const [fightLength, setFightLength] = useState(initial.duration)
  const [gearIds, setGearIds] = useState<Record<number, number>>(initialClass.gearIds)
  const [enchantIds, setEnchantIds] = useState<Record<number, number>>(initialClass.enchantIds ?? {})
  const [talentRanks, setTalentRanks] = useState(initialClass.talentRanks)
  const [raidBuffs, setRaidBuffs] = useState<Record<string, boolean>>(initialClass.raidBuffs)
  const [statWeights, setStatWeights] = useState<StatWeightsResult | null>(null)
  const [customEP, setCustomEP] = useState<Record<string, number>>(initialClass.customEP)
  const [abilityPriorities, setAbilityPriorities] = useState<Record<string, number>>(
    initialClass.abilityPriorities,
  )
  const [combatPotion, setCombatPotion] = useState(initialClass.combatPotion)
  const [mhWeaponTemp, setMhWeaponTemp] = useState(initialClass.mhWeaponTemp ?? '')
  const [ohWeaponTemp, setOhWeaponTemp] = useState(initialClass.ohWeaponTemp ?? '')
  const [stance, setStance] = useState(initialClass.stance)
  const [openSlot, setOpenSlot] = useState<ItemSlot | null>(null)
  const [lowerPanel, setLowerPanel] = useState<LowerPanel>(initial.tab)
  const byClassRef = useRef(initial.byClass)
  const lastSettingsTab = useRef<SettingsTab>(initial.tab)
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(
    null,
  )
  const snapshotRef = useRef<ClassSetup>(initialClass)

  const hoveredItem = hover ? ITEMS.find((item) => item.id === hover.id) : null
  const classLabel = CLASSES.find((entry) => entry.value === playerClass)?.label ?? 'Player'
  const busy = running || engineState !== 'ready'
  const sheet = useMemo(
    () =>
      computeSheetStats({
        playerClass,
        race,
        gearIds,
        enchantIds,
        raidBuffs,
        mhWeaponTemp,
        ohWeaponTemp,
        talents: talentRanks,
        abilityPriorities,
        stance,
      }),
    [playerClass, race, gearIds, enchantIds, raidBuffs, mhWeaponTemp, ohWeaponTemp, talentRanks, abilityPriorities, stance],
  )

  useEffect(() => {
    initEngine()
      .then(() => setEngineState('ready'))
      .catch((err: unknown) => {
        setEngineState('error')
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  const currentClassSetup: ClassSetup = {
    race,
    stance,
    gearIds,
    enchantIds,
    talentRanks,
    raidBuffs,
    mhWeaponTemp,
    ohWeaponTemp,
    abilityPriorities,
    combatPotion,
    customEP,
  }
  snapshotRef.current = currentClassSetup

  function applyClassSetup(setup: ClassSetup) {
    setRace(setup.race)
    setStance(setup.stance)
    setGearIds(setup.gearIds)
    setEnchantIds(setup.enchantIds ?? {})
    setTalentRanks(setup.talentRanks)
    setRaidBuffs(setup.raidBuffs)
    setMhWeaponTemp(setup.mhWeaponTemp ?? '')
    setOhWeaponTemp(setup.ohWeaponTemp ?? '')
    setAbilityPriorities(setup.abilityPriorities)
    setCombatPotion(setup.combatPotion)
    setCustomEP(setup.customEP)
  }

  function changeClass(next: Class) {
    if (next === playerClass) {
      return
    }
    byClassRef.current = { ...byClassRef.current, [playerClass]: snapshotRef.current }
    setPlayerClass(next)
    applyClassSetup(byClassRef.current[next] ?? defaultClassSetup(next, snapshotRef.current.race))
    setResult(null)
    setStatWeights(null)
    setLowerPanel('gear')
  }

  useEffect(() => {
    if (isSettingsTab(lowerPanel)) {
      lastSettingsTab.current = lowerPanel
    }
    const timer = window.setTimeout(() => {
      byClassRef.current = { ...byClassRef.current, [playerClass]: snapshotRef.current }
      writeSavedRoot({
        v: 1,
        playerClass,
        duration,
        iterations,
        rngSeed,
        tab: lastSettingsTab.current,
        byClass: byClassRef.current,
      })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [
    playerClass,
    race,
    duration,
    iterations,
    rngSeed,
    lowerPanel,
    gearIds,
    enchantIds,
    talentRanks,
    raidBuffs,
    mhWeaponTemp,
    ohWeaponTemp,
    abilityPriorities,
    combatPotion,
    customEP,
    stance,
  ])

  useEffect(() => {
    setAbilityPriorities((current) => {
      let changed = false
      const next = { ...current }
      for (const ability of [
        ...useTrinketAbilities(gearIds),
        potionUseAbility(POTIONS.find((item) => item.id === combatPotion) ?? undefined),
      ]) {
        if (!ability) {
          continue
        }
        if (next[ability.id] === undefined) {
          next[ability.id] = ability.priority
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [gearIds, combatPotion])

  function selectedItems() {
    return Object.entries(gearIds).flatMap(([slotKey, id]) => {
      if (!id) {
        return []
      }
      const item = ITEMS.find((entry) => entry.id === id)
      if (!item) {
        return []
      }
      return [{ ...item, slot: Number(slotKey) as ItemSlot, enchantId: enchantIds[Number(slotKey)] ?? 0 }]
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
    setEnchantIds((current) => {
      const next = { ...current }
      if (!id) {
        next[slot] = 0
      }
      if (slot === ItemSlot.MAIN_HAND) {
        const item = ITEMS.find((entry) => entry.id === id)
        if (item?.hand === '2h') {
          next[ItemSlot.OFF_HAND] = 0
        }
      }
      return next
    })
  }

  function onHoverItem(itemId: number, event: MouseEvent) {
    setHover({ id: itemId, x: event.clientX, y: event.clientY })
  }

  async function onRun() {
    setRunning(true)
    setRunProgress(`0 / ${iterations}`)
    setError(null)
    setResult(null)
    try {
      const runSeed = rngSeed > 0 ? BigInt(rngSeed) : randomSimSeed()
      setUsedSeed(runSeed)
      const next = await runSim(
        {
          class: playerClass,
          race,
          durationSeconds: duration,
          iterations,
          seed: runSeed,
          items: selectedItems(),
          talents: talentRanks,
          raidBuffs: enabledBuffIds(raidBuffs),
          abilityPriorities: { ...defaultPriorities(playerClass, race, gearIds, combatPotion), ...abilityPriorities },
          stance,
          combatPotion,
          mhWeaponTemp,
          ohWeaponTemp,
        },
        (partial, done, total) => {
          setResult(partial)
          setFightLength(duration)
          setRunProgress(`${done} / ${total}`)
          setLowerPanel('result')
        },
      )
      setResult(next)
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
    try {
      const next = await runStatWeights({
        class: playerClass,
        race,
        durationSeconds: duration,
        iterations,
        seed: 1n,
        items: selectedItems(),
        talents: talentRanks,
        raidBuffs: enabledBuffIds(raidBuffs),
        abilityPriorities: { ...defaultPriorities(playerClass, race, gearIds, combatPotion), ...abilityPriorities },
        stance,
        combatPotion,
        mhWeaponTemp,
        ohWeaponTemp,
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
    <div className="app" data-class={playerClass}>
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
            <div className={`rail-dps ${running && result ? 'running' : ''} ${result ? '' : 'empty'}`}>
              <strong>{result ? result.dpsMean.toFixed(1) : '0.0'}</strong>
              <span>
                {result
                  ? `DPS ± ${result.dpsStdev.toFixed(1)}${running ? ` · ${result.iterations}/${iterations}` : ''}`
                  : 'DPS ± 0.0'}
              </span>
            </div>
          </section>
          <section className="rail-card rail-character">
            <h2>Character</h2>
            <label>
              Class
              <select
                value={playerClass}
                onChange={(e) => changeClass(Number(e.target.value) as Class)}
              >
                {CLASSES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="char-stats-wrap">
              <CharacterStats stats={sheet} playerClass={playerClass} />
            </div>
          </section>
          {error ? <p className="error">{error}</p> : null}
        </aside>

        <section className="main">
          <nav className="tabs">
            {(
              [
                ['gear', 'Gear'],
                ['talents', 'Talents'],
                ['rotation', 'Rotation'],
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
              <SimResultPanel result={result} seed={usedSeed} />
            ) : lowerPanel === 'settings' ? (
              <SettingsPanel
                playerClass={playerClass}
                race={race}
                stance={stance}
                duration={duration}
                iterations={iterations}
                rngSeed={rngSeed}
                selected={raidBuffs}
                onRace={setRace}
                onStance={setStance}
                onCombatPotion={setCombatPotion}
                onDuration={setDuration}
                onIterations={setIterations}
                onRngSeed={setRngSeed}
                onChange={setRaidBuffs}
                combatPotion={combatPotion}
                mhWeaponTemp={mhWeaponTemp}
                ohWeaponTemp={ohWeaponTemp}
                gearIds={gearIds}
                onMhWeaponTemp={setMhWeaponTemp}
                onOhWeaponTemp={setOhWeaponTemp}
              />
            ) : lowerPanel === 'weights' ? (
              <StatWeightsPanel
                playerClass={playerClass}
                result={statWeights}
                ep={customEP}
                running={busy}
                onCalculate={onCalcWeights}
                onChange={(id, value) => setCustomEP((current) => ({ ...current, [id]: value }))}
                onResetMeasured={() => {
                  if (statWeights) {
                    setCustomEP(weightsFromMeasured(statWeights.weights))
                    return
                  }
                  setCustomEP(defaultWeightsFor(playerClass))
                }}
                onZero={() => setCustomEP(emptyWeights())}
              />
            ) : lowerPanel === 'rotation' ? (
              <RotationPanel
                playerClass={playerClass}
                race={race}
                gearIds={gearIds}
                combatPotion={combatPotion}
                priorities={{ ...defaultPriorities(playerClass, race, gearIds, combatPotion), ...abilityPriorities }}
                onChange={(id, value) =>
                  setAbilityPriorities((current) => ({ ...current, [id]: value }))
                }
                onReset={() => setAbilityPriorities(defaultPriorities(playerClass, race, gearIds, combatPotion))}
              />
            ) : lowerPanel === 'gear' ? (
              <GearPanel
                gearIds={gearIds}
                enchantIds={enchantIds}
                onOpenSlot={(slot) => {
                  setHover(null)
                  setOpenSlot(slot)
                }}
                onClearGear={() => {
                  setGearIds({})
                  setEnchantIds({})
                }}
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
          enchantId={enchantIds[openSlot] ?? 0}
          playerClass={playerClass}
          statEP={customEP}
          onSelect={(id) => {
            setSlot(openSlot, id)
          }}
          onSelectEnchant={(id) => {
            if (!(gearIds[openSlot] ?? 0) && id) {
              return
            }
            setEnchantIds((current) => ({ ...current, [openSlot]: id }))
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
