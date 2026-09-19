import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import type { ActionMetric, SimResult, TimelineEvent } from '../gen/wowfsim/sim_pb.ts'
import { iconUrl } from '../catalog/era.ts'
import type { CatalogAbility } from '../catalog/abilities.ts'
import type { DpsBaseline } from '../persist.ts'
import { groupResultRows } from './resultGroups.ts'
import { SpellHover, SpellTooltip } from './SpellTooltip.tsx'
import { SimTimeline } from './SimTimeline.tsx'

type Props = {
  result: SimResult
  seed?: bigint | null
  live?: boolean
  durationSeconds: number
  baseline?: DpsBaseline | null
  onSaveBaseline?: () => void
  onClearBaseline?: () => void
}

export function SimResultPanel({
  result,
  seed,
  live,
  durationSeconds,
  baseline,
  onSaveBaseline,
  onClearBaseline,
}: Props) {
  const total = result.dpsMean || result.actions.reduce((sum, action) => sum + action.dps, 0)
  const rows = useMemo(() => groupResultRows(result.actions), [result.actions])
  const peakDps = useMemo(
    () => Math.max(0, ...rows.filter((row) => row.depth === 0).map((row) => row.action.dps)),
    [rows],
  )
  const [view, setView] = useState<'damage' | 'timeline'>('damage')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [hover, setHover] = useState<{ ability: CatalogAbility; x: number; y: number } | null>(null)

  function onSpellHover(ability: CatalogAbility, event: MouseEvent) {
    setHover({ ability, x: event.clientX, y: event.clientY })
  }

  return (
    <section className="timeline-frame result-panel">
      <header className="talent-frame-head result-head">
        <h2>Result</h2>
        <div className="dps-hist-toggle" role="tablist" aria-label="Result view">
          <button
            type="button"
            role="tab"
            className={view === 'damage' ? 'active' : ''}
            aria-selected={view === 'damage'}
            onClick={() => setView('damage')}
          >
            Damage
          </button>
          <button
            type="button"
            role="tab"
            className={view === 'timeline' ? 'active' : ''}
            aria-selected={view === 'timeline'}
            onClick={() => setView('timeline')}
          >
            Timeline
          </button>
        </div>
      </header>
      {view === 'timeline' ? (
        <SimTimeline result={result} durationSeconds={durationSeconds} embedded />
      ) : (
        <>
          <p className="dps-meta">
            {live ? `Live · ${result.iterations} iterations` : `${result.iterations} iterations`}
            {' · '}min {result.dpsMin.toFixed(1)} · max {result.dpsMax.toFixed(1)}
            {seed != null ? ` · seed ${seed.toString()}` : ''}
          </p>
          <div className="result-compare">
            <button type="button" className="btn" onClick={onSaveBaseline} disabled={!onSaveBaseline}>
              Save for compare
            </button>
            <button type="button" className="btn" onClick={onClearBaseline} disabled={!baseline || !onClearBaseline}>
              Clear saved
            </button>
          </div>
          <table className="result-table">
            <thead>
              <tr>
                <th>Action</th>
                <th className="result-share-col">Share</th>
                <th>DPS</th>
                <th>Avg Hit</th>
                <th>Casts</th>
                <th>Hits</th>
                <th>Crit %</th>
                <th>Miss %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.depth && !open[row.parentKey ?? '']) {
                  return null
                }
                const grouped = Boolean(row.parts?.length)
                const expanded = grouped && open[row.key]
                return (
                  <tr
                    key={row.key}
                    className={row.depth ? 'result-child' : grouped ? 'result-parent' : undefined}
                    onClick={
                      grouped
                        ? () => setOpen((prev) => ({ ...prev, [row.key]: !prev[row.key] }))
                        : undefined
                    }
                  >
                    <td className="result-action">
                      <SpellHover names={row.sourceNames} onHover={onSpellHover} onLeave={() => setHover(null)}>
                        <img className="result-icon" src={iconUrl(row.action.icon)} alt="" draggable={false} />
                        {grouped ? (
                          <span className="result-group-name">
                            <span className="result-caret" aria-hidden>
                              {expanded ? '▾' : '▸'}
                            </span>
                            {row.name}
                          </span>
                        ) : (
                          row.name
                        )}
                      </SpellHover>
                    </td>
                    <td className="result-share-col" onClick={(event) => event.stopPropagation()}>
                      <ShareBar
                        action={row.action}
                        label={row.name}
                        totalDps={total}
                        peakDps={peakDps}
                        damage={row.action.dps * durationSeconds}
                      />
                    </td>
                    <td className="result-dps">{row.action.dps.toFixed(1)}</td>
                    <td>{formatAvgHit(row.action)}</td>
                    <td>{formatCount(row.action.casts)}</td>
                    <td>{formatHits(row.action)}</td>
                    <td>{formatRate(row.action, critRate(row.action))}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <MissRateTip action={row.action} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <DpsChart result={result} />
          {hover ? <SpellTooltip ability={hover.ability} x={hover.x} y={hover.y} /> : null}
        </>
      )}
    </section>
  )
}

