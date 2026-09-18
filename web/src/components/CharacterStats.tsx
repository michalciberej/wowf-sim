import { Class } from '../gen/wowfsim/sim_pb.ts'
import { sheetShows, type SheetStats } from '../catalog/character.ts'

type Props = {
  stats: SheetStats
  playerClass: Class
}

type StatRow = {
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

function StatGroup({ rows }: { rows: StatRow[] }) {
  if (rows.length === 0) {
    return null
  }
  return (
    <div className="char-stats-group">
      {rows.map((row) => (
        <div key={row.label} className={row.indent ? 'indent' : undefined}>
          <dt>{row.label}</dt>
          <dd className={row.tone ? `stat-${row.tone}` : undefined}>{row.value}</dd>
        </div>
      ))}
    </div>
  )
}

export function CharacterStats({ stats, playerClass }: Props) {
  const layout = sheetShows(playerClass, stats.melee)
  const primary: StatRow[] = layout.attributes.map((key) => ({
    label: ATTR_LABEL[key],
    value: stats[key].toFixed(0),
  }))
  const secondary: StatRow[] = []
  if (layout.melee) {
    secondary.push({ label: 'Attack Power', value: stats.attackPower.toFixed(0) })
    secondary.push({
      label: 'Melee Hit',
      value: pct(stats.meleeHit),
      tone: hitTone(stats.meleeHit, stats.meleeHitCap),
    })
    secondary.push({
      label: 'Main Hand Hit',
      value: pct(stats.mhHit),
      indent: true,
      tone: hitTone(stats.mhHit, stats.mhHitCap),
    })
    if (stats.ohDps) {
      secondary.push({
        label: 'Off Hand Hit',
        value: pct(stats.ohHit),
        indent: true,
        tone: hitTone(stats.ohHit, stats.ohHitCap),
      })
    }
    secondary.push({ label: 'Melee Crit', value: pct(stats.meleeCrit) })
    if (stats.mhDps) {
      secondary.push({ label: 'Weapon DPS', value: stats.mhDps.toFixed(1) })
      if (stats.mhSpeed) {
        secondary.push({ label: 'Weapon Speed', value: `${stats.mhSpeed.toFixed(2)}s` })
      }
    }
    if (stats.ohDps) {
      secondary.push({ label: 'Off-Hand DPS', value: stats.ohDps.toFixed(1) })
      if (stats.ohSpeed) {
        secondary.push({ label: 'Off-Hand Speed', value: `${stats.ohSpeed.toFixed(2)}s` })
      }
    }
    if (stats.meleeHaste) {
      secondary.push({ label: 'Melee Haste', value: pct(stats.meleeHaste) })
    }
    if (playerClass === Class.WARRIOR && stats.stanceDamage) {
      secondary.push({ label: 'Stance Dmg', value: pct(stats.stanceDamage) })
    }
  }
  if (layout.spell) {
    secondary.push(
      { label: 'Spell Power', value: stats.spellPower.toFixed(0) },
      { label: 'Spell Hit', value: pct(stats.spellHit) },
      { label: 'Spell Crit', value: pct(stats.spellCrit) },
    )
  }

  return (
    <dl className="char-stats">
      <StatGroup rows={[{ label: 'Health', value: stats.health.toFixed(0) }]} />
      <StatGroup rows={primary} />
      <StatGroup rows={secondary} />
    </dl>
  )
}
