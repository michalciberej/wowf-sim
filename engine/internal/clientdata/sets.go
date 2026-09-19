package clientdata

import (
	_ "embed"
	"encoding/json"
	"strings"
	"sync"
)

//go:embed sets.json
var setsJSON []byte

type SetBonus struct {
	Count             int32   `json:"count"`
	Text              string  `json:"text"`
	Strength          int32   `json:"strength"`
	Agility           int32   `json:"agility"`
	Stamina           int32   `json:"stamina"`
	Intellect         int32   `json:"intellect"`
	Spirit            int32   `json:"spirit"`
	AttackPower       int32   `json:"attackPower"`
	RangedAttackPower int32   `json:"rangedAttackPower"`
	SpellPower        int32   `json:"spellPower"`
	HitChance         float64 `json:"hitChance"`
	SpellHitChance    float64 `json:"spellHitChance"`
	CritChance        float64 `json:"critChance"`
	SpellCritChance   float64 `json:"spellCritChance"`
	Haste             float64 `json:"haste"`
	Armor             int32   `json:"armor"`
	Defense           int32   `json:"defense"`
	DodgeChance       float64 `json:"dodgeChance"`
	ParryChance       float64 `json:"parryChance"`
	Mp5               int32   `json:"mp5"`
}

type ItemSet struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Total      int32      `json:"total"`
	Pieces     []int32    `json:"pieces"`
	Aliases    []int32    `json:"aliases"`
	PieceNames []string   `json:"pieceNames"`
	Bonuses    []SetBonus `json:"bonuses"`
}

var (
	setsOnce sync.Once
	itemSets []ItemSet
)

func loadSets() {
	setsOnce.Do(func() {
		if err := json.Unmarshal(setsJSON, &itemSets); err != nil {
			panic(err)
		}
	})
}

func ItemSets() []ItemSet {
	loadSets()
	return itemSets
}

func SetByID(id string) (ItemSet, bool) {
	loadSets()
	for _, set := range itemSets {
		if set.ID == id {
			return set, true
		}
	}
	return ItemSet{}, false
}

func itemNameKey(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, "’", "'")
	s = strings.ReplaceAll(s, "'", "")
	return strings.Join(strings.Fields(s), " ")
}

func equippedCount(set ItemSet, equipped []int32, namesByID map[int32]string) int32 {
	inSet := make(map[int32]bool, len(set.Pieces)+len(set.Aliases))
	for _, id := range set.Pieces {
		inSet[id] = true
	}
	for _, id := range set.Aliases {
		inSet[id] = true
	}
	names := make(map[string]bool, len(set.PieceNames)+len(set.Pieces))
	for _, name := range set.PieceNames {
		if key := itemNameKey(name); key != "" {
			names[key] = true
		}
	}
	for _, id := range set.Pieces {
		if item, ok := ItemByID(id); ok {
			names[itemNameKey(item.Name)] = true
		}
	}
	seenName := make(map[string]bool)
	seenID := make(map[int32]bool)
	var n int32
	for _, id := range equipped {
		if id == 0 || seenID[id] {
			continue
		}
		seenID[id] = true
		name := ""
		if namesByID != nil {
			name = namesByID[id]
		}
		if name == "" {
			if item, ok := ItemByID(id); ok {
				name = item.Name
			}
		}
		if name != "" {
			key := itemNameKey(name)
			if names[key] && !seenName[key] {
				seenName[key] = true
				n++
				continue
			}
		}
		if inSet[id] {
			n++
		}
	}
	return n
}

func ActiveSetBonuses(equipped []int32) []SetBonus {
	return ActiveSetBonusesFor(equipped, nil)
}

func ActiveSetBonusesFor(equipped []int32, namesByID map[int32]string) []SetBonus {
	loadSets()
	var out []SetBonus
	for _, set := range itemSets {
		worn := equippedCount(set, equipped, namesByID)
		if worn == 0 {
			continue
		}
		for _, bonus := range set.Bonuses {
			if worn >= bonus.Count {
				out = append(out, bonus)
			}
		}
	}
	return out
}
