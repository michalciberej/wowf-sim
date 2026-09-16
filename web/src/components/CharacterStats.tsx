import { Class } from '../gen/wowfsim/sim_pb.ts'
import { sheetShows, type SheetStats } from '../catalog/character.ts'

type Props = {
  stats: SheetStats
  playerClass: Class
}

function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

const ATTR_LABEL: Record<string, string> = {
  strength: 'Strength',
  agility: 'Agility',
  stamina: 'Stamina',
  intellect: 'Intellect',
  spirit: 'Spirit',
}

export function CharacterStats({ stats, playerClass }: Props) {
  const layout = sheetShows(playerClass, stats.melee)
  const rows: Array<[string, string]> = []
  for (const key of layout.attributes) {
    rows.push([ATTR_LABEL[key], stats[key].toFixed(0)])
  }
  if (layout.melee) {
    rows.push(
      ['Attack Power', stats.attackPower.toFixed(0)],
      ['Melee Hit', pct(stats.meleeHit)],
      ['Melee Crit', pct(stats.meleeCrit)],
    )
    if (stats.mhDps) {
      rows.push(['Weapon DPS', stats.mhDps.toFixed(1)])
      if (stats.mhSpeed) {
        rows.push(['Weapon Speed', `${stats.mhSpeed.toFixed(2)}s`])
      }
    }
  }
  if (layout.spell) {
    rows.push(
      ['Spell Power', stats.spellPower.toFixed(0)],
      ['Spell Hit', pct(stats.spellHit)],
      ['Spell Crit', pct(stats.spellCrit)],
    )
  }

  return (
    <dl className="char-stats">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
