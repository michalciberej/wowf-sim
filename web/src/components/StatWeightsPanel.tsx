import type { StatWeightsResult } from '../gen/wowfsim/sim_pb.ts'
import { WEIGHT_GROUPS, weightStatsFor } from '../catalog/weights.ts'
import type { Class } from '../gen/wowfsim/sim_pb.ts'

type Props = {
  playerClass: Class
  result: StatWeightsResult | null
  ep: Record<string, number>
  running: boolean
  onCalculate: () => void
  onChange: (id: string, ep: number) => void
  onResetMeasured: () => void
  onZero: () => void
}

export function StatWeightsPanel({
  playerClass,
  result,
  ep,
  running,
  onCalculate,
  onChange,
  onResetMeasured,
  onZero,
}: Props) {
  const measured = new Map(result?.weights.map((row) => [row.id, row]) ?? [])
  const stats = weightStatsFor(playerClass)
  const groups = WEIGHT_GROUPS.filter((group) => stats.some((stat) => stat.group === group))

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Stat weights</h2>
        </div>
        <div className="weight-actions">
          <button type="button" className="btn" disabled={running} onClick={onResetMeasured}>
            Restore defaults
          </button>
          <button type="button" className="btn" disabled={running} onClick={onZero}>
            Zero
          </button>
          <button type="button" className="btn btn-primary" disabled={running} onClick={onCalculate}>
            {running ? 'Calculating…' : 'Calculate'}
          </button>
        </div>
      </header>
      {result ? (
        <p className="panel-meta">
          Baseline {result.baselineDps.toFixed(1)} DPS · {result.iterations} iterations per variant
        </p>
      ) : null}
      {groups.map((group) => (
        <div key={group} className="weight-group">
          <h3>{group}</h3>
          <div className="weight-grid">
            {stats.filter((stat) => stat.group === group).map((stat) => {
              const row = measured.get(stat.id)
              return (
                <label key={stat.id} className="weight-card" title={stat.hint}>
                  <span className="weight-name">{stat.name}</span>
                  <span className="weight-dps">
                    {row ? `${row.dps.toFixed(3)} DPS / unit` : 'Not measured'}
                  </span>
                  <span className="weight-ep-label">EP</span>
                  <input
                    type="number"
                    step="0.01"
                    value={Number.isFinite(ep[stat.id]) ? ep[stat.id] : 0}
                    onChange={(event) => onChange(stat.id, Number(event.target.value))}
                  />
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
