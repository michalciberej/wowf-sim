import { useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { SimResult, TimelineEvent } from '../gen/wowfsim/sim_pb.ts'
import { iconUrl } from '../catalog/era.ts'
import { abilityForActionName, type CatalogAbility } from '../catalog/abilities.ts'
import { SpellHover, SpellTooltip } from './SpellTooltip.tsx'

const PX_PER_SEC = 28
const LANE_INSET = 10
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
  embedded?: boolean
}

export function SimTimeline({ result, durationSeconds, embedded }: Props) {
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
  const [eventHover, setEventHover] = useState<{ event: TimelineEvent; x: number; y: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startLeft: number; moved: boolean } | null>(
    null,
  )

  function onSpellHover(ability: CatalogAbility, event: MouseEvent) {
    setHover({ ability, x: event.clientX, y: event.clientY })
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }
    const node = scrollerRef.current
    if (!node) {
      return
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: node.scrollLeft,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const node = scrollerRef.current
    if (!drag || drag.pointerId !== event.pointerId || !node) {
      return
    }
    const dx = event.clientX - drag.startX
    if (!drag.moved && Math.abs(dx) < 4) {
      return
    }
    drag.moved = true
    if (!panning) {
      setPanning(true)
    }
    node.scrollLeft = drag.startLeft - dx
    event.preventDefault()
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
    setPanning(false)
  }

  return (
    <section className={embedded ? 'timeline-embed' : 'timeline-frame'}>
      {embedded ? (
        <p className="dps-meta">
          First iteration · {events.length} events · {end.toFixed(0)}s · drag to pan
        </p>
      ) : (
        <header className="talent-frame-head">
          <h2>Timeline</h2>
          <p>
            First iteration · {events.length} events · {end.toFixed(0)}s · drag
            to pan
          </p>
        </header>
      )}
      <div
        className={`wcl${panning ? ' panning' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="wcl-gutter">
          <div className="wcl-axis" />
          {kind ? (
            <div className="wcl-row wcl-resource">
              <img
                className="wcl-spell"
                src={iconUrl(RESOURCE_ICON[kind] ?? 'inv_misc_questionmark')}
                alt={kind}
                title={kindLabel(kind)}
                draggable={false}
              />
              <span className="wcl-resource-caption">{kindLabel(kind)}</span>
            </div>
          ) : null}
          <LaneGutter
            title="Damage"
            lanes={damage}
            onSpellHover={onSpellHover}
            onSpellLeave={() => setHover(null)}
          />
          <LaneGutter
            title="Buffs"
            lanes={buffs}
            onSpellHover={onSpellHover}
            onSpellLeave={() => setHover(null)}
          />
        </div>
        <div ref={scrollerRef} className="wcl-scroll">
          <div className="wcl-axis">
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
              <svg
                className="wcl-lane wcl-resource-lane"
                width={trackPx}
                height={RESOURCE_H}
                viewBox={`0 0 ${trackPx} ${RESOURCE_H}`}
                preserveAspectRatio="none"
                aria-label={`${kindLabel(kind)} over the fight`}
              >
                <line
                  className="wcl-resource-mid"
                  x1={0}
                  x2={trackPx}
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
          <LaneTracks
            title="Damage"
            lanes={damage}
            end={end}
            trackPx={trackPx}
            showTicks
            onEventHover={(event, x, y) => setEventHover({ event, x, y })}
            onEventLeave={() => setEventHover(null)}
          />
          <LaneTracks
            title="Buffs"
            lanes={buffs}
            end={end}
            trackPx={trackPx}
            showTicks={false}
            onEventHover={(event, x, y) => setEventHover({ event, x, y })}
            onEventLeave={() => setEventHover(null)}
          />
        </div>
      </div>
      {hover ? <SpellTooltip ability={hover.ability} x={hover.x} y={hover.y} /> : null}
      {eventHover ? <EventTooltip event={eventHover.event} x={eventHover.x} y={eventHover.y} /> : null}
    </section>
  )
}

function LaneGutter({
  title,
  lanes,
  onSpellHover,
  onSpellLeave,
}: {
  title: string
  lanes: Lane[]
  onSpellHover: (ability: CatalogAbility, event: MouseEvent) => void
  onSpellLeave: () => void
}) {
  if (!lanes.length) {
    return null
  }
  return (
    <>
      <div className="wcl-section">
        <span className="wcl-section-title">{title}</span>
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
        </div>
      ))}
    </>
  )
}

function LaneTracks({
  title,
  lanes,
  end,
  trackPx,
  showTicks,
  onEventHover,
  onEventLeave,
}: {
  title: string
  lanes: Lane[]
  end: number
  trackPx: number
  showTicks: boolean
  onEventHover: (event: TimelineEvent, x: number, y: number) => void
  onEventLeave: () => void
}) {
  if (!lanes.length) {
    return null
  }
  return (
    <>
      <div className="wcl-section" />
      {lanes.map((lane) => (
        <div key={`${title}-${lane.name}`} className="wcl-row">
          <div className="wcl-lane" style={{ width: trackPx }}>
            {lane.events
              .filter((event) => event.kind === 'dot' || event.kind === 'buff' || event.kind === 'cast')
              .map((event, index) => {
                const left = laneX(event.timeSeconds, end, trackPx)
                const right = laneX(event.timeSeconds + event.durationSeconds, end, trackPx)
                const isCast = event.kind === 'cast'
                return (
                  <span
                    key={`aura-${event.timeSeconds}-${index}`}
                    className={`wcl-aura ${event.kind}`}
                    style={{ left: `${left}px`, width: `${Math.max(3, right - left)}px` }}
                    onMouseEnter={(ev) => onEventHover(event, ev.clientX, ev.clientY)}
                    onMouseMove={(ev) => onEventHover(event, ev.clientX, ev.clientY)}
                    onMouseLeave={onEventLeave}
                  >
                    {isCast ? null : (
                      <img
                        className="wcl-aura-icon"
                        src={iconUrl(event.icon || lane.icon)}
                        alt=""
                        draggable={false}
                      />
                    )}
                  </span>
                )
              })}
            {(showTicks ? lane.events.filter(isPointEvent) : []).map((event, index) => {
              const landsAfterCast =
                event.kind === 'hit' && lane.events.some((other) => other.kind === 'cast')
              return (
              <img
                key={`${event.timeSeconds}-${index}`}
                className={`wcl-cast ${event.kind === 'tick' ? 'tick' : ''} ${event.crit ? 'crit' : ''} ${event.miss ? 'miss' : ''} ${landsAfterCast ? 'land' : ''}`}
                src={iconUrl(event.icon || lane.icon)}
                alt=""
                draggable={false}
                onMouseEnter={(ev) => onEventHover(event, ev.clientX, ev.clientY)}
                onMouseMove={(ev) => onEventHover(event, ev.clientX, ev.clientY)}
                onMouseLeave={onEventLeave}
                style={{
                  left: `${laneX(event.timeSeconds, end, trackPx)}px`,
                }}
              />
              )
            })}
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
    if (event.kind === 'resource') {
      continue
    }
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
    const lane = {
      name,
      icon: iconByName.get(name) ?? laneEvents[0]?.icon ?? '',
      events: collapseHits(laneEvents),
    }
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
    events.some((event) => event.kind === 'tick' || event.kind === 'dot' || event.kind === 'hit' || event.kind === 'cast') ||
    events.some((event) => event.damage > 0)
  return hasBuff && !hasDamage
}

function isPointEvent(event: TimelineEvent) {
  return event.kind === 'hit' || event.kind === 'tick' || event.kind === ''
}

function cloneEvent(event: TimelineEvent): TimelineEvent {
  return {
    $typeName: 'wowfsim.TimelineEvent',
    timeSeconds: event.timeSeconds,
    name: event.name,
    damage: event.damage,
    crit: event.crit,
    miss: event.miss,
    icon: event.icon,
    resourceKind: event.resourceKind,
    resource: event.resource,
    kind: event.kind,
    durationSeconds: event.durationSeconds,
    resourceBefore: event.resourceBefore,
    targetHits: event.targetHits,
    resourceCost: event.resourceCost,
    resourceGain: event.resourceGain,
    hitDamage: event.hitDamage ? [...event.hitDamage] : [],
    hitCrit: event.hitCrit ? [...event.hitCrit] : [],
    hitMiss: event.hitMiss ? [...event.hitMiss] : [],
  }
}

function collapseHits(events: TimelineEvent[]) {
  const out: TimelineEvent[] = []
  for (const event of events) {
    const prev = out[out.length - 1]
    if (
      prev &&
      isPointEvent(event) &&
      isPointEvent(prev) &&
      prev.name === event.name &&
      Math.abs(prev.timeSeconds - event.timeSeconds) < 1e-6
    ) {
      prev.damage += event.damage
      prev.targetHits = Math.max(prev.targetHits || 1, 1) + Math.max(event.targetHits || 1, 1)
      prev.crit = prev.crit || event.crit
      prev.miss = prev.miss && event.miss
      prev.hitDamage = [...(prev.hitDamage ?? []), ...(event.hitDamage ?? [])]
      prev.hitCrit = [...(prev.hitCrit ?? []), ...(event.hitCrit ?? [])]
      prev.hitMiss = [...(prev.hitMiss ?? []), ...(event.hitMiss ?? [])]
      continue
    }
    out.push(cloneEvent(event))
  }
  return out
}

function EventTooltip({ event, x, y }: { event: TimelineEvent; x: number; y: number }) {
  const left = Math.min(x + 16, window.innerWidth - 260)
  const top = Math.min(y + 12, window.innerHeight - 200)
  const lines = eventTooltipLines(event)
  return (
    <div className="wow-tooltip wcl-event-tip" style={{ left, top }} role="tooltip">
      {lines.map((line) => (
        <p key={line.kind} className={line.className}>
          {line.text}
        </p>
      ))}
    </div>
  )
}

function fmt(value: number, digits: number) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0'
}

function eventTooltipLines(event: TimelineEvent) {
  const lines: { kind: string; className: string; text: string }[] = [
    { kind: 'name', className: 'wow-tooltip-name', text: event.name || 'Unknown' },
    { kind: 'time', className: 'wow-tooltip-slot', text: eventMetaLine(event) },
  ]
  if (event.resourceKind) {
    const rage = Math.round(event.resourceBefore || 0)
    lines.push({
      kind: 'rage',
      className: 'wow-tooltip-stat',
      text: `${kindLabel(event.resourceKind)} at cast: ${rage}`,
    })
  }
  const costLine = eventCostLine(event)
  if (costLine) {
    lines.push({
      kind: 'cost',
      className: 'wow-tooltip-slot',
      text: costLine,
    })
  }
  const gainLine = eventGainLine(event)
  if (gainLine) {
    lines.push({
      kind: 'gain',
      className: 'wow-tooltip-stat',
      text: gainLine,
    })
  }
  if (event.kind === 'buff' || event.kind === 'dot') {
    lines.push({
      kind: 'dur',
      className: 'wow-tooltip-equip',
      text: `${fmt(event.durationSeconds, 1)}s duration`,
    })
  }
  if (event.kind === 'cast') {
    lines.push({
      kind: 'cast',
      className: 'wow-tooltip-equip',
      text: `${fmt(event.durationSeconds, 2)}s cast`,
    })
  }
  const damageLines = eventDamageLines(event)
  damageLines.forEach((line, index) => {
    lines.push({
      kind: `dmg-${index}`,
      className: line.className,
      text: line.text,
    })
  })
  return lines
}

function eventCostLine(event: TimelineEvent) {
  if (/off-hand$/i.test(event.name) || event.kind === 'tick' || event.kind === 'buff') {
    return ''
  }
  if (event.resourceCost > 0) {
    const kind = event.resourceKind ? kindLabel(event.resourceKind) : 'Rage'
    return `Cost: ${Math.round(event.resourceCost)} ${kind}`
  }
  const ability = abilityForActionName(event.name)
  if (!ability?.cost || !ability.resource) {
    return ''
  }
  return `Cost: ${ability.cost} ${ability.resource}`
}

function eventGainLine(event: TimelineEvent) {
  if (event.kind === 'tick' || event.kind === 'resource') {
    return ''
  }
  if (!(event.resourceGain > 0.5) || !event.resourceKind) {
    return ''
  }
  return `Generated: ${Math.round(event.resourceGain)} ${kindLabel(event.resourceKind)}`
}

function eventMetaLine(event: TimelineEvent) {
  const bits = [fmt(event.timeSeconds, 2) + 's']
  if (event.kind === 'tick') {
    bits.push('tick')
  }
  const hits = event.hitDamage?.length || event.targetHits || 0
  if (hits > 1) {
    bits.push(`${hits} targets`)
  } else if (event.miss) {
    bits.push('miss')
  } else if (event.crit) {
    bits.push('crit')
  }
  return bits.join(' · ')
}

function eventDamageLines(event: TimelineEvent) {
  const hits = event.hitDamage ?? []
  if (hits.length > 1) {
    const lines: { className: string; text: string }[] = [
      {
        className: 'wow-tooltip-equip',
        text: `${fmt(event.damage, 0)} combined (${hits.length} targets)`,
      },
    ]
    hits.forEach((dmg, i) => {
      const miss = event.hitMiss?.[i]
      const crit = event.hitCrit?.[i]
      let text = `Target ${i + 1}: ${fmt(dmg, 0)}`
      let className = 'wow-tooltip-bind'
      if (miss) {
        text = `Target ${i + 1}: Miss`
      } else if (crit) {
        text = `Target ${i + 1}: ${fmt(dmg, 0)} crit`
        className = 'wow-tooltip-use'
      }
      lines.push({ className, text })
    })
    return lines
  }
  if (event.miss && !(event.damage > 0)) {
    return [{ className: 'wow-tooltip-bind', text: 'Miss' }]
  }
  if (!(event.damage > 0) && event.targetHits <= 1) {
    return []
  }
  if (event.miss) {
    return [{ className: 'wow-tooltip-bind', text: 'Miss' }]
  }
  return [
    {
      className: event.crit ? 'wow-tooltip-use' : 'wow-tooltip-equip',
      text: fmt(event.damage, 0),
    },
  ]
}

function kindLabel(kind: string) {
  return kind === 'rage' ? 'Rage' : kind === 'energy' ? 'Energy' : kind
}

function resourceCap(events: TimelineEvent[]) {
  let max = RESOURCE_MAX
  for (const event of events) {
    if (event.resource > max) {
      max = event.resource
    }
  }
  return max
}

function resourceY(value: number, cap = RESOURCE_MAX) {
  const usable = RESOURCE_H - RESOURCE_PAD * 2
  const top = Math.max(cap, 1)
  return RESOURCE_H - RESOURCE_PAD - (Math.min(Math.max(value, 0), top) / top) * usable
}

function resourceSamples(events: TimelineEvent[], end: number) {
  const points: { t: number; r: number }[] = [{ t: 0, r: 0 }]
  for (const event of events) {
    if (!event.resourceKind) {
      continue
    }
    const t = Math.max(0, Math.min(event.timeSeconds, end))
    const last = points[points.length - 1]
    if (last.t === t) {
      last.r = event.resource
      continue
    }
    points.push({ t, r: event.resource })
  }
  const last = points[points.length - 1]
  if (last.t < end) {
    points.push({ t: end, r: last.r })
  }
  return points
}

function resourceLinePath(events: TimelineEvent[], end: number, trackPx: number) {
  const points = resourceSamples(events, end)
  if (!points.length) {
    return ''
  }
  const cap = resourceCap(events)
  const x = (time: number) => (time / end) * trackPx
  let d = `M ${x(points[0].t)} ${resourceY(points[0].r, cap)}`
  for (let i = 1; i < points.length; i++) {
    const next = points[i]
    d += ` H ${x(next.t)} V ${resourceY(next.r, cap)}`
  }
  return d
}

function resourceFillPath(events: TimelineEvent[], end: number, trackPx: number) {
  const line = resourceLinePath(events, end, trackPx)
  if (!line) {
    return ''
  }
  return `${line} V ${RESOURCE_H} H 0 Z`
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
