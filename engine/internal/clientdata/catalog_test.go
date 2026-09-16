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
}
