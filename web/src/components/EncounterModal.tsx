import {
  DEFAULT_BOSS_ARMOR,
  MAX_ENCOUNTER_TARGETS,
  type EncounterFoe,
} from '../persist.ts'

type Props = {
  targets: EncounterFoe[]
  onChange: (next: EncounterFoe[]) => void
  onClose: () => void
}

export function EncounterModal({ targets, onChange, onClose }: Props) {
  function update(index: number, patch: Partial<EncounterFoe>) {
    onChange(targets.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addTarget() {
    if (targets.length >= MAX_ENCOUNTER_TARGETS) {
      return
    }
    const n = targets.length
    onChange([...targets, { name: n === 0 ? 'Boss' : `Add ${n}`, armor: DEFAULT_BOSS_ARMOR }])
  }

  function removeTarget(index: number) {
    if (targets.length <= 1) {
      return
    }
    onChange(targets.filter((_, i) => i !== index))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="item-modal encounter-modal"
        role="dialog"
        aria-labelledby="encounter-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="item-modal-head">
          <div>
            <p className="item-modal-kicker">Encounter</p>
            <h2 id="encounter-modal-title">Targets</h2>
          </div>
          <div className="item-modal-head-actions">
            <button type="button" className="modal-close" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <p className="encounter-modal-lead">
          The sim fights these enemies for the whole duration. Extra targets enable Cleave,
          Whirlwind (up to 4), and Sweeping Strikes.
        </p>
        <div className="item-modal-body encounter-modal-body">
          <ul className="encounter-target-list">
            {targets.map((target, index) => (
              <li key={`${target.name}-${index}`} className="encounter-target">
                <span className="encounter-target-index">{index === 0 ? 'Boss' : `Add ${index}`}</span>
                <label>
                  Name
                  <input
                    type="text"
                    maxLength={32}
                    value={target.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                </label>
                <label>
                  Armor
                  <input
                    type="number"
                    min={0}
                    max={20000}
                    value={target.armor}
                    onChange={(event) =>
                      update(index, { armor: Number(event.target.value) || 0 })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="encounter-remove"
                  disabled={targets.length <= 1}
                  onClick={() => removeTarget(index)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
        <footer className="encounter-modal-foot">
          <p>
            {targets.length} / {MAX_ENCOUNTER_TARGETS} targets
          </p>
          <button
            type="button"
            disabled={targets.length >= MAX_ENCOUNTER_TARGETS}
            onClick={addTarget}
          >
            Add opponent
          </button>
        </footer>
      </div>
    </div>
  )
}
