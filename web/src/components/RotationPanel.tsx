import { useRef, useState, type ReactNode } from 'react'
import { iconUrl } from '../catalog/era.ts'
import { abilityUnlocked, rotationAbilities, type CatalogAbility } from '../catalog/abilities.ts'
import type { Class } from '../gen/wowfsim/sim_pb.ts'
import type { TalentRanks } from '../sim/engine.ts'

type Phase = 'rotation' | 'execute'

type ListHandlers = {
  priorities: Record<string, number>
  onChange: (id: string, priority: number) => void
  onReorder: (next: Record<string, number>) => void
  onReset: () => void
}

type Props = {
  playerClass: Class
  race: number
  gearIds?: Record<number, number>
  combatPotion?: number
  talentRanks?: TalentRanks
  rotation: ListHandlers
  execute: ListHandlers
}

const COOLDOWN_KINDS = new Set(['buff', 'opener', 'potion', 'trinket', 'use'])

function isCooldown(ability: CatalogAbility) {
  return COOLDOWN_KINDS.has(ability.kind ?? '')
}

function hint(ability: CatalogAbility) {
  const bits = [ability.kind || 'ability']
  if (ability.gcd === false) {
    bits.push('off GCD')
  }
  if (ability.resource && ability.cost) {
    bits.push(`${ability.cost} ${ability.resource}`)
  }
  if (ability.cooldown) {
    bits.push(`${ability.cooldown}s CD`)
  }
  if (ability.requiresTalent) {
    bits.push('talent')
  }
  return bits.join(' · ')
}

function prioOf(ability: CatalogAbility, priorities: Record<string, number>) {
  return priorities[ability.id] ?? ability.priority
}

function moveItem<T>(list: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list
  }
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function prioritiesFromMove(
  list: CatalogAbility[],
  from: number,
  to: number,
  priorities: Record<string, number>,
) {
  const enabledCount = list.filter((ability) => prioOf(ability, priorities) > 0).length
  const moved = list[from]
  const nextList = moveItem(list, from, to)
  const dest = nextList.findIndex((ability) => ability.id === moved.id)
  const wasOn = prioOf(moved, priorities) > 0
  let keepOn = enabledCount
  if (wasOn && dest >= enabledCount) {
    keepOn = enabledCount - 1
  } else if (!wasOn && dest < enabledCount) {
    keepOn = enabledCount + 1
  }
  const values = nextList
    .map((ability) => prioOf(ability, priorities))
    .filter((value) => value > 0)
    .sort((a, b) => b - a)
  const next: Record<string, number> = {}
  let rank = 0
  nextList.forEach((ability, index) => {
    if (index < keepOn) {
      next[ability.id] = values[rank] ?? 1000 - rank * 10
      rank += 1
    } else {
      next[ability.id] = 0
    }
  })
  return next
}

