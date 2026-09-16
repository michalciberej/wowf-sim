import type { MouseEvent } from 'react'
import { ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import { PAPERDOLL_LEFT, PAPERDOLL_RIGHT, PAPERDOLL_WEAPONS } from '../catalog/era.ts'
import { ItemSlotButton } from './ItemSlotButton.tsx'

type Props = {
  classLabel: string
  gearIds: Record<number, number>
  onOpenSlot: (slot: ItemSlot) => void
  onClearGear: () => void
  onHoverItem: (itemId: number, event: MouseEvent) => void
  onLeaveItem: () => void
}

export function GearPanel({ classLabel, gearIds, onOpenSlot, onClearGear, onHoverItem, onLeaveItem }: Props) {
  function slotButton(slot: ItemSlot, label: string) {
    return (
      <ItemSlotButton
        key={`${slot}-${label}`}
        slot={slot}
        label={label}
        itemId={gearIds[slot] ?? 0}
        onOpen={() => onOpenSlot(slot)}
        onHoverItem={onHoverItem}
        onLeaveItem={onLeaveItem}
      />
    )
  }

  return (
    <section className="gear-tab">
      <div className="doll">
        <div className="slot-col">
          {PAPERDOLL_LEFT.map(({ slot, label }) => slotButton(slot, label))}
        </div>
        <div className="doll-stage">
          <p className="doll-caption">{classLabel}</p>
          <p className="doll-hint">Click a slot to replace an item.</p>
          <button type="button" className="doll-clear" onClick={onClearGear}>
            Unequip all
          </button>
          <div className="weapon-row">
            {PAPERDOLL_WEAPONS.map(({ slot, label }) => slotButton(slot, label))}
          </div>
        </div>
        <div className="slot-col">
          {PAPERDOLL_RIGHT.map(({ slot, label }) => slotButton(slot, label))}
        </div>
      </div>
    </section>
  )
}
