import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import {
  ITEMS,
  iconUrl,
  itemEP,
  itemQualityColor,
  itemsForSlot,
  SLOT_LABELS,
  type CatalogItem,
  type StatEP,
} from '../catalog/era.ts'
import { ItemTooltip } from './ItemTooltip.tsx'

type Filter = 'best' | 'epic' | 'all'
type SortKey = 'ep' | 'ilvl' | 'name'

type Props = {
  slot: ItemSlot
  itemId: number
  playerClass: import('../gen/wowfsim/sim_pb.ts').Class
  statEP?: StatEP | null
  onSelect: (id: number) => void
  onClose: () => void
}

export function ItemPickerModal({ slot, itemId, playerClass, statEP, onSelect, onClose }: Props) {
  const all = useMemo(() => {
    const seen = new Map<string, CatalogItem>()
    for (const item of itemsForSlot(slot, playerClass)) {
      const key = `${item.name}|${item.itemLevel ?? 0}`
      const prev = seen.get(key)
      if (!prev || item.id > prev.id) {
        seen.set(key, item)
      }
    }
    return [...seen.values()]
  }, [slot, playerClass])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('best')
  const [sort, setSort] = useState<SortKey>('ep')
  const [preview, setPreview] = useState<CatalogItem | null>(
    () => ITEMS.find((item) => item.id === itemId) ?? all[0] ?? null,
  )
  const searchRef = useRef<HTMLInputElement>(null)
  const title = SLOT_LABELS[slot] ?? 'Items'
  const equipped = ITEMS.find((item) => item.id === itemId) ?? null

  useEffect(() => {
    searchRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choices = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = all.filter((item) => {
      if (filter === 'best' && (item.itemLevel ?? 0) < 60) {
        return false
      }
      if (filter === 'epic' && (item.quality ?? 0) < 4) {
        return false
      }
      if (q && !item.name.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
    return filtered.sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name)
      }
      if (sort === 'ilvl') {
        return (b.itemLevel ?? 0) - (a.itemLevel ?? 0)
      }
      const ae = itemEP(a, statEP)
      const be = itemEP(b, statEP)
      if (ae != null && be != null && ae !== be) {
        return be - ae
      }
      return (b.itemLevel ?? 0) - (a.itemLevel ?? 0)
    })
  }, [all, query, filter, sort, statEP])

  const equippedScore = equipped ? itemEP(equipped, statEP) : null
  const previewScore = preview ? itemEP(preview, statEP) : null
  const delta =
    previewScore != null && equippedScore != null ? previewScore - equippedScore : null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="item-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="item-modal-head">
          <div>
            <p className="item-modal-kicker">Replace</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="item-modal-toolbar">
          <input
            ref={searchRef}
            type="search"
            placeholder="Search by name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search items"
          />
          <div className="item-filter-chips">
            {(
              [
                ['best', 'iLvl 60+'],
                ['epic', 'Epic'],
                ['all', 'All'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? 'on' : ''}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="item-sort">
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="ep">EP</option>
              <option value="ilvl">Item level</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        <p className="item-modal-count">
          {choices.length} of {all.length} items
        </p>

        <div className="item-modal-body">
          <div className="item-modal-list">
            <button
              type="button"
              className={`item-row ${itemId === 0 ? 'selected' : ''}`}
              onClick={() => onSelect(0)}
              onMouseEnter={() => setPreview(null)}
            >
              <span className="item-row-icon empty-icon" />
              <span className="item-row-copy">
                <span className="item-row-name">Empty slot</span>
              </span>
              <span className="item-row-score">—</span>
            </button>
            {choices.map((item) => {
              const score = itemEP(item, statEP)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`item-row ${item.id === itemId ? 'selected' : ''} ${preview?.id === item.id ? 'preview' : ''}`}
                  onClick={() => onSelect(item.id)}
                  onMouseEnter={() => setPreview(item)}
                >
                  <img className="item-row-icon" src={iconUrl(item.icon)} alt="" draggable={false} />
                  <span className="item-row-copy">
                    <span className="item-row-name" style={{ color: itemQualityColor(item) }}>
                      {item.name}
                    </span>
                    <span className="item-row-meta">
                      {item.itemLevel ? `iLvl ${item.itemLevel}` : '—'}
                      {item.itemSubclass ? ` · ${item.itemSubclass}` : ''}
                    </span>
                  </span>
                  <span className="item-row-score">{score == null ? '—' : score.toFixed(0)}</span>
                </button>
              )
            })}
            {choices.length === 0 ? (
              <p className="item-empty">No items match. Try All, or clear the search.</p>
            ) : null}
          </div>

          <aside className="item-preview">
            {preview ? (
              <>
                <ItemTooltip item={preview} embedded />
                <dl className="item-preview-ep">
                  <div>
                    <dt>This item</dt>
                    <dd>{previewScore == null ? '—' : previewScore.toFixed(1)} EP</dd>
                  </div>
                  <div>
                    <dt>Equipped</dt>
                    <dd>{equippedScore == null ? '—' : equippedScore.toFixed(1)} EP</dd>
                  </div>
                  {delta != null ? (
                    <div>
                      <dt>Difference</dt>
                      <dd className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>
                        {delta > 0 ? '+' : ''}
                        {delta.toFixed(1)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <button type="button" className="btn btn-primary" onClick={() => onSelect(preview.id)}>
                  Equip
                </button>
              </>
            ) : (
              <p className="item-preview-empty">Hover an item to compare it with what you have equipped.</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
