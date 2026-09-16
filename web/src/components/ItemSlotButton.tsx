import type { MouseEvent } from 'react'
import { ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import { ITEMS, iconUrl, itemQualityColor } from '../catalog/era.ts'

type Props = {
  slot: ItemSlot
  label: string
  itemId: number
  onOpen: () => void
  onHoverItem: (itemId: number, event: MouseEvent) => void
  onLeaveItem: () => void
}

export function ItemSlotButton({
  slot,
  label,
  itemId,
  onOpen,
  onHoverItem,
  onLeaveItem,
}: Props) {
  const equipped = ITEMS.find((item) => item.id === itemId)
  const locked = slot === ItemSlot.UNSPECIFIED
  const title = equipped ? `${label}: ${equipped.name}` : `Empty ${label}`

  return (
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
  )
}
