import type { CatalogTalent } from '../catalog/era.ts'

type Props = {
  talent: CatalogTalent
  rank: number
  x: number
  y: number
}

export function TalentTooltip({ talent, rank, x, y }: Props) {
  const ranks = talent.ranks ?? []
  const current = rank > 0 ? ranks[rank - 1] : ''
  const next = rank < talent.maxRank ? ranks[rank] : ''
  const left = Math.min(x + 16, window.innerWidth - 320)
  const top = Math.min(y + 12, window.innerHeight - 260)

  return (
    <div className="wow-tooltip talent-tooltip" style={{ left, top }} role="tooltip">
      <p className="wow-tooltip-name">{talent.name}</p>
      <p className="wow-tooltip-slot">
        Rank {rank}/{talent.maxRank}
      </p>
      {current ? <p className="wow-tooltip-equip">{current}</p> : null}
      {!current && next ? <p className="wow-tooltip-equip">{next}</p> : null}
      {current && next ? (
        <>
          <p className="wow-tooltip-bind">Next rank</p>
          <p className="wow-tooltip-use">{next}</p>
        </>
      ) : null}
      {!current && !next ? <p className="wow-tooltip-bind">No tooltip text for this talent.</p> : null}
    </div>
  )
}
