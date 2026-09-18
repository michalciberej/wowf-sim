import { useEffect, useMemo, useRef, useState } from 'react'
import { ItemSlot } from '../gen/wowfsim/sim_pb.ts'
import {
  ITEMS,
  iconUrl,
  itemEP,
  itemQualityColor,
  itemsForSlot,
  SLOT_LABELS,
  wowheadItemUrl,
  type CatalogItem,
  type StatEP,
} from '../catalog/era.ts'
import { enchantsForSlot, slotHasPermanentEnchants, type CatalogEnchant } from '../catalog/enchants.ts'
import { ItemTooltip } from './ItemTooltip.tsx'

type SortKey = 'ep' | 'ilvl' | 'name'
type QualityId = 2 | 3 | 4 | 5

const QUALITY_CHIPS: Array<{ id: QualityId; label: string }> = [
  { id: 5, label: 'Legendary' },
  { id: 4, label: 'Epic' },
  { id: 3, label: 'Rare' },
  { id: 2, label: 'Uncommon' },
]

const HAND_LABEL: Record<string, string> = {
  '2h': 'Two-hand',
  '1h': 'One-hand',
  oh: 'Off-hand',
}

type Props = {
  slot: ItemSlot
  itemId: number
  enchantId: number
  playerClass: import('../gen/wowfsim/sim_pb.ts').Class
  statEP?: StatEP | null
  onSelect: (id: number) => void
  onSelectEnchant: (id: number) => void
  onClose: () => void
}

function Chip({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={on ? 'on' : ''} onClick={onClick}>
      {label}
    </button>
  )
}

function enchantEP(enchant: CatalogEnchant, ep: StatEP | null | undefined): number | null {
  if (!ep) {
    return null
  }
  return itemEP(
    {
      id: enchant.id,
      name: enchant.name,
      slot: 0,
      strength: enchant.strength,
      agility: enchant.agility,
      intellect: enchant.intellect,
      attackPower: enchant.attackPower,
      spellPower: enchant.spellPower,
      critChance: enchant.critChance,
      hitChance: enchant.hitChance,
      spellCritChance: enchant.spellCritChance,
      spellHitChance: enchant.spellHitChance,
    },
    ep,
  )
}