function formatCount(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    return '0'
  }
  if (Math.abs(value - Math.round(value)) < 1e-6) {
    return Math.round(value).toString()
  }
  return value.toFixed(1)
}

function hasHitTable(action: ActionMetric) {
  return action.dps > 0 || action.hitDps > 0 || action.critDps > 0 || action.misses > 0 || action.dodges > 0
}

function hitCount(action: ActionMetric) {
  return Math.max(0, action.casts - action.misses - action.dodges)
}

function formatHits(action: ActionMetric) {
  if (!hasHitTable(action)) {
    return '-'
  }
  return formatCount(hitCount(action))
}

function formatAvgHit(action: ActionMetric) {
  const hits = hitCount(action)
  if (!hasHitTable(action) || hits <= 0 || !(action.avgCast > 0)) {
    return '-'
  }
  return ((action.avgCast * action.casts) / hits).toFixed(1)
}

function critRate(action: ActionMetric) {
  const hits = hitCount(action)
  if (hits <= 0) {
    return 0
  }
  return (action.crits / hits) * 100
}

function missRate(action: ActionMetric) {
  if (!(action.casts > 0)) {
    return 0
  }
  return ((action.misses + action.dodges) / action.casts) * 100
}

function avoidShare(action: ActionMetric, count: number) {
  if (!(action.casts > 0)) {
    return 0
  }
  return (count / action.casts) * 100
}

function formatRate(action: ActionMetric, pct: number) {
  if (!hasHitTable(action)) {
    return '-'
  }
  return `${pct.toFixed(1)}%`
}

function MissRateTip({ action }: { action: ActionMetric }) {
  const total = missRate(action)
  const missPct = avoidShare(action, action.misses)
  const dodgePct = avoidShare(action, action.dodges)
  if (!hasHitTable(action)) {
    return <span>-</span>
  }
  return (
    <div className="result-rate" tabIndex={0}>
      <span>{total.toFixed(1)}%</span>
      <div className="result-share-tip" role="tooltip">
        <p className="result-share-tip-title">Avoided</p>
        <BreakdownRow label="Miss" pct={missPct} dps={undefined} tone="miss" />
        <BreakdownRow label="Dodge" pct={dodgePct} dps={undefined} tone="dodge" />
      </div>
    </div>
  )
}

function formatDamage(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }
  if (value >= 100000) {
    return `${(value / 1000).toFixed(0)}k`
  }
  return Math.round(value).toLocaleString()
}

export function DeltaText({ value, base, compact }: { value: number; base?: number; compact?: boolean }) {
  const tone = Math.abs(value) < 0.05 ? 'flat' : value > 0 ? 'up' : 'down'
  const text = `${value > 0 ? '+' : value < 0 ? '' : ''}${value.toFixed(1)}`
  let extra = ''
  if (!compact && base && base > 0 && Math.abs(value) >= 0.05) {
    extra = ` (${((value / base) * 100).toFixed(1)}%)`
  }
  return (
    <span className={`dps-delta ${tone}`}>
      {text}
      {extra}
    </span>
  )
}

function ShareBar({
  action,
  label,
  totalDps,
  peakDps,
  damage,
}: {
  action: ActionMetric
  label: string
  totalDps: number
  peakDps: number
  damage: number
}) {
  const pct = totalDps > 0 ? (action.dps / totalDps) * 100 : 0
  const barPct = peakDps > 0 ? (action.dps / peakDps) * 100 : 0
  const split = action.dps > 0 ? action.dps : 1
  const hitPct = (action.hitDps / split) * 100
  const critPct = (action.critDps / split) * 100

  return (
    <div className="result-share" tabIndex={0}>
      <span className="result-share-dmg">{formatDamage(damage)}</span>
      <div className="result-share-track" aria-label={`${pct.toFixed(1)} percent of damage`}>
        <span className="result-share-fill" style={{ width: `${Math.min(100, barPct)}%` }} />
      </div>
      <span className="result-share-pct">{pct.toFixed(1)}%</span>
      <div className="result-share-tip" role="tooltip">
        <p className="result-share-tip-title">{label}</p>
        <BreakdownRow label="Normal hits" pct={hitPct} dps={action.hitDps} tone="hit" />
        <BreakdownRow label="Critical hits" pct={critPct} dps={action.critDps} tone="crit" />
      </div>
    </div>
  )
}

