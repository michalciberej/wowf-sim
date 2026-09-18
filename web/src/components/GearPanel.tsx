import type { MouseEvent } from 'react'
import { ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import { PAPERDOLL_LEFT, PAPERDOLL_RIGHT, PAPERDOLL_WEAPONS } from '../catalog/era.ts'
import { ItemSlotButton } from './ItemSlotButton.tsx'

type Props = {
  gearIds: Record<number, number>
  enchantIds: Record<number, number>
  onOpenSlot: (slot: ItemSlot) => void
  onClearGear: () => void
  onHoverItem: (itemId: number, event: MouseEvent) => void
  onLeaveItem: () => void
}

export function GearPanel({ gearIds, enchantIds, onOpenSlot, onClearGear, onHoverItem, onLeaveItem }: Props) {
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

  return (
    <section className="gear-tab">
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
