import { buffTooltipLines, type RaidBuff } from '../catalog/buffs.ts'

type Props = {
  buff: RaidBuff
  x: number
  y: number
}

export function BuffTooltip({ buff, x, y }: Props) {
  const lines = buffTooltipLines(buff)
  const left = Math.min(x + 16, window.innerWidth - 280)
  const top = Math.min(y + 12, window.innerHeight - 220)

  return (
    <div className="wow-tooltip" style={{ left, top }} role="tooltip">
      {lines.map((line, index) => (
        <p key={`${line.kind}-${index}`} className={`wow-tooltip-${line.kind}`}>
          {line.text}
        </p>
      ))}
    </div>
  )
}
