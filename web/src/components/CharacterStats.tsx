import { useState } from 'react'
import { Class } from '../gen/wowfsim/sim_pb.ts'
import {
  sheetShows,
  STAT_PART_LABELS,
  STAT_PARTS,
  type SheetStats,
  type StatBreakdown,
  type StatBreakdownKind,
  type StatPart,
} from '../catalog/character.ts'

type Props = {
  stats: SheetStats
  playerClass: Class
}

type StatRow = {
  key: string
  label: string
  value: string
  indent?: boolean
  tone?: 'ok' | 'bad'
}

function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function hitTone(value: number, cap: number): 'ok' | 'bad' {
  return value + 1e-9 >= cap ? 'ok' : 'bad'
}

const ATTR_LABEL: Record<string, string> = {
  strength: 'Strength',
  agility: 'Agility',
  stamina: 'Stamina',
  intellect: 'Intellect',
  spirit: 'Spirit',
}

function formatAmount(value: number, kind: StatBreakdownKind, signed: boolean) {
  const abs = Math.abs(value)
  let body: string
  switch (kind) {
    case 'pct':
      body = `${(abs * 100).toFixed(2)}%`
      break
    case 'dps':
      body = abs.toFixed(1)
      break
    case 'sec':
      body = `${abs.toFixed(2)}s`
      break
    default:
      body = abs.toFixed(0)
  }
  if (!signed) return value < 0 ? `-${body}` : body
  if (value > 0) return `+${body}`
  if (value < 0) return `-${body}`
  return body
}

function StatBreakdownTip({
  title,
  breakdown,
  x,
  y,
}: {
  title: string
  breakdown: StatBreakdown
  x: number
  y: number
}) {
  const left = Math.min(x, window.innerWidth - 240)
  const top = Math.min(y, window.innerHeight - 220)
  return (
    <div className="wow-tooltip stat-tip" style={{ left, top }} role="tooltip">
      <p className="wow-tooltip-name">{title}</p>
      {STAT_PARTS.map((part: StatPart) => (
        <p key={part} className="stat-tip-row">
          <span>{STAT_PART_LABELS[part]}</span>
          <span>{formatAmount(breakdown.parts[part], breakdown.kind, part !== 'base')}</span>
        </p>
      ))}
      <p className="stat-tip-row stat-tip-total">
        <span>Total</span>
        <span>{formatAmount(breakdown.total, breakdown.kind, false)}</span>
      </p>
    </div>
  )
}

function StatGroup({
  rows,
  onHover,
}: {
  rows: StatRow[]
  onHover: (row: StatRow | null, ev?: React.MouseEvent) => void
}) {
  if (rows.length === 0) {
    return null
  }
  return (
    <div className="char-stats-group">
      {rows.map((row) => (
        <div
          key={row.key}
          className={row.indent ? 'indent has-tip' : 'has-tip'}
          onMouseOver={(ev) => onHover(row, ev)}
          onMouseMove={(ev) => onHover(row, ev)}
          onMouseOut={(ev) => {
            const next = ev.relatedTarget as Node | null
            if (!next || !ev.currentTarget.contains(next)) onHover(null)
          }}
        >
          <dt>{row.label}</dt>
          <dd className={row.tone ? `stat-${row.tone}` : undefined}>{row.value}</dd>
        </div>
      ))}
    </div>
  )
}

export function CharacterStats({ stats, playerClass }: Props) {
  const layout = sheetShows(playerClass, stats.melee)
  const [tip, setTip] = useState<{ row: StatRow; x: number; y: number } | null>(null)

  const primary: StatRow[] = layout.attributes.map((key) => ({
    key,
    label: ATTR_LABEL[key],
    value: stats[key].toFixed(0),
  }))
  const secondary: StatRow[] = []
  if (layout.melee) {
    secondary.push({ key: 'attackPower', label: 'Attack Power', value: stats.attackPower.toFixed(0) })
    secondary.push({
      key: 'meleeHit',
      label: 'Melee Hit',
      value: pct(stats.meleeHit),
      tone: hitTone(stats.meleeHit, stats.meleeHitCap),
    })
    secondary.push({
      key: 'mhHit',
      label: 'Main Hand Hit',
      value: pct(stats.mhHit),
      indent: true,
      tone: hitTone(stats.mhHit, stats.mhHitCap),
    })
    if (stats.ohDps) {
      secondary.push({
        key: 'ohHit',
        label: 'Off Hand Hit',
        value: pct(stats.ohHit),
        indent: true,
        tone: hitTone(stats.ohHit, stats.ohHitCap),
      })
    }
    secondary.push({ key: 'meleeCrit', label: 'Melee Crit', value: pct(stats.meleeCrit) })
    if (stats.mhDps) {
      secondary.push({ key: 'mhDps', label: 'Weapon DPS', value: stats.mhDps.toFixed(1) })
      if (stats.mhSpeed) {
        secondary.push({ key: 'mhSpeed', label: 'Weapon Speed', value: `${stats.mhSpeed.toFixed(2)}s` })
      }
    }
    if (stats.ohDps) {
      secondary.push({ key: 'ohDps', label: 'Off-Hand DPS', value: stats.ohDps.toFixed(1) })
      if (stats.ohSpeed) {
        secondary.push({ key: 'ohSpeed', label: 'Off-Hand Speed', value: `${stats.ohSpeed.toFixed(2)}s` })
      }
    }
    if (stats.meleeHaste) {
      secondary.push({ key: 'meleeHaste', label: 'Melee Haste', value: pct(stats.meleeHaste) })
    }
    if (playerClass === Class.WARRIOR && stats.stanceDamage) {
      secondary.push({ key: 'stanceDamage', label: 'Stance Dmg', value: pct(stats.stanceDamage) })
    }
  }
  if (layout.spell) {
    secondary.push(
      { key: 'spellPower', label: 'Spell Power', value: stats.spellPower.toFixed(0) },
      { key: 'spellHit', label: 'Spell Hit', value: pct(stats.spellHit) },
      { key: 'spellCrit', label: 'Spell Crit', value: pct(stats.spellCrit) },
    )
  }

  const onHover = (row: StatRow | null, ev?: React.MouseEvent) => {
    if (!row || !ev) {
      setTip(null)
      return
    }
    setTip({
      row,
      x: (ev.currentTarget as HTMLElement).getBoundingClientRect().right + 10,
      y: (ev.currentTarget as HTMLElement).getBoundingClientRect().top - 4,
    })
  }

  const breakdown = tip ? stats.breakdowns[tip.row.key] : undefined

  return (
    <>
      <dl className="char-stats">
        <StatGroup rows={[{ key: 'health', label: 'Health', value: stats.health.toFixed(0) }]} onHover={onHover} />
        <StatGroup rows={primary} onHover={onHover} />
        <StatGroup rows={secondary} onHover={onHover} />
      </dl>
      {tip && breakdown ? <StatBreakdownTip title={tip.row.label} breakdown={breakdown} x={tip.x} y={tip.y} /> : null}
    </>
  )
}
