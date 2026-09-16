import type { SimResult } from '../gen/wowfsim/sim_pb.ts'
import { iconUrl } from '../catalog/era.ts'

const PX_PER_SEC = 28
const LANE_INSET = 28
const MIN_TRACK = 720

type Props = {
  result: SimResult
  durationSeconds: number
}

export function SimTimeline({ result, durationSeconds }: Props) {
  const events = result.timeline ?? []
  const end = Math.max(durationSeconds, durationFrom(result), 1)
  const trackPx = Math.max(MIN_TRACK, Math.round(end * PX_PER_SEC))
  const names = [...new Set(events.map((event) => event.name))]
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

  return (
    <section className="timeline-frame">
      <header className="talent-frame-head">
        <h2>Timeline</h2>
        <p>
          First iteration · {events.length} casts · {end.toFixed(0)}s · scroll
          horizontally
        </p>
      </header>
      <p className="hint">
        Combat log from the seeded first iteration. Longer fights use more
        horizontal space so casts do not stack on top of each other.
      </p>
      <div className="wcl">
        <div className="wcl-axis">
          <span className="wcl-spell wcl-spacer" />
          <span className="wcl-gap" />
          <div className="wcl-axis-track" style={{ width: trackPx }}>
            {axisTicks(end).map((tick) => (
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
        {names.map((name) => (
          <div key={name} className="wcl-row">
            <img
              className="wcl-spell"
              src={iconUrl(iconByName.get(name))}
              alt={name}
              title={name}
              draggable={false}
            />
            <span className="wcl-gap" />
            <div className="wcl-lane" style={{ width: trackPx }}>
              {events
                .filter((event) => event.name === name)
                .map((event, index) => (
                  <img
                    key={`${event.timeSeconds}-${index}`}
                    className={`wcl-cast ${event.crit ? 'crit' : ''} ${event.miss ? 'miss' : ''}`}
                    src={iconUrl(event.icon || iconByName.get(name))}
                    alt=""
                    draggable={false}
                    title={`${event.timeSeconds.toFixed(2)}s ${event.name}${event.crit ? ' crit' : ''}${event.miss ? ' miss' : ''} ${event.damage.toFixed(0)}`}
                    style={{
                      left: `${laneX(event.timeSeconds, end, trackPx)}px`,
                    }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
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
    if (event.timeSeconds > max) {
      max = event.timeSeconds
    }
  }
  return max
}
