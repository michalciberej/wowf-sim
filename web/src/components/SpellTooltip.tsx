import type { MouseEvent, ReactNode } from 'react'
import { abilityForActionName, spellTooltipLines, type CatalogAbility } from '../catalog/abilities.ts'
import { isAutoActionName } from './resultGroups.ts'

type TooltipProps = {
  ability: CatalogAbility
  x: number
  y: number
}

export function SpellTooltip({ ability, x, y }: TooltipProps) {
  const lines = spellTooltipLines(ability)
  const left = Math.min(x + 16, window.innerWidth - 300)
  const top = Math.min(y + 12, window.innerHeight - 280)

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

export function spellAbilityForNames(names: string[]): CatalogAbility | undefined {
  for (const name of names) {
    if (isAutoActionName(name)) {
      continue
    }
    const ability = abilityForActionName(name)
    if (ability) {
      return ability
    }
  }
  return undefined
}

type HoverProps = {
  names: string[]
  className?: string
  children: ReactNode
  onHover: (ability: CatalogAbility, event: MouseEvent) => void
  onLeave: () => void
}

export function SpellHover({ names, className, children, onHover, onLeave }: HoverProps) {
  const ability = spellAbilityForNames(names)
  if (!ability) {
    return <span className={className}>{children}</span>
  }
  return (
    <span
      className={`spell-hover ${className ?? ''}`.trim()}
      onMouseEnter={(event) => onHover(ability, event)}
      onMouseMove={(event) => onHover(ability, event)}
      onMouseLeave={onLeave}
    >
      {children}
    </span>
  )
}
