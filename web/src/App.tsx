import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Class, ItemSlot, type SimResult, type StatWeightsResult } from './gen/wowfsim/sim_pb.ts'
import { initEngine, runSim, runStatWeights, randomSimSeed } from './sim/engine'
import { ITEMS, loadCatalog } from './catalog/era.ts'
import { defaultWeightsFor, emptyWeights, weightsFromMeasured } from './catalog/weights.ts'
import { defaultPriorities, defaultExecutePriorities, useTrinketAbilities } from './catalog/abilities.ts'
import { potionUseAbility, POTIONS } from './catalog/potions.ts'
import {
  defaultClassSetup,
  loadSavedRoot,
  writeSavedRoot,
  snapshotGearSet,
  cloneSlotMap,
  nextGearSetName,
  baselineFromResult,
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
import { SimResultPanel, DeltaText } from './components/SimResultPanel.tsx'
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
  const [liveDps, setLiveDps] = useState<{ mean: number; stdev: number; iterations: number } | null>(null)
  const [fightLength, setFightLength] = useState(initial.duration)
  const [gearIds, setGearIds] = useState<Record<number, number>>(initialClass.gearIds)
  const [enchantIds, setEnchantIds] = useState<Record<number, number>>(initialClass.enchantIds ?? {})
  const [gearSets, setGearSets] = useState(initialClass.gearSets ?? [])
  const [activeGearSetId, setActiveGearSetId] = useState(initialClass.activeGearSetId ?? '')
  const [talentRanks, setTalentRanks] = useState(initialClass.talentRanks)
  const [raidBuffs, setRaidBuffs] = useState<Record<string, boolean>>(initialClass.raidBuffs)
  const [statWeights, setStatWeights] = useState<StatWeightsResult | null>(null)
  const [customEP, setCustomEP] = useState<Record<string, number>>(initialClass.customEP)
  const [dpsBaseline, setDpsBaseline] = useState(initialClass.dpsBaseline ?? null)
  const [abilityPriorities, setAbilityPriorities] = useState<Record<string, number>>(
    initialClass.abilityPriorities,
  )
  const [executePriorities, setExecutePriorities] = useState<Record<string, number>>(
    initialClass.executePriorities ?? {},
  )
  const [combatPotion, setCombatPotion] = useState(initialClass.combatPotion)
  const [mhWeaponTemp, setMhWeaponTemp] = useState(initialClass.mhWeaponTemp ?? '')
  const [ohWeaponTemp, setOhWeaponTemp] = useState(initialClass.ohWeaponTemp ?? '')
  const [stance, setStance] = useState(initialClass.stance)
  const [openSlot, setOpenSlot] = useState<ItemSlot | null>(null)
  const [lowerPanel, setLowerPanel] = useState<LowerPanel>(initial.tab)
  const byClassRef = useRef(initial.byClass)
  const [catalogReady, setCatalogReady] = useState(false)
  const lastSettingsTab = useRef<SettingsTab>(initial.tab)
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(
    null,
  )
  const snapshotRef = useRef<ClassSetup>(initialClass)

  const hoveredItem = hover ? ITEMS.find((item) => item.id === hover.id) : null
  const equippedIds = Object.values(gearIds).filter(Boolean)
  const classLabel = CLASSES.find((entry) => entry.value === playerClass)?.label ?? 'Player'
  const shownDps = liveDps ?? (result ? { mean: result.dpsMean, stdev: result.dpsStdev, iterations: result.iterations } : null)
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
    let cancelled = false
    initEngine()
      .then(() => {
        if (!cancelled) {
          setEngineState('ready')
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }
        setEngineState('error')
        setError(err instanceof Error ? err.message : String(err))
      })
    loadCatalog()
      .then(() => {
        if (cancelled) {
          return
        }
        const saved = loadSavedRoot()
        setPlayerClass(saved.playerClass)
        setDuration(saved.duration)
        setIterations(saved.iterations)
        setRngSeed(saved.rngSeed)
        setFightLength(saved.duration)
        lastSettingsTab.current = saved.tab
        byClassRef.current = saved.byClass
        applyClassSetup(saved.byClass[saved.playerClass])
        setCatalogReady(true)
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }
        setEngineState('error')
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const currentClassSetup: ClassSetup = {
    race,
    stance,
    gearIds,
    enchantIds,
    gearSets,
    activeGearSetId,
    talentRanks,
    raidBuffs,
    mhWeaponTemp,
    ohWeaponTemp,
    abilityPriorities,
    executePriorities,
    combatPotion,
    customEP,
    dpsBaseline,
  }
  snapshotRef.current = currentClassSetup

  function applyClassSetup(setup: ClassSetup) {
    setRace(setup.race)
    setStance(setup.stance)
    setGearIds(setup.gearIds)
    setEnchantIds(setup.enchantIds ?? {})
    setGearSets(setup.gearSets ?? [])
    setActiveGearSetId(setup.activeGearSetId ?? '')
    setTalentRanks(setup.talentRanks)
    setRaidBuffs(setup.raidBuffs)
    setMhWeaponTemp(setup.mhWeaponTemp ?? '')
    setOhWeaponTemp(setup.ohWeaponTemp ?? '')
    setAbilityPriorities(setup.abilityPriorities)
    setExecutePriorities(setup.executePriorities ?? {})
    setCombatPotion(setup.combatPotion)
    setCustomEP(setup.customEP)
    setDpsBaseline(setup.dpsBaseline ?? null)
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
    if (!catalogReady) {
      return
    }
    if (isSettingsTab(lowerPanel)) {
      lastSettingsTab.current = lowerPanel
    }
    const timer = window.setTimeout(() => {
      byClassRef.current = { ...byClassRef.current, [playerClass]: snapshotRef.current }
      writeSavedRoot({
        v: 2,
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
    gearSets,
    activeGearSetId,
    talentRanks,
    raidBuffs,
    mhWeaponTemp,
    ohWeaponTemp,
    abilityPriorities,
    executePriorities,
    combatPotion,
    customEP,
    stance,
    dpsBaseline,
    catalogReady,
  ])

  useEffect(() => {
    const extras = [
      ...useTrinketAbilities(gearIds),
      potionUseAbility(POTIONS.find((item) => item.id === combatPotion) ?? undefined),
    ]
    function seed(current: Record<string, number>) {
      let changed = false
      const next = { ...current }
      for (const ability of extras) {
        if (!ability) {
          continue
        }
        if (next[ability.id] === undefined) {
          next[ability.id] = ability.priority
          changed = true
        }
      }
      return changed ? next : current
    }
    setAbilityPriorities(seed)
    setExecutePriorities(seed)
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

  function loadGearSet(id: string) {
    if (!id) {
      setActiveGearSetId('')
      return
    }
    const set = gearSets.find((entry) => entry.id === id)
    if (!set) {
      return
    }
    setGearIds(cloneSlotMap(set.gearIds))
    setEnchantIds(cloneSlotMap(set.enchantIds))
    setActiveGearSetId(set.id)
  }

  function saveGearSet(name: string) {
    if (activeGearSetId) {
      setGearSets((sets) =>
        sets.map((entry) =>
          entry.id === activeGearSetId ? snapshotGearSet(name, gearIds, enchantIds, entry.id) : entry,
        ),
      )
      return
    }
    const next = snapshotGearSet(name || nextGearSetName(gearSets), gearIds, enchantIds)
    setGearSets((sets) => [...sets, next])
    setActiveGearSetId(next.id)
  }

  function saveGearSetAs(name: string) {
    const label = name.trim() && gearSets.some((entry) => entry.name === name.trim())
      ? `${name.trim()} copy`
      : name
    const next = snapshotGearSet(label || nextGearSetName(gearSets), gearIds, enchantIds)
    setGearSets((sets) => [...sets, next])
    setActiveGearSetId(next.id)
  }

  function deleteGearSet() {
    if (!activeGearSetId) {
      return
    }
    setGearSets((sets) => sets.filter((entry) => entry.id !== activeGearSetId))
    setActiveGearSetId('')
  }

  async function onRun() {
    setRunning(true)
    setRunProgress(`0 / ${iterations}`)
    setError(null)
    setLiveDps(null)
    setLowerPanel('result')
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
          executeAbilityPriorities: {
            ...defaultExecutePriorities(playerClass, race, gearIds, combatPotion),
            ...executePriorities,
          },
          stance,
          combatPotion,
          mhWeaponTemp,
          ohWeaponTemp,
        },
        (update) => {
          setLiveDps({ mean: update.dpsMean, stdev: update.dpsStdev, iterations: update.done })
          setRunProgress(`${update.done} / ${update.total}`)
          if (update.result) {
            setResult(update.result)
            setFightLength(duration)
          }
        },
      )
      setResult(next)
      setLiveDps(null)
      setFightLength(duration)
      setLowerPanel('result')
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
        executeAbilityPriorities: {
          ...defaultExecutePriorities(playerClass, race, gearIds, combatPotion),
          ...executePriorities,
        },
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
            <div className={`rail-dps ${running && shownDps ? 'running' : ''} ${shownDps ? '' : 'empty'}`}>
              <strong>{shownDps ? shownDps.mean.toFixed(1) : '0.0'}</strong>
              <span>
                {shownDps
                  ? `DPS ± ${shownDps.stdev.toFixed(1)}${running ? ` · ${shownDps.iterations}/${iterations}` : ''}`
                  : 'DPS ± 0.0'}
              </span>
              {shownDps && dpsBaseline ? (
                <DeltaText value={shownDps.mean - dpsBaseline.dpsMean} base={dpsBaseline.dpsMean} />
              ) : null}
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
              disabled={!result && !running}
              onClick={() => setLowerPanel('result')}
            >
              Results
            </button>
            <button
              type="button"
              className={lowerPanel === 'timeline' ? 'active' : ''}
              disabled={!result && !running}
              onClick={() => setLowerPanel('timeline')}
            >
              Timeline
            </button>
          </nav>

          <div className="main-body">
            {lowerPanel === 'timeline' ? (
              result ? <SimTimeline result={result} durationSeconds={fightLength} /> : null
            ) : lowerPanel === 'result' ? (
              result ? (
                <SimResultPanel
                  result={result}
                  seed={usedSeed}
                  live={running}
                  baseline={dpsBaseline}
                  onSaveBaseline={() => setDpsBaseline(baselineFromResult(result))}
                  onClearBaseline={() => setDpsBaseline(null)}
                />
              ) : (
                <section className="timeline-frame result-panel">
                  <header className="talent-frame-head">
                    <h2>Result</h2>
                  </header>
                  <p className="dps-meta">{running ? 'Simulating…' : 'Run a sim to see a breakdown.'}</p>
                </section>
              )
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
                talentRanks={talentRanks}
                rotation={{
                  priorities: {
                    ...defaultPriorities(playerClass, race, gearIds, combatPotion),
                    ...abilityPriorities,
                  },
                  onChange: (id, value) =>
                    setAbilityPriorities((current) => {
                      if (current[id] === value) {
                        return current
                      }
                      return { ...current, [id]: value }
                    }),
                  onReorder: (next) => setAbilityPriorities((current) => ({ ...current, ...next })),
                  onReset: () =>
                    setAbilityPriorities(defaultPriorities(playerClass, race, gearIds, combatPotion)),
                }}
                execute={{
                  priorities: {
                    ...defaultExecutePriorities(playerClass, race, gearIds, combatPotion),
                    ...executePriorities,
                  },
                  onChange: (id, value) =>
                    setExecutePriorities((current) => {
                      if (current[id] === value) {
                        return current
                      }
                      return { ...current, [id]: value }
                    }),
                  onReorder: (next) => setExecutePriorities((current) => ({ ...current, ...next })),
                  onReset: () =>
                    setExecutePriorities(defaultExecutePriorities(playerClass, race, gearIds, combatPotion)),
                }}
              />
            ) : lowerPanel === 'gear' ? (
              <GearPanel
                gearIds={gearIds}
                enchantIds={enchantIds}
                gearSets={gearSets}
                activeGearSetId={activeGearSetId}
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
                onLoadSet={loadGearSet}
                onSaveSet={saveGearSet}
                onSaveSetAs={saveGearSetAs}
                onDeleteSet={deleteGearSet}
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
          gearIds={gearIds}
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
        <ItemTooltip item={hoveredItem} x={hover?.x ?? 0} y={hover?.y ?? 0} equippedIds={equippedIds} />
      ) : null}
    </div>
  )
}

export default App
