package clientdata

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed item-effects.json
var itemEffectsJSON []byte

//go:embed extra-items.json
var extraItemsJSON []byte

type Catalog struct {
	Items   []Item   `json:"items"`
	Talents []Talent `json:"talents"`
}

type ItemEffect struct {
	Kind        string  `json:"kind"`
	Name        string  `json:"name"`
	Text        string  `json:"text"`
	AttackPower float64 `json:"attackPower"`
	SpellPower  float64 `json:"spellPower"`
	Haste       float64 `json:"haste"`
	Crit        float64 `json:"crit"`
	Strength    float64 `json:"strength"`
	Agility     float64 `json:"agility"`
	ArmorIgnore float64 `json:"armorIgnore"`
	Rage        float64 `json:"rage"`
	Duration    float64 `json:"duration"`
	Cooldown    float64 `json:"cooldown"`
	Chance      float64 `json:"chance"`
	ExtraAttack int32   `json:"extraAttack"`
	StackAP     float64 `json:"stackAP"`
	Interval    float64 `json:"interval"`
	Icon        string  `json:"icon"`
}

type Item struct {
	ID                int32        `json:"id"`
	Name              string       `json:"name"`
	Slot              int32        `json:"slot"`
	WeaponDps         float64      `json:"weaponDps"`
	AttackSpeedMs     int32        `json:"attackSpeedMs"`
	Strength          int32        `json:"strength"`
	Agility           int32        `json:"agility"`
	Stamina           int32        `json:"stamina"`
	Intellect         int32        `json:"intellect"`
	Spirit            int32        `json:"spirit"`
	AttackPower       int32        `json:"attackPower"`
	SpellPower        int32        `json:"spellPower"`
	CritChance        float64      `json:"critChance"`
	HitChance         float64      `json:"hitChance"`
	SpellCritChance   float64      `json:"spellCritChance"`
	SpellHitChance    float64      `json:"spellHitChance"`
	ItemLevel         int32        `json:"itemLevel"`
	ItemSubclass      string       `json:"itemSubclass"`
	ArmorType         string       `json:"armorType"`
	Hand              string       `json:"hand"`
	ClassMask         int32        `json:"classMask"`
	Icon              string       `json:"icon"`
	Quality           int32        `json:"quality"`
	Armor             int32        `json:"armor"`
	Defense           int32        `json:"defense"`
	DodgeChance       float64      `json:"dodgeChance"`
	ParryChance       float64      `json:"parryChance"`
	RangedAttackPower int32        `json:"rangedAttackPower"`
	Mp5               int32        `json:"mp5"`
	MinDamage         int32        `json:"minDamage"`
	MaxDamage         int32        `json:"maxDamage"`
	Unique            bool         `json:"unique"`
	Binds             string       `json:"binds"`
	RequiredLevel     int32        `json:"requiredLevel"`
	Tooltip           string       `json:"tooltip"`
	Effects           []ItemEffect `json:"effects"`
}

type TalentEffect struct {
	Damage          float64 `json:"damage"`
	Crit            float64 `json:"crit"`
	Haste           float64 `json:"haste"`
	Heroic          float64 `json:"heroic"`
	ExtraAction     float64 `json:"extraAction"`
	ExtraActionName string  `json:"extraActionName"`
	Utility         bool    `json:"utility"`
}

type Talent struct {
	ID            int32        `json:"id"`
	Class         int32        `json:"class"`
	Tree          string       `json:"tree"`
	Name          string       `json:"name"`
	Icon          string       `json:"icon"`
	MaxRank       int32        `json:"maxRank"`
	Row           int32        `json:"row"`
	Col           int32        `json:"col"`
	PrereqRow     int32        `json:"prereqRow"`
	PrereqCol     int32        `json:"prereqCol"`
	BackgroundURL string       `json:"backgroundUrl"`
	Ranks         []string     `json:"ranks"`
	Effect        TalentEffect `json:"effect"`
}

var (
	once           sync.Once
	catalog        Catalog
	talentsByID    map[int32]Talent
	itemsByID      map[int32]Item
	overlayEffects map[string][]ItemEffect
)

func Get() Catalog {
	load()
	return catalog
}

func ItemByID(id int32) (Item, bool) {
	load()
	item, ok := itemsByID[id]
	return item, ok
}

func ItemEffectsFor(name string, existing []ItemEffect) []ItemEffect {
	load()
	if len(existing) > 0 {
		return existing
	}
	return overlayEffects[name]
}

func TalentByID(id int32) (Talent, bool) {
	load()
	talent, ok := talentsByID[id]
	return talent, ok
}

func TalentNameKey(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r >= 'A' && r <= 'Z' {
			out = append(out, r-'A'+'a')
			continue
		}
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			out = append(out, r)
		}
	}
	return string(out)
}

func TalentByName(name string) (Talent, bool) {
	return TalentByNameClass(name, 0)
}

func TalentByNameClass(name string, class int32) (Talent, bool) {
	load()
	key := TalentNameKey(name)
	for _, talent := range catalog.Talents {
		if TalentNameKey(talent.Name) != key {
			continue
		}
		if class == 0 || talent.Class == class {
			return talent, true
		}
	}
	return Talent{}, false
}

func TalentUnlocked(ab Ability, talents map[int32]bool) bool {
	if ab.RequiresTalent == 0 {
		return true
	}
	if talents[ab.RequiresTalent] {
		return true
	}
	want := TalentNameKey(ab.Name)
	if req, ok := TalentByID(ab.RequiresTalent); ok {
		want = TalentNameKey(req.Name)
	}
	for id, on := range talents {
		if !on {
			continue
		}
		t, ok := TalentByID(id)
		if !ok {
			continue
		}
		if TalentNameKey(t.Name) == want {
			return true
		}
		if TalentNameKey(t.Effect.ExtraActionName) == TalentNameKey(ab.Name) {
			return true
		}
	}
	return false
}

func load() {
	once.Do(func() {
		if err := json.Unmarshal(catalogJSON, &catalog); err != nil {
			panic(err)
		}
		if err := json.Unmarshal(itemEffectsJSON, &overlayEffects); err != nil {
			panic(err)
		}
		var extra []Item
		if err := json.Unmarshal(extraItemsJSON, &extra); err != nil {
			panic(err)
		}
		talentsByID = make(map[int32]Talent, len(catalog.Talents))
		for _, talent := range catalog.Talents {
			talentsByID[talent.ID] = talent
		}
		itemsByID = make(map[int32]Item, len(catalog.Items)+len(extra))
		for i, item := range catalog.Items {
			if len(item.Effects) == 0 {
				if extraFx, ok := overlayEffects[item.Name]; ok {
					catalog.Items[i].Effects = extraFx
					item = catalog.Items[i]
				}
			}
			itemsByID[item.ID] = item
		}
		for _, item := range extra {
			if _, ok := itemsByID[item.ID]; ok {
				continue
			}
			if len(item.Effects) == 0 {
				if extraFx, ok := overlayEffects[item.Name]; ok {
					item.Effects = extraFx
				}
			}
			catalog.Items = append(catalog.Items, item)
			itemsByID[item.ID] = item
		}
	})
}
