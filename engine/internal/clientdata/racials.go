package clientdata

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed racials.json
var racialsJSON []byte

type Racial struct {
	ID              int32   `json:"id"`
	Name            string  `json:"name"`
	Icon            string  `json:"icon"`
	Race            int32   `json:"race"`
	Rank            string  `json:"rank"`
	Passive         bool    `json:"passive"`
	Cooldown        float64 `json:"cooldown"`
	Duration        float64 `json:"duration"`
	BuffDamage      float64 `json:"buffDamage"`
	BuffHaste       float64 `json:"buffHaste"`
	BuffAP          float64 `json:"buffAP"`
	BuffAPMul       float64 `json:"buffAPMul"`
	BuffSPMul       float64 `json:"buffSPMul"`
	BuffCrit        float64 `json:"buffCrit"`
	HealthMul       float64 `json:"healthMul"`
	HitChance       float64 `json:"hitChance"`
	DodgeChance     float64 `json:"dodgeChance"`
	Haste           float64 `json:"haste"`
	StunReduce      float64 `json:"stunReduce"`
	ManaMul         float64 `json:"manaMul"`
	DamageVs        string  `json:"damageVs"`
	DamageVsMul     float64 `json:"damageVsMul"`
	CritWhileWeapon string  `json:"critWhileWeapon"`
	CritWhile       float64 `json:"critWhile"`
	Tooltip         string  `json:"tooltip"`
}

var (
	racialsOnce sync.Once
	racials     []Racial
)

func Racials() []Racial {
	racialsOnce.Do(func() {
		if err := json.Unmarshal(racialsJSON, &racials); err != nil {
			racials = nil
		}
	})
	return racials
}

func RacialsFor(race int32) []Racial {
	out := make([]Racial, 0, 8)
	for _, racial := range Racials() {
		if racial.Race == 0 || racial.Race == race {
			out = append(out, racial)
		}
	}
	return out
}