export function ItemPickerModal({
  slot,
  itemId,
  enchantId,
  playerClass,
  statEP,
  onSelect,
  onSelectEnchant,
  onClose,
}: Props) {
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
  const [qualities, setQualities] = useState<QualityId[]>([])
  const [ilvl60, setIlvl60] = useState(false)
  const [hand, setHand] = useState('')
  const [subclass, setSubclass] = useState('')
  const [sort, setSort] = useState<SortKey>('ep')
  const [preview, setPreview] = useState<CatalogItem | null>(
    () => ITEMS.find((item) => item.id === itemId) ?? all[0] ?? null,
  )
  const searchRef = useRef<HTMLInputElement>(null)
  const title = SLOT_LABELS[slot] ?? 'Items'
  const equipped = ITEMS.find((item) => item.id === itemId) ?? null
  const slotEnchantable = slotHasPermanentEnchants(slot)
  const canEnchant = Boolean(equipped) && slotEnchantable
  const [mode, setMode] = useState<'items' | 'enchants'>('items')
  const [previewEnchant, setPreviewEnchant] = useState<CatalogEnchant | null>(null)
  const weaponSlot =
    slot === ItemSlot.MAIN_HAND || slot === ItemSlot.OFF_HAND || slot === ItemSlot.RANGED

  const qualityOptions = QUALITY_CHIPS

  const handOptions = useMemo(() => {
    if (!weaponSlot) {
      return []
    }
    const present = new Set(all.map((item) => item.hand).filter(Boolean) as string[])
    return ['2h', '1h', 'oh'].filter((key) => present.has(key))
  }, [all, weaponSlot])

  const subclassOptions = useMemo(() => {
    if (!weaponSlot) {
      return []
    }
    return [...new Set(all.map((item) => item.itemSubclass).filter(Boolean) as string[])].sort((a, b) =>
      a.localeCompare(b),
    )
  }, [all, weaponSlot])

  useEffect(() => {
    setHand('')
    setSubclass('')
    setQualities([])
    setIlvl60(false)
    setMode('items')
  }, [slot])

  useEffect(() => {
    if (!canEnchant) {
      setMode('items')
    }
  }, [canEnchant])

  const enchantChoices = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = enchantsForSlot(slot, equipped, 'permanent').filter((enchant) => {
      if (!q) {
        return true
      }
      return `${enchant.name} ${enchant.effectLabel} ${enchant.useText}`.toLowerCase().includes(q)
    })
    return list.sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name)
      }
      const ae = enchantEP(a, statEP)
      const be = enchantEP(b, statEP)
      if (ae != null && be != null && ae !== be) {
        return be - ae
      }
      return a.name.localeCompare(b.name)
    })
  }, [slot, equipped, query, sort, statEP])

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
      if (ilvl60 && (item.itemLevel ?? 0) < 60) {
        return false
      }
      if (qualities.length && !qualities.includes((item.quality ?? 0) as QualityId)) {
        return false
      }
      if (hand && item.hand !== hand) {
        return false
      }
      if (subclass && item.itemSubclass !== subclass) {
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
  }, [all, query, qualities, ilvl60, hand, subclass, sort, statEP])

  const equippedScore = equipped ? itemEP(equipped, statEP) : null
  const previewScore = preview ? itemEP(preview, statEP) : null
  const delta =
    previewScore != null && equippedScore != null ? previewScore - equippedScore : null

  function applyEnchant(id: number) {
    if (!canEnchant) {
      return
    }
    onSelectEnchant(id)
  }

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
            <p className="item-modal-kicker">{mode === 'enchants' ? 'Enchant' : 'Replace'}</p>
            <h2>{title}</h2>
          </div>
          <div className="item-modal-head-actions">
            {slotEnchantable ? (
              <>
                <button
                  type="button"
                  className={`item-mode-icon ${mode === 'items' ? 'on' : ''}`}
                  title="Item list"
                  aria-label="Show items"
                  aria-pressed={mode === 'items'}
                  onClick={() => setMode('items')}
                >
                  <img src={iconUrl('inv_misc_bag_08')} alt="" draggable={false} />
                </button>
                <button
                  type="button"
                  className={`item-mode-icon ${mode === 'enchants' ? 'on' : ''}`}
                  title={canEnchant ? 'Enchant this slot' : 'Equip an item before enchanting'}
                  aria-label="Show enchantments"
                  aria-pressed={mode === 'enchants'}
                  disabled={!canEnchant}
                  onClick={() => setMode('enchants')}
                >
                  <img src={iconUrl('inv_misc_enchantedscroll')} alt="" draggable={false} />
                </button>
              </>
            ) : null}
            <button type="button" className="modal-close" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="item-modal-toolbar">
          <input
            ref={searchRef}
            type="search"
            placeholder={mode === 'enchants' ? 'Search enchants' : 'Search by name'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={mode === 'enchants' ? 'Search enchants' : 'Search items'}
          />
          <label className="item-sort">
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="ep">EP</option>
              <option value="ilvl">Item level</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        {mode === 'enchants' ? null : (
        <div className="item-filter-rows">
          <div className="item-filter-row">
            <span className="item-filter-label">Quality</span>
            <div className="item-filter-chips">
              <Chip label="All" on={qualities.length === 0} onClick={() => setQualities([])} />
              {qualityOptions.map((chip) => (
                <Chip
                  key={chip.id}
                  label={chip.label}
                  on={qualities.includes(chip.id)}
                  onClick={() =>
                    setQualities((prev) =>
                      prev.includes(chip.id) ? prev.filter((id) => id !== chip.id) : [...prev, chip.id],
                    )
                  }
                />
              ))}
              <Chip label="iLvl 60+" on={ilvl60} onClick={() => setIlvl60((on) => !on)} />
            </div>
          </div>
          {handOptions.length > 1 ? (
            <div className="item-filter-row">
              <span className="item-filter-label">Hand</span>
              <div className="item-filter-chips">
                <Chip label="Any" on={hand === ''} onClick={() => setHand('')} />
                {handOptions.map((key) => (
                  <Chip
                    key={key}
                    label={HAND_LABEL[key] ?? key}
                    on={hand === key}
                    onClick={() => setHand(hand === key ? '' : key)}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {subclassOptions.length > 1 ? (
            <div className="item-filter-row">
              <span className="item-filter-label">Type</span>
              <div className="item-filter-chips">
                <Chip label="Any" on={subclass === ''} onClick={() => setSubclass('')} />
                {subclassOptions.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    on={subclass === name}
                    onClick={() => setSubclass(subclass === name ? '' : name)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        )}

        <p className="item-modal-count">
          {mode === 'enchants'
            ? `${enchantChoices.length} enchants`
            : `${choices.length} of ${all.length} items`}
        </p>

        <div className="item-modal-body">
          {mode === 'enchants' ? (
            <>
              <div className="item-modal-list">
                <button
                  type="button"
                  className={`item-row ${enchantId === 0 ? 'selected' : ''}`}
                  onClick={() => applyEnchant(0)}
                  onMouseEnter={() => setPreviewEnchant(null)}
                >
                  <span className="item-row-icon empty-icon" />
                  <span className="item-row-copy">
                    <span className="item-row-name">No enchant</span>
                  </span>
                  <span className="item-row-score">—</span>
                </button>
                {enchantChoices.map((enchant) => {
                  const score = enchantEP(enchant, statEP)
                  return (
                    <div
                      key={enchant.id}
                      className={`item-row ${enchant.id === enchantId ? 'selected' : ''} ${previewEnchant?.id === enchant.id ? 'preview' : ''}`}
                      onMouseEnter={() => setPreviewEnchant(enchant)}
                    >
                      <a
                        className="item-row-icon-link"
                        href={wowheadItemUrl(enchant.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open ${enchant.name} on Wowhead`}
                        aria-label={`Open ${enchant.name} on Wowhead`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <img className="item-row-icon" src={iconUrl(enchant.icon)} alt="" draggable={false} />
                      </a>
                      <button type="button" className="item-row-main" onClick={() => applyEnchant(enchant.id)}>
                        <span className="item-row-copy">
                          <span className="item-row-name">{enchant.name}</span>
                          <span className="item-row-meta">
                            {enchant.effectLabel}
                            {enchant.proc ? ' · proc (later)' : ''}
                          </span>
                        </span>
                        <span className="item-row-score">{score == null ? '—' : score.toFixed(0)}</span>
                      </button>
                    </div>
                  )
                })}
                {enchantChoices.length === 0 ? (
                  <p className="item-empty">No enchants for this slot.</p>
                ) : null}
              </div>
              <aside className="item-preview">
                {previewEnchant ? (
                  <>
                    <div className="wow-tooltip embedded">
                      <p className="wow-tooltip-name">{previewEnchant.name}</p>
                      <p className="wow-tooltip-slot">{previewEnchant.kind}</p>
                      {previewEnchant.useText ? (
                        <p className="wow-tooltip-use">Use: {previewEnchant.useText}</p>
                      ) : null}
                    </div>
                    <a
                      className="item-wowhead-link"
                      href={wowheadItemUrl(previewEnchant.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on Wowhead
                    </a>
                  </>
                ) : (
                  <p className="item-preview-empty">Hover an enchant to read its effect.</p>
                )}
              </aside>
            </>
          ) : (
            <>
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
                <div
                  key={item.id}
                  className={`item-row ${item.id === itemId ? 'selected' : ''} ${preview?.id === item.id ? 'preview' : ''}`}
                  onMouseEnter={() => setPreview(item)}
                >
                  <a
                    className="item-row-icon-link"
                    href={wowheadItemUrl(item.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${item.name} on Wowhead`}
                    aria-label={`Open ${item.name} on Wowhead`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <img className="item-row-icon" src={iconUrl(item.icon)} alt="" draggable={false} />
                  </a>
                  <button type="button" className="item-row-main" onClick={() => onSelect(item.id)}>
                    <span className="item-row-copy">
                      <span className="item-row-name" style={{ color: itemQualityColor(item) }}>
                        {item.name}
                      </span>
                      <span className="item-row-meta">
                        {item.itemLevel ? `iLvl ${item.itemLevel}` : '—'}
                        {item.hand === '2h' ? ' · 2H' : item.hand === '1h' ? ' · 1H' : ''}
                        {item.itemSubclass ? ` · ${item.itemSubclass}` : ''}
                      </span>
                    </span>
                    <span className="item-row-score">{score == null ? '—' : score.toFixed(0)}</span>
                  </button>
                </div>
              )
            })}
            {choices.length === 0 ? (
              <p className="item-empty">No items match. Clear a filter or the search.</p>
            ) : null}
          </div>

          <aside className="item-preview">
            {preview ? (
              <>
                <ItemTooltip item={preview} embedded />
                <a
                  className="item-wowhead-link"
                  href={wowheadItemUrl(preview.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Wowhead
                </a>
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
              </>
            ) : (
              <p className="item-preview-empty">Hover an item to compare it with what you have equipped.</p>
            )}
          </aside>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
