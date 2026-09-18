import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import type { ActionMetric, SimResult } from '../gen/wowfsim/sim_pb.ts'
import { iconUrl } from '../catalog/era.ts'
import type { CatalogAbility } from '../catalog/abilities.ts'
import type { DpsBaseline } from '../persist.ts'
import { groupResultRows } from './resultGroups.ts'
import { SpellHover, SpellTooltip } from './SpellTooltip.tsx'

type Props = {
  result: SimResult
  seed?: bigint | null
  live?: boolean
  baseline?: DpsBaseline | null
  onSaveBaseline?: () => void
  onClearBaseline?: () => void
}

export function SimResultPanel({ result, seed, live, baseline, onSaveBaseline, onClearBaseline }: Props) {
  const total = result.dpsMean || result.actions.reduce((sum, action) => sum + action.dps, 0)
  const rows = useMemo(() => groupResultRows(result.actions), [result.actions])
  const peakDps = useMemo(
    () => Math.max(0, ...rows.filter((row) => row.depth === 0).map((row) => row.action.dps)),
    [rows],
  )
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [hover, setHover] = useState<{ ability: CatalogAbility; x: number; y: number } | null>(null)

  function onSpellHover(ability: CatalogAbility, event: MouseEvent) {
    setHover({ ability, x: event.clientX, y: event.clientY })
  }

  return (
    <section className="timeline-frame result-panel">
      <header className="talent-frame-head">
        <h2>Result</h2>
      </header>
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
            <th></th>
            <th>Action</th>
            <th>DPS</th>
            {baseline ? <th>Δ DPS</th> : null}
            <th>Avg Cast</th>
            <th className="result-share-col">Share</th>
            <th>Casts</th>
            <th>Crits</th>
            <th>Misses</th>
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
                <td>
                  <SpellHover names={row.sourceNames} onHover={onSpellHover} onLeave={() => setHover(null)}>
                    <img className="result-icon" src={iconUrl(row.action.icon)} alt="" draggable={false} />
                  </SpellHover>
                </td>
                <td>
                  <SpellHover names={row.sourceNames} onHover={onSpellHover} onLeave={() => setHover(null)}>
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
                <td>{row.action.dps.toFixed(1)}</td>
                {baseline ? (
                  <td>
                    <DeltaText
                      value={row.action.dps - baselineDps(baseline, row.sourceNames)}
                      compact
                    />
                  </td>
                ) : null}
                <td>{row.action.avgCast > 0 ? row.action.avgCast.toFixed(1) : '—'}</td>
                <td className="result-share-col" onClick={(event) => event.stopPropagation()}>
                  <ShareBar action={row.action} label={row.name} totalDps={total} peakDps={peakDps} />
                </td>
                <td>{formatCount(row.action.casts)}</td>
                <td>{formatCount(row.action.crits)}</td>
                <td>{formatCount(row.action.misses)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <DpsHistogram samples={result.iterationDps} mean={result.dpsMean} stdev={result.dpsStdev} />
      {hover ? <SpellTooltip ability={hover.ability} x={hover.x} y={hover.y} /> : null}
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

function baselineDps(baseline: DpsBaseline, names: string[]) {
  return names.reduce((sum, name) => sum + (baseline.actions[name] ?? 0), 0)
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
}: {
  action: ActionMetric
  label: string
  totalDps: number
  peakDps: number
}) {
  const pct = totalDps > 0 ? (action.dps / totalDps) * 100 : 0
  const barPct = peakDps > 0 ? (action.dps / peakDps) * 100 : 0
  const split = action.dps > 0 ? action.dps : 1
  const hitPct = (action.hitDps / split) * 100
  const critPct = (action.critDps / split) * 100

  return (
    <div className="result-share" tabIndex={0}>
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
  dps: number
  tone: 'hit' | 'crit'
}) {
  return (
    <div className="result-break">
      <div className="result-break-copy">
        <span>{label}</span>
        <span>
          {pct.toFixed(1)}% · {dps.toFixed(1)} DPS
        </span>
      </div>
      <div className="result-share-track thin">
        <span className={`result-share-fill ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
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
    return null
  }

  return (
    <div className="dps-hist">
      <h3>Iteration DPS</h3>
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
    </div>
  )
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
