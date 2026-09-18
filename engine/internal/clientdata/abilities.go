package clientdata

import (
	_ "embed"
	"encoding/json"
	"sort"
	"sync"
)

//go:embed abilities.json
var abilitiesJSON []byte

type Ability struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Icon              string  `json:"icon"`
	Class             int32   `json:"class"`
	Race              int32   `json:"race"`
	RequiresTalent    int32   `json:"requiresTalent"`
	SpellID           int32   `json:"spellId"`
	Kind              string  `json:"kind"`
	SkipRotation      bool    `json:"skipRotation"`
	GCD               bool    `json:"gcd"`
	Cooldown          float64 `json:"cooldown"`
	Duration          float64 `json:"duration"`
	Rank              int     `json:"rank"`
	Damage            float64 `json:"damage"`
	DamageFlat        float64 `json:"damageFlat"`
	DamageWeapon      float64 `json:"damageWeapon"`
	DamageAP          float64 `json:"damageAP"`
	DamageSP          float64 `json:"damageSP"`
	CastTime          float64 `json:"castTime"`
	DumpRagePer       float64 `json:"dumpRagePer"`
	ComboDurationBase float64 `json:"comboDurationBase"`
	ComboDurationPer  float64 `json:"comboDurationPer"`
	BuffDamage        float64 `json:"buffDamage"`
	BuffHaste         float64 `json:"buffHaste"`
	BuffAP            float64 `json:"buffAP"`
	BuffCrit          float64 `json:"buffCrit"`
	BuffStr           float64 `json:"buffStr"`
	BuffAgi           float64 `json:"buffAgi"`
	Priority          int     `json:"priority"`
	Resource          string  `json:"resource"`
	Cost              float64 `json:"cost"`
	Gain              float64 `json:"gain"`
	DumpAbove         float64 `json:"dumpAbove"`
	HealthBelow       float64 `json:"healthBelow"`
	HealthAbove       float64 `json:"healthAbove"`
	ComboMin          int     `json:"comboMin"`
	ComboGen          int     `json:"comboGen"`
	ConsumeCombo      bool    `json:"consumeCombo"`
	DumpRage          bool    `json:"dumpRage"`
	RequiresProc      string  `json:"requiresProc"`
	RequiresStance    string  `json:"requiresStance"`
	RequiresStealth   bool    `json:"requiresStealth"`
}

var (
	abilitiesOnce sync.Once
	abilities     []Ability
)

func Abilities() []Ability {
	loadAbilities()
	return abilities
}

func AbilitiesFor(class, race int32, talents map[int32]bool) []Ability {
	loadAbilities()
	out := make([]Ability, 0, 24)
	for _, ab := range abilities {
		if ab.Class != 0 && ab.Class != class {
			continue
		}
		if ab.Race != 0 && ab.Race != race {
			continue
		}
		if ab.RequiresTalent != 0 && !TalentUnlocked(ab, talents) {
			continue
		}
		out = append(out, ab)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].Priority > out[j].Priority
	})
	return out
}

func loadAbilities() {
	abilitiesOnce.Do(func() {
		if err := json.Unmarshal(abilitiesJSON, &abilities); err != nil {
			panic(err)
		}
	})
}
