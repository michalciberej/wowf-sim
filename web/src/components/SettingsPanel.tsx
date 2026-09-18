import { useState } from 'react'
import { Class, Race, WarriorStance, ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import { iconUrl, ITEMS, type CatalogItem } from '../catalog/era.ts'
import {
  buffsInCategory,
  WEAPON_TEMPS,
  WEAPON_TEMP_OH,
  type RaidBuff,
} from '../catalog/buffs.ts'
import { combatPotionsForClass } from '../catalog/potions.ts'
import { BuffTooltip } from './BuffTooltip.tsx'
import { ItemTooltip } from './ItemTooltip.tsx'

const RACES: Array<{ value: Race; label: string }> = [
  { value: Race.ORC, label: 'Orc' },
  { value: Race.HUMAN, label: 'Human' },
  { value: Race.TROLL, label: 'Troll' },
  { value: Race.UNDEAD, label: 'Undead' },
  { value: Race.TAUREN, label: 'Tauren' },
  { value: Race.DWARF, label: 'Dwarf' },
  { value: Race.NIGHT_ELF, label: 'Night Elf' },
  { value: Race.GNOME, label: 'Gnome' },
  { value: Race.SKYBORNE, label: 'Skyborne' },
]

type Hover =
  | { kind: 'buff'; buff: RaidBuff; x: number; y: number }
  | { kind: 'potion'; item: CatalogItem; x: number; y: number }

type Props = {
  playerClass: Class
  race: Race
  stance: WarriorStance
  combatPotion: number
  mhWeaponTemp: string
  ohWeaponTemp: string
  gearIds: Record<number, number>
  duration: number
  iterations: number
  rngSeed: number
  selected: Record<string, boolean>
  onRace: (race: Race) => void
  onStance: (stance: WarriorStance) => void
  onCombatPotion: (id: number) => void
  onMhWeaponTemp: (id: string) => void
  onOhWeaponTemp: (id: string) => void
  onDuration: (value: number) => void
  onIterations: (value: number) => void
  onRngSeed: (value: number) => void
  onChange: (next: Record<string, boolean>) => void
}

export function SettingsPanel({
  playerClass,
  race,
  stance,
  combatPotion,
  mhWeaponTemp,
  ohWeaponTemp,
  gearIds,
  duration,
  iterations,
  rngSeed,
  selected,
  onRace,
  onStance,
  onCombatPotion,
  onMhWeaponTemp,
  onOhWeaponTemp,
  onDuration,
  onIterations,
  onRngSeed,
  onChange,
}: Props) {
  const potions = combatPotionsForClass(playerClass)
  const [hover, setHover] = useState<Hover | null>(null)
  const mhItem = ITEMS.find((item) => item.id === (gearIds[ItemSlot.MAIN_HAND] ?? 0))
  const ohItem = ITEMS.find((item) => item.id === (gearIds[ItemSlot.OFF_HAND] ?? 0))
  const canOhStone = Boolean(mhItem?.hand !== '2h' && ohItem?.weaponDps && ohItem.hand !== '2h')
  const stoneCount = (mhWeaponTemp ? 1 : 0) + (canOhStone && ohWeaponTemp ? 1 : 0)

  function setBuff(id: string, on: boolean) {
    onChange({ ...selected, [id]: on })
  }

  function trackBuff(buff: RaidBuff, x: number, y: number) {
    setHover({ kind: 'buff', buff, x, y })
  }

  function trackPotion(item: CatalogItem, x: number, y: number) {
    setHover({ kind: 'potion', item, x, y })
  }

  function buffBlock(category: string) {
    const buffs = buffsInCategory(category)
    const active = buffs.filter((buff) => selected[buff.id]).length
    return (
      <div className="settings-place">
        <h3>
          {category}
          <span>
            {active}/{buffs.length}
          </span>
        </h3>
        <div className="buff-icons">
          {buffs.map((buff) => (
            <IconToggle
              key={buff.id}
              name={buff.name}
              icon={buff.icon}
              on={!!selected[buff.id]}
              onToggle={(value) => setBuff(buff.id, value)}
              onHover={(x, y) => trackBuff(buff, x, y)}
              onLeave={() => setHover(null)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <section className="settings-frame">
      <header className="settings-toolbar">
        <h2>Settings</h2>
      </header>

      <div className="settings-grid">
        <div className="settings-col">
          <div className="settings-place">
            <h3>Encounter</h3>
            <label>
              Fight length (s)
              <input
                type="number"
                min={10}
                max={600}
                value={duration}
                onChange={(event) => onDuration(Number(event.target.value))}
              />
            </label>
            <label>
              Iterations
              <input
                type="number"
                min={1}
                max={20000}
                value={iterations}
                onChange={(event) => onIterations(Number(event.target.value))}
              />
            </label>
            <label>
              RNG seed
              <input
                type="number"
                min={0}
                value={rngSeed}
                onChange={(event) => onRngSeed(Number(event.target.value) || 0)}
              />
            </label>
          </div>
          <div className="settings-place">
            <h3>Player</h3>
            <label>
              Race
              <select value={race} onChange={(event) => onRace(Number(event.target.value) as Race)}>
                {RACES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            {playerClass === Class.WARRIOR ? (
              <label>
                Stance
                <select
                  value={stance}
                  onChange={(event) => onStance(Number(event.target.value) as WarriorStance)}
                >
                  <option value={WarriorStance.BERSERKER}>Berserker (+3% crit)</option>
                  <option value={WarriorStance.BATTLE}>Battle</option>
                  <option value={WarriorStance.DEFENSIVE}>Defensive (−10% damage)</option>
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <div className="settings-col">
          {buffBlock('Consumables')}
          <div className="settings-place">
            <h3>
              Weapon Enchant
              <span>
                {stoneCount}/{canOhStone ? 2 : 1}
              </span>
            </h3>
            <p className="buff-hand">Main Hand</p>
            <div className="buff-icons">
              {WEAPON_TEMPS.map((buff) => (
                <IconToggle
                  key={`mh-${buff.id}`}
                  name={buff.name}
                  icon={buff.icon}
                  on={mhWeaponTemp === buff.id}
                  onToggle={(value) => onMhWeaponTemp(value ? buff.id : '')}
                  onHover={(x, y) => trackBuff(buff, x, y)}
                  onLeave={() => setHover(null)}
                />
              ))}
            </div>
            <p className="buff-hand">Off Hand</p>
            <div className={`buff-icons ${canOhStone ? '' : 'disabled'}`}>
              {WEAPON_TEMP_OH.map((buff) => (
                <IconToggle
                  key={`oh-${buff.id}`}
                  name={buff.name}
                  icon={buff.icon}
                  on={canOhStone && ohWeaponTemp === buff.id}
                  disabled={!canOhStone}
                  onToggle={(value) => onOhWeaponTemp(value ? buff.id : '')}
                  onHover={(x, y) => trackBuff(buff, x, y)}
                  onLeave={() => setHover(null)}
                />
              ))}
            </div>
          </div>
          <div className="settings-place">
            <h3>
              Combat Potion
              <span>
                {combatPotion ? 1 : 0}/{potions.length}
              </span>
            </h3>
            <div className="buff-icons">
              {potions.map((item) => (
                <IconToggle
                  key={item.id}
                  name={item.name}
                  icon={item.icon ?? 'inv_potion_41'}
                  on={combatPotion === item.id}
                  onToggle={(value) => onCombatPotion(value ? item.id : 0)}
                  onHover={(x, y) => trackPotion(item, x, y)}
                  onLeave={() => setHover(null)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="settings-col">
          {buffBlock('Raid Buffs')}
          {buffBlock('World Buffs')}
          {buffBlock('Debuffs')}
        </div>
      </div>
      {hover?.kind === 'buff' ? <BuffTooltip buff={hover.buff} x={hover.x} y={hover.y} /> : null}
      {hover?.kind === 'potion' ? <ItemTooltip item={hover.item} x={hover.x} y={hover.y} /> : null}
    </section>
  )
}

function IconToggle({
  name,
  icon,
  on,
  onToggle,
  onHover,
  onLeave,
  disabled,
}: {
  name: string
  icon: string
  on: boolean
  onToggle: (on: boolean) => void
  onHover: (x: number, y: number) => void
  onLeave: () => void
  disabled?: boolean
}) {
  function pointFrom(event: { clientX?: number; clientY?: number; currentTarget: EventTarget & Element }) {
    if (event.clientX && event.clientY) {
      onHover(event.clientX, event.clientY)
      return
    }
    const box = event.currentTarget.getBoundingClientRect()
    onHover(box.right, box.top)
  }

  return (
    <label
      className={`${on ? 'buff-icon on' : 'buff-icon'}${disabled ? ' off' : ''}`}
      onMouseEnter={pointFrom}
      onMouseMove={pointFrom}
      onMouseLeave={onLeave}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        aria-label={name}
        onChange={(event) => onToggle(event.target.checked)}
        onFocus={pointFrom}
        onBlur={onLeave}
      />
      <img src={iconUrl(icon)} alt="" draggable={false} />
    </label>
  )
}