function BreakdownRow({
  label,
  pct,
  dps,
  tone,
}: {
  label: string
  pct: number
  dps?: number
  tone: 'hit' | 'crit' | 'miss' | 'dodge'
}) {
  return (
    <div className="result-break">
      <div className="result-break-copy">
        <span>{label}</span>
        <span>
          {pct.toFixed(1)}%{dps != null ? ` · ${dps.toFixed(1)} DPS` : ''}
        </span>
      </div>
      <div className="result-share-track thin">
        <span className={`result-share-fill ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}

function DpsChart({ result }: { result: SimResult }) {
  const [mode, setMode] = useState<'fight' | 'iter'>('fight')
  return (
    <div className="dps-hist">
      <div className="dps-hist-head">
        <h3>{mode === 'fight' ? 'DPS' : 'Iteration DPS'}</h3>
        <div className="dps-hist-toggle" role="tablist" aria-label="DPS chart">
          <button
            type="button"
            role="tab"
            className={mode === 'fight' ? 'active' : ''}
            aria-selected={mode === 'fight'}
            onClick={() => setMode('fight')}
          >
            DPS
          </button>
          <button
            type="button"
            role="tab"
            className={mode === 'iter' ? 'active' : ''}
            aria-selected={mode === 'iter'}
            onClick={() => setMode('iter')}
          >
            Iterations
          </button>
        </div>
      </div>
      {mode === 'fight' ? (
        <DpsLineChart events={result.timeline ?? []} mean={result.dpsMean} />
      ) : (
        <DpsHistogram samples={result.iterationDps} mean={result.dpsMean} stdev={result.dpsStdev} />
      )}
    </div>
  )
}

function DpsLineChart({ events, mean }: { events: TimelineEvent[]; mean: number }) {
  const chart = useMemo(() => buildDpsLine(events, mean), [events, mean])
  const [hover, setHover] = useState<{ i: number; clientX: number; clientY: number; vx: number } | null>(null)
  if (!chart) {
    return <p>Run a sim to plot DPS over the first fight.</p>
  }
  const plot = chart

  function onMove(event: MouseEvent<SVGSVGElement>) {
    const loc = svgPoint(event.currentTarget, event.clientX, event.clientY)
    if (!loc) {
      setHover(null)
      return
    }
    if (loc.x < plot.left || loc.x > plot.left + plot.innerW || loc.y < plot.top || loc.y > plot.top + plot.innerH) {
      setHover(null)
      return
    }
    const t = ((loc.x - plot.left) / plot.innerW) * plot.end
    const i = nearestIndex(plot.points, t)
    setHover({ i, clientX: event.clientX, clientY: event.clientY, vx: loc.x })
  }

  const point = hover ? plot.points[hover.i] : null

  return (
    <>
      <p>Rolling DPS over the first iteration. Hover to see the hits near that time.</p>
      <div className="dps-graph">
        <svg
          className="dps-graph-svg"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="DPS over the fight"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {chart.yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                className="dps-graph-grid"
                x1={chart.left}
                x2={chart.left + chart.innerW}
                y1={chart.yAt(tick)}
                y2={chart.yAt(tick)}
              />
              {tick > 0 ? (
                <text className="dps-graph-label" x={chart.left + 6} y={chart.yAt(tick) + 3}>
                  {tick.toFixed(0)}
                </text>
              ) : null}
            </g>
          ))}
          {chart.xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line
                className="dps-graph-grid"
                x1={chart.xAt(tick)}
                x2={chart.xAt(tick)}
                y1={chart.top}
                y2={chart.top + chart.innerH}
              />
              <text
                className="dps-graph-label"
                x={chart.xAt(tick)}
                y={chart.height - 6}
                textAnchor={tick === 0 ? 'start' : tick >= chart.end ? 'end' : 'middle'}
              >
                {tick.toFixed(0)}
              </text>
            </g>
          ))}
          <polyline className="dps-graph-line" fill="none" points={chart.line} />
          {hover && point ? (
            <>
              <line
                className="dps-graph-cursor"
                x1={hover.vx}
                x2={hover.vx}
                y1={chart.top}
                y2={chart.top + chart.innerH}
              />
              <circle className="dps-graph-dot" cx={chart.xAt(point.t)} cy={chart.yAt(point.dps)} r={3} />
            </>
          ) : null}
        </svg>
        {hover && point ? <DpsGraphTip point={point} events={chart.eventsAt(point.t)} x={hover.clientX} y={hover.clientY} /> : null}
      </div>
    </>
  )
}

function DpsGraphTip({
  point,
  events,
  x,
  y,
}: {
  point: DpsPoint
  events: TimelineEvent[]
  x: number
  y: number
}) {
  const left = Math.min(x + 16, window.innerWidth - 280)
  const top = Math.min(y + 12, window.innerHeight - 320)
  const shown = events.slice(0, 12)
  const extra = events.length - shown.length
  return (
    <div className="wow-tooltip dps-graph-tip" style={{ left, top }} role="tooltip">
      <p className="wow-tooltip-name">{point.t.toFixed(1)}s</p>
      <p className="wow-tooltip-stat">{Math.round(point.dps).toLocaleString()} DPS</p>
      {shown.length === 0 ? <p className="wow-tooltip-slot">No events</p> : null}
      {shown.map((event, index) => (
        <div key={`${event.timeSeconds}-${event.name}-${index}`} className="dps-graph-tip-row">
          <img src={iconUrl(event.icon)} alt="" draggable={false} />
          <span className="dps-graph-tip-name">{event.name || event.kind || 'Event'}</span>
          <span className={event.miss ? 'wow-tooltip-bind' : event.crit ? 'wow-tooltip-use' : 'wow-tooltip-equip'}>
            {eventTipValue(event)}
          </span>
        </div>
      ))}
      {extra > 0 ? <p className="wow-tooltip-slot">+{extra} more</p> : null}
    </div>
  )
}

function eventTipValue(event: TimelineEvent) {
  if (event.miss && !(event.damage > 0)) {
    return 'Miss'
  }
  if (event.damage > 0) {
    return `${Math.round(event.damage).toLocaleString()}${event.crit ? ' crit' : ''}`
  }
  if (event.kind === 'buff' || event.kind === 'dot') {
    return 'buff'
  }
  if (event.kind === 'cast') {
    return 'cast'
  }
  return event.kind || ''
}

function DpsHistogram({
  samples,
  mean,
  stdev,
}: {
  samples: number[]
  mean: number
  stdev: number
}) {
  const chart = useMemo(() => buildHistogram(samples, mean, stdev), [samples, mean, stdev])
  if (!chart) {
    return <p>Need at least two iterations to plot a distribution.</p>
  }

  return (
    <>
      <p>How often fights landed near each DPS value. The line is a normal curve from the mean and stdev.</p>
      <svg className="dps-hist-svg" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="DPS distribution">
        {chart.bars.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={bar.h}
            className="dps-hist-bar"
          />
        ))}
        <polyline className="dps-hist-curve" fill="none" points={chart.curve} />
        <line className="dps-hist-mean" x1={chart.meanX} x2={chart.meanX} y1={chart.pad} y2={chart.height - chart.axis} />
        <text className="dps-hist-label" x={chart.pad} y={chart.height - 6}>
          {chart.lo.toFixed(0)}
        </text>
        <text className="dps-hist-label" x={chart.width / 2} y={chart.height - 6} textAnchor="middle">
          {mean.toFixed(0)} mean
        </text>
        <text className="dps-hist-label" x={chart.width - chart.pad} y={chart.height - 6} textAnchor="end">
          {chart.hi.toFixed(0)}
        </text>
      </svg>
    </>
  )
}

type DpsPoint = {
  t: number
  dps: number
}

function buildDpsLine(events: TimelineEvent[], mean: number) {
  let end = 0
  const hits: { t: number; damage: number }[] = []
  const notable: TimelineEvent[] = []
  for (const event of events) {
    const t = Math.max(0, event.timeSeconds)
    if (t > end) {
      end = t
    }
    if ((event.kind === 'hit' || event.kind === 'tick' || event.kind === '') && event.damage > 0) {
      hits.push({ t, damage: event.damage })
    }
    if (event.kind !== 'resource' && (event.name || event.damage > 0 || event.miss)) {
      notable.push(event)
    }
  }
  if (end < 1 || hits.length < 3) {
    return null
  }
  hits.sort((a, b) => a.t - b.t)
  notable.sort((a, b) => a.timeSeconds - b.timeSeconds)

  const window = Math.min(12, Math.max(6, end / 18))
  const step = Math.max(0.2, end / 360)
  const points: DpsPoint[] = []
  let lo = 0
  let hi = 0
  let sum = 0
  for (let t = 0; t < end + step / 2; t += step) {
    const sample = Math.min(t, end)
    while (hi < hits.length && hits[hi].t <= sample) {
      sum += hits[hi].damage
      hi += 1
    }
    while (lo < hits.length && hits[lo].t < sample - window) {
      sum -= hits[lo].damage
      lo += 1
    }
    points.push({ t: sample, dps: sum / window })
  }

  const width = 720
  const height = 200
  const left = 0
  const right = 0
  const top = 4
  const bottom = 18
  const innerW = width - left - right
  const innerH = height - top - bottom
  const peak = Math.max(...points.map((point) => point.dps), mean, 1)
  const yTicks = niceTicks(peak, 9)
  const ymax = yTicks[yTicks.length - 1] || peak
  const xTicks = timeTicks(end)
  const xAt = (t: number) => left + (t / end) * innerW
  const yAt = (dps: number) => top + innerH - (Math.max(0, dps) / ymax) * innerH
  const line = points.map((point) => `${xAt(point.t)},${yAt(point.dps)}`).join(' ')
  const eventsAt = (t: number) => {
    const t0 = Math.max(0, t - 0.5)
    const t1 = t + 0.5
    return notable.filter((event) => event.timeSeconds >= t0 && event.timeSeconds <= t1)
  }
  return {
    width,
    height,
    left,
    top,
    innerW,
    innerH,
    end,
    ymax,
    yTicks,
    xTicks,
    points,
    line,
    xAt,
    yAt,
    eventsAt,
  }
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM()
  if (!ctm) {
    return null
  }
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  return point.matrixTransform(ctm.inverse())
}

function nearestIndex(points: DpsPoint[], t: number) {
  if (points.length === 0) {
    return 0
  }
  let lo = 0
  let hi = points.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (points[mid].t < t) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  if (lo > 0 && Math.abs(points[lo - 1].t - t) < Math.abs(points[lo].t - t)) {
    return lo - 1
  }
  return lo
}

function niceTicks(max: number, count: number) {
  const raw = max / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const norm = raw / mag
  const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(value)
  }
  return ticks
}

function timeTicks(end: number) {
  const raw = end / 10
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const norm = raw / mag
  const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag
  const ticks: number[] = []
  for (let value = 0; value < end; value += step) {
    ticks.push(value)
  }
  if (ticks[ticks.length - 1] !== end) {
    ticks.push(end)
  }
  return ticks
}

function buildHistogram(samples: number[], mean: number, stdev: number) {
  if (samples.length < 2) {
    return null
  }
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  const padAmt = (max - min) * 0.08 || Math.max(1, mean * 0.02)
  const lo = min - padAmt
  const hi = max + padAmt
  const bins = Math.min(48, Math.max(16, Math.round(Math.sqrt(samples.length))))
  const binW = (hi - lo) / bins
  const counts = Array.from({ length: bins }, () => 0)
  for (const value of samples) {
    let i = Math.floor((value - lo) / binW)
    if (i < 0) {
      i = 0
    }
    if (i >= bins) {
      i = bins - 1
    }
    counts[i] += 1
  }
  const width = 640
  const height = 168
  const pad = 8
  const axis = 22
  const innerW = width - pad * 2
  const innerH = height - pad - axis
  const maxCount = Math.max(...counts, 1)
  const sigma = stdev > 0.01 ? stdev : (hi - lo) / 6
  const bars = counts.map((count, i) => {
    const h = (count / maxCount) * innerH
    const w = innerW / bins
    return { x: pad + i * w + 1, y: pad + innerH - h, w: Math.max(1, w - 2), h }
  })
  const curvePts: string[] = []
  for (let i = 0; i <= 80; i++) {
    const t = i / 80
    const xVal = lo + t * (hi - lo)
    const z = (xVal - mean) / sigma
    const pdf = Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI))
    const expected = pdf * samples.length * binW
    const y = pad + innerH - (expected / maxCount) * innerH
    curvePts.push(`${pad + t * innerW},${Math.max(pad, y)}`)
  }
  const meanX = pad + ((mean - lo) / (hi - lo)) * innerW
  return { width, height, pad, axis, lo, hi, bars, curve: curvePts.join(' '), meanX }
}
