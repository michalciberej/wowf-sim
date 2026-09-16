import type { SimResult } from '../gen/wowfsim/sim_pb.ts'
import { iconUrl } from '../catalog/era.ts'

type Props = {
  result: SimResult
}

export function SimResultPanel({ result }: Props) {
  return (
    <section className="timeline-frame">
      <header className="talent-frame-head">
        <h2>Result</h2>
        <p>
          {result.dpsMean.toFixed(1)} DPS ± {result.dpsStdev.toFixed(1)}
        </p>
      </header>
      <p className="dps-meta">
        {result.iterations} iterations · min {result.dpsMin.toFixed(1)} · max{' '}
        {result.dpsMax.toFixed(1)}
      </p>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Action</th>
            <th>DPS</th>
            <th>Casts</th>
            <th>Crits</th>
            <th>Misses</th>
          </tr>
        </thead>
        <tbody>
          {result.actions.map((action) => (
            <tr key={action.name}>
              <td>
                <img
                  className="result-icon"
                  src={iconUrl(action.icon)}
                  alt=""
                  draggable={false}
                />
              </td>
              <td>{action.name}</td>
              <td>{action.dps.toFixed(1)}</td>
              <td>{action.casts.toString()}</td>
              <td>{action.crits.toString()}</td>
              <td>{action.misses.toString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
