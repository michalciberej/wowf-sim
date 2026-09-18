import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import { PAPERDOLL_LEFT, PAPERDOLL_RIGHT, PAPERDOLL_WEAPONS } from '../catalog/era.ts'
import {
  gearSnapshotEquals,
  nextGearSetName,
  type SavedGearSet,
} from '../persist.ts'
import { ItemSlotButton } from './ItemSlotButton.tsx'

type Props = {
  gearIds: Record<number, number>
  enchantIds: Record<number, number>
  gearSets: SavedGearSet[]
  activeGearSetId: string
  onOpenSlot: (slot: ItemSlot) => void
  onClearGear: () => void
  onHoverItem: (itemId: number, event: MouseEvent) => void
  onLeaveItem: () => void
  onLoadSet: (id: string) => void
  onSaveSet: (name: string) => void
  onSaveSetAs: (name: string) => void
  onDeleteSet: () => void
}

export function GearPanel({
  gearIds,
  enchantIds,
  gearSets,
  activeGearSetId,
  onOpenSlot,
  onClearGear,
  onHoverItem,
  onLeaveItem,
  onLoadSet,
  onSaveSet,
  onSaveSetAs,
  onDeleteSet,
}: Props) {
  const active = gearSets.find((set) => set.id === activeGearSetId)
  const [name, setName] = useState(active?.name ?? '')
  const dirty = Boolean(
    active && !gearSnapshotEquals(active, { gearIds, enchantIds }),
  )

  useEffect(() => {
    setName(active?.name ?? '')
  }, [active?.id, active?.name])

  function slotButton(slot: ItemSlot, label: string, labelAlign: 'outward' | 'inward' = 'outward') {
    return (
      <ItemSlotButton
        key={`${slot}-${label}`}
        slot={slot}
        label={label}
        itemId={gearIds[slot] ?? 0}
        enchantId={enchantIds[slot] ?? 0}
        labelAlign={labelAlign}
        onOpen={() => onOpenSlot(slot)}
        onHoverItem={onHoverItem}
        onLeaveItem={onLeaveItem}
      />
    )
  }

  const saveName = name.trim() || active?.name || nextGearSetName(gearSets)

  return (
    <section className="gear-tab">
      <div className="gear-sets">
        <label className="gear-sets-field">
          <span>Saved sets</span>
          <select
            value={activeGearSetId}
            onChange={(event) => onLoadSet(event.target.value)}
          >
            <option value="">{gearSets.length ? 'Current (unsaved)' : 'No saved sets'}</option>
            {gearSets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
                {set.id === activeGearSetId && dirty ? ' *' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="gear-sets-field">
          <span>Name</span>
          <input
            value={name}
            maxLength={40}
            placeholder={nextGearSetName(gearSets)}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="gear-sets-actions">
          <button type="button" className="btn" onClick={() => onSaveSet(saveName)}>
            {active ? 'Update set' : 'Save set'}
          </button>
          <button type="button" className="btn" onClick={() => onSaveSetAs(saveName)}>
            Save as
          </button>
          <button type="button" className="btn" disabled={!active} onClick={onDeleteSet}>
            Delete
          </button>
        </div>
      </div>
      <div className="doll">
        <button type="button" className="doll-clear" onClick={onClearGear}>
          Unequip all
        </button>
        <div className="doll-cols">
          <div className="slot-col">
            {PAPERDOLL_LEFT.map(({ slot, label }) => slotButton(slot, label))}
            <div className="weapon-stack">
              {PAPERDOLL_WEAPONS.map(({ slot, label }) => slotButton(slot, label))}
            </div>
          </div>
          <div className="slot-col">
            {PAPERDOLL_RIGHT.map(({ slot, label }) => slotButton(slot, label, 'inward'))}
          </div>
        </div>
      </div>
    </section>
  )
}
