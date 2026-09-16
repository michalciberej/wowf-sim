import {
  TALENT_COLS,
  TALENT_POINTS,
  TALENT_ROWS,
  iconUrl,
  isTreeStateValid,
  prereqOf,
  talentsForClass,
  treeBackground,
  treesForClass,
  type CatalogTalent,
} from '../catalog/era.ts'
import type { Class } from '../gen/wowfsim/sim_pb.ts'
import type { TalentRanks } from '../sim/engine'

type Props = {
  playerClass: Class
  ranks: TalentRanks
  onChange: (update: TalentRanks | ((current: TalentRanks) => TalentRanks)) => void
}

export function TalentTrees({ playerClass, ranks, onChange }: Props) {
  const trees = treesForClass(playerClass)
  const talents = talentsForClass(playerClass)
  const spentTotal = talents.reduce((sum, talent) => sum + (ranks[talent.id] ?? 0), 0)
  const remaining = TALENT_POINTS - spentTotal

  function spentInTree(tree: string) {
    return talents
      .filter((talent) => talent.tree === tree)
      .reduce((sum, talent) => sum + (ranks[talent.id] ?? 0), 0)
  }

  function rowUnlocked(tree: string, row: number) {
    return spentInTree(tree) >= (row - 1) * 5
  }

  function addPoint(talent: CatalogTalent) {
    onChange((current) => {
      const spentTotal = talents.reduce(
        (sum, entry) => sum + (current[entry.id] ?? 0),
        0,
      )
      const remaining = TALENT_POINTS - spentTotal
      const rank = current[talent.id] ?? 0
      const treeSpent = talents
        .filter((entry) => entry.tree === talent.tree)
        .reduce((sum, entry) => sum + (current[entry.id] ?? 0), 0)
      if (
        remaining <= 0 ||
        rank >= talent.maxRank ||
        treeSpent < (talent.row - 1) * 5
      ) {
        return current
      }
      const treeTalents = talents.filter((entry) => entry.tree === talent.tree)
      const pre = prereqOf(treeTalents, talent)
      if (pre && (current[pre.id] ?? 0) < pre.maxRank) {
        return current
      }
      return { ...current, [talent.id]: rank + 1 }
    })
  }

  function removePoint(talent: CatalogTalent) {
    onChange((current) => {
      const rank = current[talent.id] ?? 0
      if (rank <= 0) {
        return current
      }
      const next = { ...current, [talent.id]: rank - 1 }
      const treeTalents = talents.filter((entry) => entry.tree === talent.tree)
      return isTreeStateValid(treeTalents, next) ? next : current
    })
  }

  return (
    <section className="talent-frame">
      <header className="talent-frame-head">
        <h2>Talents</h2>
        <p>
          {remaining} points left · {spentTotal}/{TALENT_POINTS}
        </p>
      </header>
      <div className="talent-trees">
        {trees.map((tree) => {
          const background = treeBackground(playerClass, tree)
          return (
            <div
              key={tree}
              className="talent-tree"
              style={
                background
                  ? {
                      backgroundImage: `linear-gradient(rgba(8, 6, 4, 0.35), rgba(8, 6, 4, 0.55)), url(${background})`,
                    }
                  : undefined
              }
            >
              <h3>
                {tree}{' '}
                <span>
                  {spentInTree(tree)}{' '}
                  {spentInTree(tree) === 1 ? 'point' : 'points'}
                </span>
              </h3>
              <div
                className="talent-grid"
                style={{
                  gridTemplateColumns: `repeat(${TALENT_COLS}, 44px)`,
                  gridTemplateRows: `repeat(${TALENT_ROWS}, 44px)`,
                }}
              >
                {Array.from({ length: TALENT_ROWS * TALENT_COLS }, (_, index) => {
                  const row = Math.floor(index / TALENT_COLS) + 1
                  const col = (index % TALENT_COLS) + 1
                  const talent = talents.find(
                    (entry) =>
                      entry.tree === tree && entry.row === row && entry.col === col,
                  )
                  if (!talent) {
                    return <div key={`${tree}-${index}`} className="talent empty" />
                  }
                  const rank = ranks[talent.id] ?? 0
                  const locked = !rowUnlocked(tree, talent.row) && rank === 0
                  const treeTalents = talents.filter((entry) => entry.tree === tree)
                  const pre = prereqOf(treeTalents, talent)
                  const prereqLocked =
                    !!pre && (ranks[pre.id] ?? 0) < pre.maxRank && rank === 0
                  const maxed = rank >= talent.maxRank
                  return (
                    <button
                      key={talent.id}
                      type="button"
                      className={`talent ${rank > 0 ? 'learned' : ''} ${maxed ? 'maxed' : ''} ${locked || prereqLocked ? 'locked' : ''}`}
                      title={`${talent.name} (${rank}/${talent.maxRank})\nLeft click to learn, right click to unlearn`}
                      disabled={(locked || prereqLocked) && rank === 0}
                      onClick={() => addPoint(talent)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        removePoint(talent)
                      }}
                    >
                      <img src={iconUrl(talent.icon)} alt="" draggable={false} />
                      <span className="talent-rank">
                        {rank}/{talent.maxRank}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
