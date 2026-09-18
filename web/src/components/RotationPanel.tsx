import { iconUrl } from '../catalog/era.ts'
import { rotationAbilities, type CatalogAbility } from '../catalog/abilities.ts'
import type { Class } from '../gen/wowfsim/sim_pb.ts'

type Props = {
  playerClass: Class
  race: number
  gearIds?: Record<number, number>
  combatPotion?: number
  priorities: Record<string, number>
  onChange: (id: string, priority: number) => void
  onReset: () => void
}

function hint(ability: CatalogAbility) {
  const bits = [ability.kind || 'ability']
  if (ability.gcd === false) {
    bits.push('off GCD')
  }
  if (ability.resource && ability.cost) {
    bits.push(`${ability.cost} ${ability.resource}`)
  }
  if (ability.cooldown) {
    bits.push(`${ability.cooldown}s CD`)
  }
  if (ability.requiresTalent) {
    bits.push('talent')
  }
  return bits.join(' · ')
}

export function RotationPanel({ playerClass, race, gearIds, combatPotion, priorities, onChange, onReset }: Props) {
  const abilities = rotationAbilities(playerClass, race, gearIds, combatPotion)
  const ordered = [...abilities].sort(
    (a, b) => (priorities[b.id] ?? b.priority) - (priorities[a.id] ?? a.priority) || a.name.localeCompare(b.name),
  )

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Rotation</h2>
          <p>
            Higher numbers are tried first. Set a spell to 0 to stop the sim from using it.
            Talent-only spells still require the talent. Equipped on-use trinkets and the combat
            potion fire off GCD at pull with Recklessness and Death Wish.
          </p>
        </div>
        <button type="button" className="btn" onClick={onReset}>
          Reset defaults
        </button>
      </header>
      <ol className="rotation-list">
        {ordered.map((ability, index) => (
            <li key={ability.id} className={`rotation-row ${(priorities[ability.id] ?? ability.priority) <= 0 ? 'disabled' : ''}`}>
            <span className="rotation-order">{index + 1}</span>
            <img src={iconUrl(ability.icon)} alt="" />
            <div>
              <strong>{ability.name}</strong>
              <span>{hint(ability)}</span>
            </div>
            <label>
              Priority
              <input
                type="number"
                step="1"
                value={priorities[ability.id] ?? ability.priority}
                onChange={(event) => onChange(ability.id, Number(event.target.value))}
              />
            </label>
          </li>
        ))}
      </ol>
    </section>
  )
}
