package clientdata

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed enchants.json
var enchantsJSON []byte

type Enchant struct {
	ID               int32   `json:"id"`
	Name             string  `json:"name"`
	Icon             string  `json:"icon"`
	Quality          int32   `json:"quality"`
	Kind             string  `json:"kind"`
	Slots            []int32 `json:"slots"`
	EffectName       string  `json:"effectName"`
	EffectLabel      string  `json:"effectLabel"`
	UseText          string  `json:"useText"`
	TwoHandOnly      bool    `json:"twoHandOnly"`
	ShieldOnly       bool    `json:"shieldOnly"`
	OffHandOnly      bool    `json:"offHandOnly"`
	Weapon           bool    `json:"weapon"`
	Ranged           bool    `json:"ranged"`
	Proc             bool    `json:"proc"`
	Strength         int32   `json:"strength"`
	Agility          int32   `json:"agility"`
	Stamina          int32   `json:"stamina"`
	Intellect        int32   `json:"intellect"`
	Spirit           int32   `json:"spirit"`
	AttackPower      int32   `json:"attackPower"`
	SpellPower       int32   `json:"spellPower"`
	HealingPower     int32   `json:"healingPower"`
	CritChance       float64 `json:"critChance"`
	HitChance        float64 `json:"hitChance"`
	SpellCritChance  float64 `json:"spellCritChance"`
	SpellHitChance   float64 `json:"spellHitChance"`
	Haste            float64 `json:"haste"`
	WeaponDamage     float64 `json:"weaponDamage"`
	Mp5              int32   `json:"mp5"`
}

var (
	enchantsOnce sync.Once
	enchants     []Enchant
	enchantByID  map[int32]Enchant
)

func loadEnchants() {
	enchantsOnce.Do(func() {
		if err := json.Unmarshal(enchantsJSON, &enchants); err != nil {
			panic(err)
		}
		enchantByID = make(map[int32]Enchant, len(enchants))
		for _, enc := range enchants {
			enchantByID[enc.ID] = enc
		}
	})
}

func EnchantByID(id int32) (Enchant, bool) {
	loadEnchants()
	enc, ok := enchantByID[id]
	return enc, ok
}
