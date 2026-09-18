import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { SimResult, TimelineEvent } from '../gen/wowfsim/sim_pb.ts'
import { iconUrl } from '../catalog/era.ts'
import type { CatalogAbility } from '../catalog/abilities.ts'
import { SpellHover, SpellTooltip } from './SpellTooltip.tsx'

const PX_PER_SEC = 28
const LANE_INSET = 28
const MIN_TRACK = 720
const RESOURCE_H = 44
const RESOURCE_PAD = 3
const RESOURCE_MAX = 100

const RESOURCE_ICON: Record<string, string> = {
  rage: 'ability_racial_bloodrage',
  energy: 'ability_rogue_sprint',
}

type Lane = {
  name: string
  icon: string
  events: TimelineEvent[]
}

type Props = {
  result: SimResult
  durationSeconds: number
}

export function SimTimeline({ result, durationSeconds }: Props) {
  const events = result.timeline ?? []
  const end = Math.max(durationSeconds, durationFrom(result), 1)
  const trackPx = Math.max(MIN_TRACK, Math.round(end * PX_PER_SEC))
  const iconByName = new Map<string, string>()
  for (const event of events) {
    if (event.icon && !iconByName.has(event.name)) {
      iconByName.set(event.name, event.icon)
    }
  }
  for (const action of result.actions) {
    if (action.icon && !iconByName.has(action.name)) {
      iconByName.set(action.name, action.icon)
    }
  }
  const { damage, buffs } = groupLanes(events, iconByName)
  const kind = events.find((event) => event.resourceKind)?.resourceKind ?? ''
  const ticks = axisTicks(end)
  const [hover, setHover] = useState<{ ability: CatalogAbility; x: number; y: number } | null>(null)

  function onSpellHover(ability: CatalogAbility, event: MouseEvent) {
    setHover({ ability, x: event.clientX, y: event.clientY })
  }

  return (
    <section className="timeline-frame">
      <header className="talent-frame-head">
        <h2>Timeline</h2>
        <p>
          First iteration · {events.length} events · {end.toFixed(0)}s · scroll
          horizontally
        </p>
      </header>
      <p className="hint">
        Combat log from the first fight in this run. Damage rows show hits and DoT ticks;
        buff rows show how long each aura lasted.
      </p>
      <div className="wcl">
        <div className="wcl-axis">
          <span className="wcl-spell wcl-spacer" />
          <span className="wcl-gap" />
          <div className="wcl-axis-track" style={{ width: trackPx }}>
            {ticks.map((tick) => (
              <span
                key={tick}
                className="wcl-tick"
                style={{ left: `${laneX(tick, end, trackPx)}px` }}
              >
                {tick}s
              </span>
            ))}
          </div>
        </div>
        {kind ? (
          <div className="wcl-row wcl-resource">
            <img
              className="wcl-spell"
              src={iconUrl(RESOURCE_ICON[kind] ?? 'inv_misc_questionmark')}
              alt={kind}
              title={kindLabel(kind)}
              draggable={false}
            />
            <span className="wcl-gap wcl-resource-caption">{kindLabel(kind)}</span>
            <svg
              className="wcl-lane wcl-resource-lane"
              width={trackPx}
              height={RESOURCE_H}
              viewBox={`0 0 ${trackPx} ${RESOURCE_H}`}
              aria-label={`${kindLabel(kind)} over the fight`}
            >
              <line
                className="wcl-resource-mid"
                x1={LANE_INSET}
                x2={trackPx - LANE_INSET}
                y1={resourceY(50)}
                y2={resourceY(50)}
              />
              <path
                className={`wcl-resource-fill ${kind}`}
                d={resourceFillPath(events, end, trackPx)}
              />
              <path
                className={`wcl-resource-line ${kind}`}
                d={resourceLinePath(events, end, trackPx)}
                fill="none"
              />
            </svg>
          </div>
        ) : null}
        <LaneSection
          title="Damage"
          lanes={damage}
          end={end}
          trackPx={trackPx}
          showTicks
          onSpellHover={onSpellHover}
          onSpellLeave={() => setHover(null)}
        />
        <LaneSection
          title="Buffs"
          lanes={buffs}
          end={end}
          trackPx={trackPx}
          showTicks={false}
          onSpellHover={onSpellHover}
          onSpellLeave={() => setHover(null)}
        />
      </div>
      {hover ? <SpellTooltip ability={hover.ability} x={hover.x} y={hover.y} /> : null}
    </section>
  )
}

