import type { CatalogItem } from '../catalog/era.ts'
import { itemQualityColor, itemTooltipLines } from '../catalog/era.ts'

type Props = {
  item: CatalogItem
  x?: number
  y?: number
  embedded?: boolean
  equippedIds?: number[]
}

export function ItemTooltip({ item, x = 0, y = 0, embedded = false, equippedIds = [] }: Props) {
  const lines = itemTooltipLines(item, equippedIds)
  const left = Math.min(x + 16, window.innerWidth - 280)
  const top = Math.min(y + 12, window.innerHeight - 220)

  return (
    <div
      className={`wow-tooltip ${embedded ? 'embedded' : ''}`}
      style={embedded ? undefined : { left, top }}
      role="tooltip"
    >
      {lines.map((line, index) => (
        <p
          key={`${line.kind}-${index}`}
          className={`wow-tooltip-${line.kind}${line.active ? ' on' : ''}`}
          style={line.kind === 'name' ? { color: itemQualityColor(item) } : undefined}
        >
          {line.text}
        </p>
      ))}
    </div>
  )
}
