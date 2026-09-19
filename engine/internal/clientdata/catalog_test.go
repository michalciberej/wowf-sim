package clientdata

import "testing"

func TestCatalogHasNineClasses(t *testing.T) {
	classes := map[int32]int{}
	for _, talent := range Get().Talents {
		classes[talent.Class]++
	}
	if len(classes) != 9 {
		t.Fatalf("expected 9 classes, got %d", len(classes))
	}
	if _, ok := TalentByName("Mortal Strike"); !ok {
		t.Fatal("missing Mortal Strike")
	}
	if _, ok := TalentByName("Divine Strength"); !ok {
		t.Fatal("missing Divine Strength")
	}
}

func TestRaidBuffCatalog(t *testing.T) {
	if len(RaidBuffs()) < 10 {
		t.Fatalf("expected raid buffs, got %d", len(RaidBuffs()))
	}
	if _, ok := RaidBuffByID("blessing-of-kings"); !ok {
		t.Fatal("missing Blessing of Kings")
	}
	if _, ok := RaidBuffByID("windfury-totem"); !ok {
		t.Fatal("missing Windfury Totem")
	}
}

func TestEveryClassHasADpsKit(t *testing.T) {
	want := map[int32][]string{
		1: {"Execute", "Whirlwind", "Slam"},
		2: {"Judgement", "Hammer of Wrath", "Consecration"},
		3: {"Multi-Shot", "Serpent Sting", "Rapid Fire"},
		4: {"Slice and Dice", "Eviscerate", "Ambush"},
		5: {"Shadow Word: Pain", "Mind Blast", "Smite"},
		6: {"Lightning Bolt", "Flame Shock", "Chain Lightning"},
		7: {"Fireball", "Frostbolt", "Fire Blast"},
		8: {"Shadow Bolt", "Corruption", "Curse of Agony"},
		9: {"Starfire", "Moonfire", "Wrath"},
	}
	for class, names := range want {
		list := AbilitiesFor(class, 1, map[int32]bool{})
		have := map[string]bool{}
		for _, ab := range list {
			have[ab.Name] = true
		}
		for _, name := range names {
			if !have[name] {
				t.Fatalf("class %d missing %s", class, name)
			}
		}
	}
}

func TestItemSetsParseGenericStatBonuses(t *testing.T) {
	set, ok := SetByID("field-marshals-battlegear")
	if !ok {
		t.Fatal("missing Field Marshal's Battlegear")
	}
	if len(set.Pieces) < 6 {
		t.Fatalf("expected 6 pieces, got %d", len(set.Pieces))
	}
	six := ActiveSetBonuses(set.Pieces)
	var ap int32
	for _, bonus := range six {
		ap += bonus.AttackPower
	}
	if ap != 40 {
		t.Fatalf("6pc AP=%d want 40", ap)
	}
	five := ActiveSetBonuses(set.Pieces[:5])
	for _, bonus := range five {
		if bonus.AttackPower != 0 {
			t.Fatalf("5pc should not grant +40 AP, got %+v", bonus)
		}
	}
}

func TestImperialPlateGenericHitAndStrength(t *testing.T) {
	set, ok := SetByID("imperial-plate")
	if !ok {
		t.Fatal("missing Imperial Plate")
	}
	if len(set.Pieces) < 6 {
		t.Fatalf("expected at least 6 imperial plate pieces, got %d", len(set.Pieces))
	}
	bonuses := ActiveSetBonuses(set.Pieces[:6])
	var str int32
	var hit, crit float64
	for _, bonus := range bonuses {
		str += bonus.Strength
		hit += bonus.HitChance
		crit += bonus.CritChance
	}
	if str != 20 || hit != 0.01 || crit != 0.01 {
		t.Fatalf("6pc imperial plate str=%d hit=%v crit=%v", str, hit, crit)
	}
}

func TestSetBonusesMatchByRequestNameWithoutCatalog(t *testing.T) {
	set, ok := SetByID("imperial-plate")
	if !ok || len(set.Pieces) < 6 || len(set.PieceNames) < 6 {
		t.Fatal("need imperial plate pieces and names")
	}
	ids := []int32{900001, 900002, 900003, 900004, 900005, 900006}
	names := map[int32]string{}
	for i := 0; i < 6; i++ {
		names[ids[i]] = set.PieceNames[i]
	}
	bonuses := ActiveSetBonusesFor(ids, names)
	var str int32
	var hit, crit float64
	for _, bonus := range bonuses {
		str += bonus.Strength
		hit += bonus.HitChance
		crit += bonus.CritChance
	}
	if str != 20 || hit != 0.01 || crit != 0.01 {
		t.Fatalf("named 6pc imperial plate str=%d hit=%v crit=%v", str, hit, crit)
	}
}

func TestForeverRacialsCatalog(t *testing.T) {
	if len(Racials()) < 20 {
		t.Fatalf("expected Forever racial traits, got %d", len(Racials()))
	}
	var fury, axe, wind bool
	for _, racial := range Racials() {
		if racial.Name == "Blood Fury" && racial.BuffAPMul >= 0.09 {
			fury = true
		}
		if racial.Name == "Axe Specialization" && racial.CritWhile >= 0.009 {
			axe = true
		}
		if racial.Name == "Wind Blessed" && racial.Haste >= 0.009 {
			wind = true
		}
	}
	if !fury || !axe || !wind {
		t.Fatalf("missing parsed combat racials fury=%v axe=%v wind=%v", fury, axe, wind)
	}
}

func TestWarriorAbilitiesIncludeChargeAndWhirlwind(t *testing.T) {
	talents := map[int32]bool{}
	if t, ok := TalentByName("Death Wish"); ok {
		talents[t.ID] = true
	}
	if t, ok := TalentByName("Bloodthirst"); ok {
		talents[t.ID] = true
	}
	list := AbilitiesFor(1, 2, talents)
	names := map[string]bool{}
	for _, ab := range list {
		names[ab.Name] = true
	}
	for _, want := range []string{
		"Charge", "Whirlwind", "Bloodthirst", "Death Wish", "Blood Fury",
		"Heroic Strike", "Bloodrage", "Execute", "Slam", "Battle Shout",
		"Overpower", "Recklessness",
	} {
		if !names[want] {
			t.Fatalf("missing ability %s", want)
		}
	}
	night := AbilitiesFor(1, 4, talents)
	var elune bool
	for _, ab := range night {
		if ab.Name == "Elune's Light" && ab.BuffCrit >= 0.09 {
			elune = true
		}
	}
	if !elune {
		t.Fatal("night elf warrior should have Elune's Light")
	}
}