function LaneSection({
  title,
  lanes,
  end,
  trackPx,
  showTicks,
  onSpellHover,
  onSpellLeave,
}: {
  title: string
  lanes: Lane[]
  end: number
  trackPx: number
  showTicks: boolean
  onSpellHover: (ability: CatalogAbility, event: MouseEvent) => void
  onSpellLeave: () => void
}) {
  if (!lanes.length) {
    return null
  }
  return (
    <>
      <div className="wcl-section">
        <span className="wcl-spell wcl-spacer" />
        <span className="wcl-gap" />
        <p className="wcl-section-title">{title}</p>
      </div>
      {lanes.map((lane) => (
        <div key={`${title}-${lane.name}`} className="wcl-row">
          <SpellHover
            names={[lane.name]}
            className="wcl-spell"
            onHover={onSpellHover}
            onLeave={onSpellLeave}
          >
            <img src={iconUrl(lane.icon)} alt={lane.name} draggable={false} />
          </SpellHover>
          <span className="wcl-gap" />
          <div className="wcl-lane" style={{ width: trackPx }}>
            {lane.events
              .filter((event) => event.kind === 'dot' || event.kind === 'buff')
              .map((event, index) => {
                const left = laneX(event.timeSeconds, end, trackPx)
                const right = laneX(event.timeSeconds + event.durationSeconds, end, trackPx)
                return (
                  <span
                    key={`aura-${event.timeSeconds}-${index}`}
                    className={`wcl-aura ${event.kind}`}
                    title={castTitle(event)}
                    style={{ left: `${left}px`, width: `${Math.max(3, right - left)}px` }}
                  />
                )
              })}
            {(showTicks ? lane.events.filter(isPointEvent) : []).map((event, index) => (
              <img
                key={`${event.timeSeconds}-${index}`}
                className={`wcl-cast ${event.kind === 'tick' ? 'tick' : ''} ${event.crit ? 'crit' : ''} ${event.miss ? 'miss' : ''}`}
                src={iconUrl(event.icon || lane.icon)}
                alt=""
                draggable={false}
                title={castTitle(event)}
                style={{
                  left: `${laneX(event.timeSeconds, end, trackPx)}px`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function groupLanes(events: TimelineEvent[], iconByName: Map<string, string>) {
  const order: string[] = []
  const byName = new Map<string, TimelineEvent[]>()
  for (const event of events) {
    const list = byName.get(event.name)
    if (!list) {
      byName.set(event.name, [event])
      order.push(event.name)
    } else {
      list.push(event)
    }
  }
  const damage: Lane[] = []
  const buffs: Lane[] = []
  for (const name of order) {
    const laneEvents = byName.get(name) ?? []
    const lane = { name, icon: iconByName.get(name) ?? laneEvents[0]?.icon ?? '', events: laneEvents }
    if (isBuffLane(laneEvents)) {
      buffs.push(lane)
    } else {
      damage.push(lane)
    }
  }
  return { damage, buffs }
}

function isBuffLane(events: TimelineEvent[]) {
  const hasBuff = events.some((event) => event.kind === 'buff')
  const hasDamage =
    events.some((event) => event.kind === 'tick' || event.kind === 'dot' || event.kind === 'hit') ||
    events.some((event) => event.damage > 0)
  return hasBuff && !hasDamage
}

function isPointEvent(event: TimelineEvent) {
  return event.kind === 'hit' || event.kind === 'tick' || event.kind === ''
}

function kindLabel(kind: string) {
  return kind === 'rage' ? 'Rage' : kind === 'energy' ? 'Energy' : kind
}

function castTitle(event: TimelineEvent) {
  const bits = [
    `${event.timeSeconds.toFixed(2)}s`,
    event.name,
    event.kind === 'buff' || event.kind === 'dot'
      ? `${event.durationSeconds.toFixed(1)}s duration`
      : '',
    event.kind === 'tick' ? 'tick' : '',
    event.crit ? 'crit' : '',
    event.miss ? 'miss' : '',
    event.damage ? event.damage.toFixed(0) : '',
  ]
  if (event.resourceKind) {
    bits.push(`${Math.round(event.resource)} ${kindLabel(event.resourceKind).toLowerCase()}`)
  }
  return bits.filter(Boolean).join(' ')
}

function resourceY(value: number) {
  const usable = RESOURCE_H - RESOURCE_PAD * 2
  return RESOURCE_H - RESOURCE_PAD - (Math.min(Math.max(value, 0), RESOURCE_MAX) / RESOURCE_MAX) * usable
}

function resourceLinePath(events: TimelineEvent[], end: number, trackPx: number) {
  if (!events.length) {
    return ''
  }
  const x = (time: number) => laneX(time, end, trackPx)
  let prev = events[0].resource
  let d = `M ${x(0)} ${resourceY(prev)}`
  for (const event of events) {
    d += ` H ${x(event.timeSeconds)} V ${resourceY(event.resource)}`
    prev = event.resource
  }
  d += ` H ${x(end)}`
  return d
}

function resourceFillPath(events: TimelineEvent[], end: number, trackPx: number) {
  const line = resourceLinePath(events, end, trackPx)
  if (!line) {
    return ''
  }
  const x = (time: number) => laneX(time, end, trackPx)
  return `${line} V ${RESOURCE_H} H ${x(0)} Z`
}

function laneX(time: number, end: number, trackPx: number) {
  const usable = trackPx - LANE_INSET * 2
  return LANE_INSET + (time / end) * usable
}

function axisTicks(end: number) {
  const step = end <= 60 ? 10 : end <= 180 ? 15 : end <= 300 ? 30 : 60
  const ticks: number[] = [0]
  for (let t = step; t < end - step / 4; t += step) {
    ticks.push(t)
  }
  if (ticks[ticks.length - 1] !== end) {
    ticks.push(Number(end.toFixed(0)))
  }
  return ticks
}

function durationFrom(result: SimResult) {
  let max = 0
  for (const event of result.timeline ?? []) {
    const end = event.timeSeconds + (event.durationSeconds || 0)
    if (end > max) {
      max = end
    }
    if (event.timeSeconds > max) {
      max = event.timeSeconds
    }
  }
  return max
}
