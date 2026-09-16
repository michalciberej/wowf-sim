import { Race } from '../gen/wowfsim/sim_pb.ts'
import { iconUrl, RACIALS } from '../catalog/era.ts'
import { BUFFS, BUFF_SECTIONS, buffsInCategory, type RaidBuff } from '../catalog/buffs.ts'

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

type Props = {
  race: Race
  duration: number
  iterations: number
  selected: Record<string, boolean>
  onRace: (race: Race) => void
  onDuration: (value: number) => void
  onIterations: (value: number) => void
  onChange: (next: Record<string, boolean>) => void
}

export function SettingsPanel({
  race,
  duration,
  iterations,
  selected,
  onRace,
  onDuration,
  onIterations,
  onChange,
}: Props) {
  const racial = RACIALS.find((entry) => entry.race === race)

  function setBuff(id: string, on: boolean) {
    onChange({ ...selected, [id]: on })
  }

  function setMany(ids: string[], on: boolean) {
    const next = { ...selected }
    for (const id of ids) {
      next[id] = on
    }
    onChange(next)
  }

  return (
    <section className="settings-frame">
      <header className="settings-toolbar">
        <h2>Settings</h2>
        <div className="buff-presets">
          <button
            type="button"
            onClick={() => setMany(BUFFS.filter((buff) => buff.default).map((buff) => buff.id), true)}
          >
            Typical raid
          </button>
          <button
            type="button"
            onClick={() => setMany(buffsInCategory('World Buffs').map((buff) => buff.id), true)}
          >
            World buffs
          </button>
          <button type="button" onClick={() => onChange({})}>
            Clear
          </button>
        </div>
      </header>

      <div className="settings-grid">
        <article className="settings-place">
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
          <p className="buff-help">
            The dummy has 3731 armor, so Sunder, Faerie Fire, and Curse of Recklessness reduce
            mitigation.
          </p>
        </article>

        <article className="settings-place">
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
          {racial ? <p className="buff-help">{racial.effect}</p> : null}
        </article>

        {BUFF_SECTIONS.map((category) => {
          const buffs = buffsInCategory(category)
          const active = buffs.filter((buff) => selected[buff.id]).length
          return (
            <article key={category} className="settings-place">
              <h3>
                {category}
                <span>
                  {active}/{buffs.length}
                </span>
              </h3>
              <div className="buff-icons">
                {buffs.map((buff) => (
                  <BuffToggle
                    key={buff.id}
                    buff={buff}
                    on={!!selected[buff.id]}
                    onToggle={(value) => setBuff(buff.id, value)}
                  />
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function BuffToggle({
  buff,
  on,
  onToggle,
}: {
  buff: RaidBuff
  on: boolean
  onToggle: (on: boolean) => void
}) {
  return (
    <label className={on ? 'buff-icon on' : 'buff-icon'} title={buff.name} data-name={buff.name}>
      <input
        type="checkbox"
        checked={on}
        aria-label={buff.name}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <img src={iconUrl(buff.icon)} alt="" draggable={false} />
    </label>
  )
}
