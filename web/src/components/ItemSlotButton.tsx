import type { MouseEvent } from 'react'
import { ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import { ITEMS, iconUrl, itemQualityColor } from '../catalog/era.ts'
import { enchantById, slotHasPermanentEnchants } from '../catalog/enchants.ts'

type Props = {
  slot: ItemSlot
  label: string
  itemId: number
  enchantId?: number
  onOpen: () => void
  onHoverItem: (itemId: number, event: MouseEvent) => void
  onLeaveItem: () => void
  labelAlign?: 'outward' | 'inward'
}

export function ItemSlotButton({
  slot,
  label,
  itemId,
  enchantId = 0,
  onOpen,
  onHoverItem,
  onLeaveItem,
  labelAlign = 'outward',
}: Props) {
  const equipped = ITEMS.find((item) => item.id === itemId)
  const enchant = enchantId ? enchantById(enchantId) : undefined
  const locked = slot === ItemSlot.UNSPECIFIED
  const title = equipped ? `${label}: ${equipped.name}` : `Empty ${label}`
  const showEnchant = slotHasPermanentEnchants(slot)

  return (
    <div className={`slot-wrap ${equipped ? 'filled' : 'empty'} ${labelAlign === 'inward' ? 'label-inward' : ''}`}>
      <button
        type="button"
        className={`slot ${equipped ? 'filled' : 'empty'}`}
        title={title}
        aria-label={title}
        style={equipped ? { borderColor: itemQualityColor(equipped) } : undefined}
        onClick={() => {
          if (!locked) {
            onOpen()
          }
        }}
        onMouseEnter={(event) => {
          if (equipped) {
            onHoverItem(equipped.id, event)
          }
        }}
        onMouseMove={(event) => {
          if (equipped) {
            onHoverItem(equipped.id, event)
          }
        }}
        onMouseLeave={onLeaveItem}
      >
        {equipped ? (
          <img className="slot-art" src={iconUrl(equipped.icon)} alt="" draggable={false} />
        ) : (
          <span className="slot-empty-mark">{label.slice(0, 1)}</span>
        )}
      </button>
      <div className="slot-meta">
        <p className="slot-item-name" style={equipped ? { color: itemQualityColor(equipped) } : undefined}>
          {equipped ? equipped.name : label}
        </p>
        {enchant ? (
          <p className="slot-enchant" title={enchant.useText}>
            {enchant.effectLabel}
          </p>
        ) : equipped && showEnchant ? (
          <p className="slot-enchant muted">No enchant</p>
        ) : null}
      </div>
    </div>
  )
}
