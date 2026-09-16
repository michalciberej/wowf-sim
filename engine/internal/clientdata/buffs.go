package clientdata

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed buffs.json
var buffsJSON []byte

type RaidBuff struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Icon        string  `json:"icon"`
	Category    string  `json:"category"`
	Default     bool    `json:"default"`
	SkipClass   []int32 `json:"skipClass"`
	OnlyClass   []int32 `json:"onlyClass"`
	Strength    float64 `json:"strength"`
	Agility     float64 `json:"agility"`
	Intellect   float64 `json:"intellect"`
	AttackPower float64 `json:"attackPower"`
	SpellPower  float64 `json:"spellPower"`
	MeleeCrit   float64 `json:"meleeCrit"`
	SpellCrit   float64 `json:"spellCrit"`
	HitChance   float64 `json:"hitChance"`
	SpellHit    float64 `json:"spellHit"`
	StatMul     float64 `json:"statMul"`
	APMul       float64 `json:"apMul"`
	DamageMul   float64 `json:"damageMul"`
	Armor       float64 `json:"armor"`
	Windfury    bool    `json:"windfury"`
	WindfuryAP  float64 `json:"windfuryAp"`
	FireMul     float64 `json:"fireMul"`
	FrostMul    float64 `json:"frostMul"`
	ShadowMul   float64 `json:"shadowMul"`
	NatureMul   float64 `json:"natureMul"`
	HolyMul     float64 `json:"holyMul"`
}

var (
	buffsOnce sync.Once
	raidBuffs []RaidBuff
	buffByID  map[string]RaidBuff
)

func RaidBuffs() []RaidBuff {
	loadBuffs()
	return raidBuffs
}

func RaidBuffByID(id string) (RaidBuff, bool) {
	loadBuffs()
	b, ok := buffByID[id]
	return b, ok
}

func (b RaidBuff) AppliesTo(class int32) bool {
	for _, skip := range b.SkipClass {
		if skip == class {
			return false
		}
	}
	if len(b.OnlyClass) == 0 {
		return true
	}
	for _, only := range b.OnlyClass {
		if only == class {
			return true
		}
	}
	return false
}

func loadBuffs() {
	buffsOnce.Do(func() {
		if err := json.Unmarshal(buffsJSON, &raidBuffs); err != nil {
			panic(err)
		}
		buffByID = make(map[string]RaidBuff, len(raidBuffs))
		for _, b := range raidBuffs {
			buffByID[b.ID] = b
		}
	})
}
