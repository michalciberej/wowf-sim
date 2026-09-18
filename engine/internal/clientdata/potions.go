package clientdata

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed potions.json
var potionsJSON []byte

var (
	potionsOnce sync.Once
	potions     []Item
	potionsByID map[int32]Item
)

func loadPotions() {
	potionsOnce.Do(func() {
		if err := json.Unmarshal(potionsJSON, &potions); err != nil {
			panic(err)
		}
		potionsByID = make(map[int32]Item, len(potions))
		for _, item := range potions {
			potionsByID[item.ID] = item
		}
	})
}

func PotionByID(id int32) (Item, bool) {
	loadPotions()
	item, ok := potionsByID[id]
	return item, ok
}

func CombatPotionEffect(id int32) (Item, ItemEffect, bool) {
	item, ok := PotionByID(id)
	if !ok {
		return Item{}, ItemEffect{}, false
	}
	for _, effect := range item.Effects {
		if effect.Kind == "use" && combatPotionEffect(effect) {
			if effect.Name == "" {
				effect.Name = item.Name
			}
			if effect.Icon == "" {
				effect.Icon = item.Icon
			}
			if effect.Cooldown <= 0 {
				effect.Cooldown = 120
			}
			return item, effect, true
		}
	}
	return Item{}, ItemEffect{}, false
}

func combatPotionEffect(effect ItemEffect) bool {
	return effect.AttackPower > 0 ||
		effect.SpellPower > 0 ||
		effect.Haste > 0 ||
		effect.Crit > 0 ||
		effect.Strength > 0 ||
		effect.Agility > 0 ||
		effect.Rage > 0
}