function AbilityPriorityList({
  abilities,
  priorities,
  talentRanks,
  onChange,
  onReorder,
}: {
  abilities: CatalogAbility[]
  priorities: Record<string, number>
  talentRanks?: TalentRanks
  onChange: (id: string, priority: number) => void
  onReorder: (next: Record<string, number>) => void
}) {
  const ordered = [...abilities].sort(
    (a, b) => prioOf(b, priorities) - prioOf(a, priorities) || a.name.localeCompare(b.name),
  )
  const dragFrom = useRef<number | null>(null)
  const insertAt = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [gap, setGap] = useState<number | null>(null)

  function commitMove(from: number, to: number) {
    if (from === to) {
      return
    }
    onReorder(prioritiesFromMove(ordered, from, to, priorities))
  }

  function clearDrag() {
    dragFrom.current = null
    insertAt.current = null
    setDragging(null)
    setGap(null)
  }

  function setInsert(at: number) {
    if (insertAt.current === at) {
      return
    }
    insertAt.current = at
    setGap(at)
  }

  function dropToIndex(from: number, at: number) {
    if (from < at) {
      return at - 1
    }
    return at
  }

  if (!ordered.length) {
    return <p className="rotation-empty">None for this character.</p>
  }

  return (
    <ol className="rotation-list">
      {ordered.map((ability, index) => {
        const priority = prioOf(ability, priorities)
        const locked = !abilityUnlocked(ability, talentRanks)
        const dropBefore = dragging != null && gap === index && dragging !== index
        const dropAfter = dragging != null && gap === ordered.length && index === ordered.length - 1
        return (
          <li
            key={ability.id}
            draggable
            className={`rotation-row${priority <= 0 ? ' disabled' : ''}${locked ? ' locked' : ''}${dragging === index ? ' dragging' : ''}${dropBefore ? ' drop-before' : ''}${dropAfter ? ' drop-after' : ''}`}
            onDragStart={(event) => {
              const target = event.target as HTMLElement
              if (target.closest('input, button, label')) {
                event.preventDefault()
                return
              }
              dragFrom.current = index
              insertAt.current = index
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', ability.id)
              setDragging(index)
              setGap(index)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const rect = event.currentTarget.getBoundingClientRect()
              const after = event.clientY > rect.top + rect.height / 2
              setInsert(after ? index + 1 : index)
            }}
            onDrop={(event) => {
              event.preventDefault()
              const from = dragFrom.current
              const at = insertAt.current
              if (from != null && at != null) {
                commitMove(from, dropToIndex(from, at))
              }
              clearDrag()
            }}
            onDragEnd={clearDrag}
          >
            <span className="rotation-order">{index + 1}</span>
            <div className="rotation-move">
              <button
                type="button"
                aria-label={`Move ${ability.name} up`}
                disabled={index === 0}
                onClick={() => commitMove(index, index - 1)}
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`Move ${ability.name} down`}
                disabled={index === ordered.length - 1}
                onClick={() => commitMove(index, index + 1)}
              >
                ▼
              </button>
            </div>
            <img src={iconUrl(ability.icon)} alt="" draggable={false} />
            <div>
              <strong>{ability.name}</strong>
              <span>{hint(ability)}</span>
            </div>
            <label>
              Priority
              <input
                type="number"
                step="1"
                value={Number.isFinite(priority) ? priority : 0}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (!Number.isFinite(next)) {
                    return
                  }
                  onChange(ability.id, next)
                }}
              />
            </label>
          </li>
        )
      })}
    </ol>
  )
}

function Fold({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rotation-fold">
      <button type="button" className="rotation-fold-head" aria-expanded={open} onClick={onToggle}>
        <span>
          {open ? '▾' : '▸'} {title}
        </span>
        <span className="rotation-fold-count">{count}</span>
      </button>
      {open ? <div className="rotation-fold-body">{children}</div> : null}
    </div>
  )
}

export function RotationPanel({
  playerClass,
  race,
  gearIds,
  combatPotion,
  talentRanks,
  rotation,
  execute,
}: Props) {
  const [phase, setPhase] = useState<Phase>('rotation')
  const [spellsOpen, setSpellsOpen] = useState(true)
  const [cooldownsOpen, setCooldownsOpen] = useState(false)
  const abilities = rotationAbilities(playerClass, race, gearIds, combatPotion)
  const spells = abilities.filter((ability) => !isCooldown(ability))
  const cooldowns = abilities.filter(isCooldown)
  const active = phase === 'execute' ? execute : rotation

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Rotation</h2>
          <p className="rotation-help">
            {phase === 'execute'
              ? 'Used from 20% health. This list replaces Rotation during execute.'
              : 'Higher in the list is tried first. Drag a row to reorder, then Simulate.'}
          </p>
        </div>
        <button type="button" className="btn" onClick={active.onReset}>
          Reset defaults
        </button>
      </header>
      <div className="rotation-card">
        <div className="rotation-switch" role="tablist" aria-label="Rotation phase">
          <button
            type="button"
            role="tab"
            aria-selected={phase === 'rotation'}
            className={phase === 'rotation' ? 'active' : ''}
            onClick={() => setPhase('rotation')}
          >
            Rotation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={phase === 'execute'}
            className={phase === 'execute' ? 'active' : ''}
            onClick={() => setPhase('execute')}
          >
            Execute
          </button>
        </div>
        <Fold
          title="Spells"
          count={spells.length}
          open={spellsOpen}
          onToggle={() => setSpellsOpen((open) => !open)}
        >
          <AbilityPriorityList
            abilities={spells}
            priorities={active.priorities}
            talentRanks={talentRanks}
            onChange={active.onChange}
            onReorder={active.onReorder}
          />
        </Fold>
        <Fold
          title="Cooldowns"
          count={cooldowns.length}
          open={cooldownsOpen}
          onToggle={() => setCooldownsOpen((open) => !open)}
        >
          <AbilityPriorityList
            abilities={cooldowns}
            priorities={active.priorities}
            talentRanks={talentRanks}
            onChange={active.onChange}
            onReorder={active.onReorder}
          />
        </Fold>
      </div>
    </section>
  )
}
