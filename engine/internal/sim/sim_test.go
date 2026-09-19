package sim

import (
	"math"
	"math/rand"
	"testing"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

func talentID(t *testing.T, name string) int32 {
	return talentIDClass(t, 0, name)
}

func talentIDClass(t *testing.T, class pb.Class, name string) int32 {
	t.Helper()
	talent, ok := clientdata.TalentByNameClass(name, int32(class))
	if !ok {
		t.Fatalf("missing talent %s class %v", name, class)
	}
	return talent.ID
}

func TestMaxRankSpellValues(t *testing.T) {
	byID := map[string]clientdata.Ability{}
	for _, ab := range clientdata.Abilities() {
		byID[ab.ID] = ab
	}
	checks := []struct {
		id     string
		rank   int
		cost   float64
		cd     float64
		dur    float64
		flat   float64
		weapon float64
		ap     float64
	}{
		{id: "heroic-strike", rank: 9, cost: 15, flat: 157},
		{id: "execute", rank: 5, cost: 15, flat: 600},
		{id: "bloodthirst", rank: 4, cost: 30, cd: 6, ap: 0.35, flat: 30},
		{id: "mortal-strike", rank: 4, cost: 30, cd: 6, flat: 85, weapon: 1},
		{id: "slam", rank: 4, cost: 15, flat: 87, weapon: 1},
		{id: "shield-slam", rank: 4, cost: 20, cd: 6, flat: 350},
		{id: "battle-shout", rank: 7, cost: 10, dur: 120},
		{id: "shadow-bolt", rank: 10, flat: 510},
		{id: "fireball", rank: 12, flat: 754},
		{id: "sinister-strike", rank: 8, cost: 45, flat: 68, weapon: 1},
		{id: "mutilate", rank: 1, cost: 60, flat: 13, weapon: 0.75},
		{id: "slice-and-dice", rank: 2, cost: 25, dur: 21},
		{id: "shred", rank: 5, cost: 60, flat: 180, weapon: 2.25},
		{id: "tigers-fury", rank: 4, cost: 30, cd: 1, dur: 6},
		{id: "rend", rank: 7, cost: 10, dur: 21, flat: 147},
		{id: "garrote", rank: 6, cost: 50, dur: 18, flat: 552},
	}
	for _, c := range checks {
		ab, ok := byID[c.id]
		if !ok {
			t.Fatalf("missing ability %s", c.id)
		}
		if ab.Rank != c.rank {
			t.Errorf("%s rank=%d want %d", c.id, ab.Rank, c.rank)
		}
		if c.cost != 0 && ab.Cost != c.cost {
			t.Errorf("%s cost=%v want %v", c.id, ab.Cost, c.cost)
		}
		if c.cd != 0 && ab.Cooldown != c.cd {
			t.Errorf("%s cooldown=%v want %v", c.id, ab.Cooldown, c.cd)
		}
		if c.dur != 0 && ab.Duration != c.dur {
			t.Errorf("%s duration=%v want %v", c.id, ab.Duration, c.dur)
		}
		if c.flat != 0 && ab.DamageFlat != c.flat {
			t.Errorf("%s damageFlat=%v want %v", c.id, ab.DamageFlat, c.flat)
		}
		if c.weapon != 0 && ab.DamageWeapon != c.weapon {
			t.Errorf("%s damageWeapon=%v want %v", c.id, ab.DamageWeapon, c.weapon)
		}
		if c.ap != 0 && ab.DamageAP != c.ap {
			t.Errorf("%s damageAP=%v want %v", c.id, ab.DamageAP, c.ap)
		}
	}
	if byID["execute"].DumpRagePer != 15 {
		t.Errorf("execute dumpRagePer=%v want 15", byID["execute"].DumpRagePer)
	}
	if byID["battle-shout"].BuffAP != 232 {
		t.Errorf("battle shout buffAP=%v want 232", byID["battle-shout"].BuffAP)
	}
}

func TestRunProducesDps(t *testing.T) {
	res := Run(nil)
	if res.Iterations != 1000 {
		t.Fatalf("iterations = %d", res.Iterations)
	}
	if res.DpsMean <= 0 {
		t.Fatalf("expected positive dps, got %f", res.DpsMean)
	}
}

func TestHitAndCritDpsAndSamples(t *testing.T) {
	res := Run(baseReq())
	if len(res.IterationDps) != int(res.Iterations) {
		t.Fatalf("iteration samples=%d want %d", len(res.IterationDps), res.Iterations)
	}
	auto := actionByName(res, "Auto Attack")
	if auto.HitDps+auto.CritDps <= 0 {
		t.Fatal("expected hit/crit dps on auto attacks")
	}
	if math.Abs(auto.HitDps+auto.CritDps-auto.Dps) > 0.05 {
		t.Fatalf("hit+crit=%f dps=%f", auto.HitDps+auto.CritDps, auto.Dps)
	}
	if auto.AvgCast <= 0 {
		t.Fatal("expected average auto-attack damage")
	}
	for i := 1; i < len(res.Actions); i++ {
		if res.Actions[i-1].Dps < res.Actions[i].Dps {
			t.Fatalf("actions not sorted by dps: %s %.1f then %s %.1f",
				res.Actions[i-1].Name, res.Actions[i-1].Dps, res.Actions[i].Name, res.Actions[i].Dps)
		}
	}
}

func baseReq() *pb.SimRequest {
	return &pb.SimRequest{
		Player: &pb.Player{
			Class: pb.Class_CLASS_WARRIOR,
			Race:  pb.Race_RACE_HUMAN,
			Level: 60,
		},
		Encounter: &pb.Encounter{DurationSeconds: 60},
		Options:   &pb.SimOptions{Iterations: 400, RngSeed: 1},
	}
}

func TestNakedOrcWarriorMatchesWowSims(t *testing.T) {
	str, agi, intel, sta, spi, classAP := playerBaseStats(pb.Class_CLASS_WARRIOR, pb.Race_RACE_ORC)
	if str != 123 || agi != 77 || intel != 27 || sta != 112 || spi != 48 || classAP != 160 {
		t.Fatalf("orc warrior base str=%v agi=%v int=%v sta=%v spi=%v ap=%v", str, agi, intel, sta, spi, classAP)
	}
	crit := meleeCritChance(pb.Class_CLASS_WARRIOR, agi, 0)
	if math.Abs(crit-0.0385) > 1e-9 {
		t.Fatalf("orc warrior melee crit=%v want 0.0385", crit)
	}
	ap := classAP + attackPowerFromStats(pb.Class_CLASS_WARRIOR, str, agi) + selfClassAP(pb.Class_CLASS_WARRIOR, nil, nil)
	if ap != 638 {
		t.Fatalf("orc warrior AP=%v want 638 (160 + 2*123 + Battle Shout 232)", ap)
	}
}

func TestWowSimsClassAndRaceBases(t *testing.T) {
	type row struct {
		class                         pb.Class
		str, agi, intel, sta, spi, ap float64
	}
	human := []row{
		{pb.Class_CLASS_WARRIOR, 120, 80, 30, 110, 45, 160},
		{pb.Class_CLASS_PALADIN, 105, 65, 70, 100, 75, 160},
		{pb.Class_CLASS_HUNTER, 55, 125, 65, 90, 70, 100},
		{pb.Class_CLASS_ROGUE, 80, 130, 35, 75, 50, 100},
		{pb.Class_CLASS_PRIEST, 35, 40, 120, 50, 125, -10},
		{pb.Class_CLASS_SHAMAN, 85, 55, 90, 95, 100, 100},
		{pb.Class_CLASS_MAGE, 30, 35, 125, 45, 120, -10},
		{pb.Class_CLASS_WARLOCK, 45, 50, 110, 65, 115, -10},
		{pb.Class_CLASS_DRUID, 65, 60, 100, 70, 110, -20},
	}
	for _, want := range human {
		str, agi, intel, sta, spi, ap := playerBaseStats(want.class, pb.Race_RACE_HUMAN)
		if str != want.str || agi != want.agi || intel != want.intel || sta != want.sta || spi != want.spi || ap != want.ap {
			t.Fatalf("human class %v got str=%v agi=%v int=%v sta=%v spi=%v ap=%v", want.class, str, agi, intel, sta, spi, ap)
		}
	}

	str, agi, intel, sta, spi, _ := playerBaseStats(pb.Class_CLASS_MAGE, pb.Race_RACE_ORC)
	if str != 33 || agi != 32 || intel != 122 || sta != 47 || spi != 123 {
		t.Fatalf("orc mage got str=%v agi=%v int=%v sta=%v spi=%v", str, agi, intel, sta, spi)
	}

	_, agi, _, _, _, classAP := playerBaseStats(pb.Class_CLASS_HUNTER, pb.Race_RACE_ORC)
	rap := classAP + attackPowerFromStats(pb.Class_CLASS_HUNTER, 0, agi)
	if rap != 344 {
		t.Fatalf("orc hunter RAP=%v want 344 (100 + 2*122)", rap)
	}
}

func TestEarthstrikeOnUseIncreasesDps(t *testing.T) {
	base := baseReq()
	base.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     41.8,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
		Hand:          "1h",
	}}}
	plain := Run(base)
	with := baseReq()
	with.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		base.Player.Gear.Items[0],
		{Id: 21180, Name: "Earthstrike", Slot: pb.ItemSlot_ITEM_SLOT_TRINKET_1},
	}}
	buffed := Run(with)
	if buffed.DpsMean <= plain.DpsMean {
		t.Fatalf("earthstrike should increase dps: plain=%f with=%f", plain.DpsMean, buffed.DpsMean)
	}
}

func TestOnUseTrinketPriorityZeroDoesNotUse(t *testing.T) {
	on := baseReq()
	on.Options.Iterations = 1
	on.Encounter.DurationSeconds = 20
	on.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		{
			Id:            19019,
			Name:          "Thunderfury",
			Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
			WeaponDps:     41.8,
			AttackSpeedMs: 1900,
			ItemSubclass:  "Sword",
			Hand:          "1h",
		},
		{Id: 21180, Name: "Earthstrike", Slot: pb.ItemSlot_ITEM_SLOT_TRINKET_1},
	}}
	off := baseReq()
	off.Options.Iterations = 1
	off.Encounter.DurationSeconds = 20
	off.Player.Gear = on.Player.Gear
	off.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "use:earthstrike", Priority: 0}}
	used := Run(on)
	skipped := Run(off)
	if used.DpsMean <= skipped.DpsMean {
		t.Fatalf("disabled earthstrike should lower dps: used=%f skipped=%f", used.DpsMean, skipped.DpsMean)
	}
}

func TestDiamondFlaskOnUseIncreasesDps(t *testing.T) {
	base := baseReq()
	base.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     41.8,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
		Hand:          "1h",
	}}}
	plain := Run(base)
	with := baseReq()
	with.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		base.Player.Gear.Items[0],
		{Id: 20130, Name: "Diamond Flask", Slot: pb.ItemSlot_ITEM_SLOT_TRINKET_1},
	}}
	buffed := Run(with)
	if buffed.DpsMean <= plain.DpsMean {
		t.Fatalf("diamond flask should increase dps: plain=%f with=%f", plain.DpsMean, buffed.DpsMean)
	}
}

func TestHandOfJusticeProcs(t *testing.T) {
	req := baseReq()
	req.Options.Iterations = 200
	req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		{
			Id:            19019,
			Name:          "Thunderfury",
			Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
			WeaponDps:     41.8,
			AttackSpeedMs: 1900,
			Hand:          "1h",
		},
		{Id: 11815, Name: "Hand of Justice", Slot: pb.ItemSlot_ITEM_SLOT_TRINKET_1, AttackPower: 20},
	}}
	res := Run(req)
	if !hasAction(res, "Hand of Justice") {
		t.Fatal("expected Hand of Justice extra attacks")
	}
}

func TestRequestEffectsWorkWithoutCatalogItem(t *testing.T) {
	base := baseReq()
	base.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     41.8,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
		Hand:          "1h",
	}}}
	plain := Run(base)
	with := baseReq()
	with.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		base.Player.Gear.Items[0],
		{
			Id:   1999999,
			Name: "Synthetic Earthstrike",
			Slot: pb.ItemSlot_ITEM_SLOT_TRINKET_1,
			Effects: []*pb.ItemEffect{{
				Kind:        "use",
				Name:        "Synthetic Earthstrike",
				AttackPower: 280,
				Duration:    20,
				Cooldown:    120,
			}},
		},
	}}
	buffed := Run(with)
	if buffed.DpsMean <= plain.DpsMean {
		t.Fatalf("proto item effects should increase dps: plain=%f with=%f", plain.DpsMean, buffed.DpsMean)
	}
}

func TestWeaponChangesDps(t *testing.T) {
	plain := Run(baseReq())

	geared := baseReq()
	geared.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     33.2,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
	}}}
	withWeapon := Run(geared)
	if withWeapon.DpsMean <= plain.DpsMean {
		t.Fatalf("weapon should change baseline: plain=%f geared=%f", plain.DpsMean, withWeapon.DpsMean)
	}
}

func TestWeaponStrengthEnchantRaisesDps(t *testing.T) {
	base := baseReq()
	base.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     33.2,
		AttackSpeedMs: 1900,
		Hand:          "1h",
		ItemSubclass:  "Sword",
	}}}
	plain := Run(base)
	enchanted := baseReq()
	enchanted.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     33.2,
		AttackSpeedMs: 1900,
		Hand:          "1h",
		ItemSubclass:  "Sword",
		EnchantId:     273572,
	}}}
	with := Run(enchanted)
	if with.DpsMean <= plain.DpsMean {
		t.Fatalf("strength enchant should raise DPS: plain=%f enchanted=%f", plain.DpsMean, with.DpsMean)
	}
}

func TestOffHandAddsDamage(t *testing.T) {
	mh := baseReq()
	mh.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     33.2,
		AttackSpeedMs: 1900,
		Hand:          "1h",
		ItemSubclass:  "Sword",
	}}}
	dw := baseReq()
	dw.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		mh.Player.Gear.Items[0],
		{
			Id:            18805,
			Name:          "Core Hound Tooth",
			Slot:          pb.ItemSlot_ITEM_SLOT_OFF_HAND,
			WeaponDps:     31,
			AttackSpeedMs: 1600,
			Hand:          "1h",
			ItemSubclass:  "Dagger",
		},
	}}
	one := Run(mh)
	two := Run(dw)
	if two.DpsMean <= one.DpsMean {
		t.Fatalf("off-hand should add DPS: mh=%f dw=%f", one.DpsMean, two.DpsMean)
	}
	if !hasAction(two, "Off-Hand") {
		t.Fatal("expected Off-Hand swings")
	}
}

func TestOffHandSharpeningStoneRaisesDps(t *testing.T) {
	plain := baseReq()
	plain.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		{
			Id:            19019,
			Name:          "Thunderfury",
			Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
			WeaponDps:     33.2,
			AttackSpeedMs: 1900,
			Hand:          "1h",
			ItemSubclass:  "Sword",
		},
		{
			Id:            18805,
			Name:          "Core Hound Tooth",
			Slot:          pb.ItemSlot_ITEM_SLOT_OFF_HAND,
			WeaponDps:     31,
			AttackSpeedMs: 1600,
			Hand:          "1h",
			ItemSubclass:  "Dagger",
		},
	}}
	stoned := baseReq()
	stoned.Player.Gear = plain.Player.Gear
	stoned.Player.OhWeaponTemp = "dense-sharpening-stone"
	if Run(stoned).DpsMean <= Run(plain).DpsMean {
		t.Fatal("off-hand dense sharpening stone should raise DPS")
	}
}

func TestOffHandElementalSharpeningRaisesDps(t *testing.T) {
	plain := baseReq()
	plain.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		{
			Id:            19019,
			Name:          "Thunderfury",
			Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
			WeaponDps:     33.2,
			AttackSpeedMs: 1900,
			Hand:          "1h",
			ItemSubclass:  "Sword",
		},
		{
			Id:            18805,
			Name:          "Core Hound Tooth",
			Slot:          pb.ItemSlot_ITEM_SLOT_OFF_HAND,
			WeaponDps:     31,
			AttackSpeedMs: 1600,
			Hand:          "1h",
			ItemSubclass:  "Dagger",
		},
	}}
	stoned := baseReq()
	stoned.Player.Gear = plain.Player.Gear
	stoned.Player.OhWeaponTemp = "elemental-sharpening-stone"
	if Run(stoned).DpsMean <= Run(plain).DpsMean {
		t.Fatal("off-hand elemental sharpening stone should raise DPS")
	}
}

func TestMainHandDenseSharpeningStoneRaisesDps(t *testing.T) {
	plain := baseReq()
	plain.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     33.2,
		AttackSpeedMs: 1900,
		Hand:          "1h",
		ItemSubclass:  "Sword",
	}}}
	stoned := baseReq()
	stoned.Player.Gear = plain.Player.Gear
	stoned.Player.MhWeaponTemp = "dense-sharpening-stone"
	if Run(stoned).DpsMean <= Run(plain).DpsMean {
		t.Fatal("main-hand dense sharpening stone should raise DPS")
	}
}

func TestTalentsChangeDps(t *testing.T) {
	plain := Run(baseReq())
	talented := baseReq()
	talented.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Cruelty"), Rank: 5}}
	next := Run(talented)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("cruelty should increase dps: %f vs %f", next.DpsMean, plain.DpsMean)
	}
}

func TestRogueMaliceRaisesDps(t *testing.T) {
	plain := baseReq()
	plain.Player.Class = pb.Class_CLASS_ROGUE
	talented := baseReq()
	talented.Player.Class = pb.Class_CLASS_ROGUE
	talented.Player.Talents = []*pb.TalentPick{{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Malice"), Rank: 5}}
	g := collectGenericTalents(pb.Class_CLASS_ROGUE, talented.Player.Talents)
	if math.Abs(g.meleeCrit-0.05) > 1e-9 {
		t.Fatalf("malice 5 should be 5%% crit, got %v", g.meleeCrit)
	}
	if Run(talented).DpsMean <= Run(plain).DpsMean {
		t.Fatal("rogue malice should raise DPS")
	}
}

func TestPaladinDivineStrengthRaisesDps(t *testing.T) {
	plain := baseReq()
	plain.Player.Class = pb.Class_CLASS_PALADIN
	talented := baseReq()
	talented.Player.Class = pb.Class_CLASS_PALADIN
	talented.Player.Talents = []*pb.TalentPick{{Id: talentIDClass(t, pb.Class_CLASS_PALADIN, "Divine Strength"), Rank: 5}}
	g := collectGenericTalents(pb.Class_CLASS_PALADIN, talented.Player.Talents)
	if math.Abs(g.strMul-1.10) > 1e-9 {
		t.Fatalf("divine strength 5 should be 10%% str, got %v", g.strMul)
	}
	if Run(talented).DpsMean <= Run(plain).DpsMean {
		t.Fatal("paladin divine strength should raise DPS")
	}
}

func TestMageFirePowerRaisesDps(t *testing.T) {
	plain := baseReq()
	plain.Player.Class = pb.Class_CLASS_MAGE
	talented := baseReq()
	talented.Player.Class = pb.Class_CLASS_MAGE
	talented.Player.Talents = []*pb.TalentPick{{Id: talentIDClass(t, pb.Class_CLASS_MAGE, "Fire Power"), Rank: 5}}
	g := collectGenericTalents(pb.Class_CLASS_MAGE, talented.Player.Talents)
	if math.Abs(g.fireMul-1.10) > 1e-9 {
		t.Fatalf("fire power 5 should be 10%% fire damage, got %v", g.fireMul)
	}
	if Run(talented).DpsMean <= Run(plain).DpsMean {
		t.Fatal("mage fire power should raise DPS")
	}
}

func TestFlurryIncreasesDps(t *testing.T) {
	plain := Run(baseReq())
	req := baseReq()
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Flurry"), Rank: 5}}
	next := Run(req)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("flurry should increase dps: %f vs %f", next.DpsMean, plain.DpsMean)
	}
}

func TestBloodthirstIncreasesDps(t *testing.T) {
	plain := baseReq()
	plain.Player.AbilityPriorities = []*pb.AbilityPriority{
		{Id: "heroic-strike", Priority: 0},
		{Id: "slam", Priority: 0},
	}
	req := baseReq()
	req.Player.AbilityPriorities = plain.Player.AbilityPriorities
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Bloodthirst"), Rank: 1}}
	if Run(req).DpsMean <= Run(plain).DpsMean {
		t.Fatalf("bloodthirst should increase dps when heroic strike is off")
	}
}

func slamOnlyReq() *pb.SimRequest {
	req := baseReq()
	req.Options.Iterations = 1
	req.Options.RngSeed = 1
	req.Encounter.DurationSeconds = 20
	prios := make([]*pb.AbilityPriority, 0, 16)
	for _, ab := range clientdata.Abilities() {
		if ab.Class != 1 {
			continue
		}
		p := 0
		switch ab.ID {
		case "charge":
			p = 1000
		case "bloodrage":
			p = 900
		case "slam":
			p = 800
		}
		prios = append(prios, &pb.AbilityPriority{Id: ab.ID, Priority: int32(p)})
	}
	req.Player.AbilityPriorities = prios
	req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            1,
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     40,
		AttackSpeedMs: 800,
		Hand:          "1h",
		ItemSubclass:  "Sword",
	}}}
	return req
}

func TestSlamCastLocksMeleeAndShowsCastBar(t *testing.T) {
	res := Run(slamOnlyReq())
	var casts, hits []*pb.TimelineEvent
	for _, ev := range res.Timeline {
		if ev.Name != "Slam" {
			continue
		}
		switch ev.Kind {
		case "cast":
			casts = append(casts, ev)
		case "hit":
			hits = append(hits, ev)
		}
	}
	if len(casts) == 0 || len(hits) == 0 {
		t.Fatalf("expected slam casts and hits, casts=%d hits=%d names=%v", len(casts), len(hits), actionNames(res))
	}
	if math.Abs(casts[0].DurationSeconds-1.5) > 1e-9 {
		t.Fatalf("slam cast time=%v want 1.5", casts[0].DurationSeconds)
	}
	land := casts[0].TimeSeconds + casts[0].DurationSeconds
	if math.Abs(hits[0].TimeSeconds-land) > 1e-6 {
		t.Fatalf("slam hit at %v, want land %v", hits[0].TimeSeconds, land)
	}
	start, end := casts[0].TimeSeconds, land
	for _, ev := range res.Timeline {
		if ev.TimeSeconds <= start+1e-9 || ev.TimeSeconds >= end-1e-9 {
			continue
		}
		switch ev.Name {
		case "Auto Attack", "Off-Hand", "Whirlwind", "Bloodthirst", "Mortal Strike", "Heroic Strike":
			t.Fatalf("melee/spell %s at %v during slam cast [%v, %v]", ev.Name, ev.TimeSeconds, start, end)
		}
	}
}

func slamCastWindow(t *testing.T, res *pb.SimResult) (start, land float64) {
	t.Helper()
	for _, ev := range res.Timeline {
		if ev.Name == "Slam" && ev.Kind == "cast" {
			return ev.TimeSeconds, ev.TimeSeconds + ev.DurationSeconds
		}
	}
	t.Fatalf("expected a slam cast, names=%v", actionNames(res))
	return 0, 0
}

func assertNoMeleeDuringSlam(t *testing.T, res *pb.SimResult, start, land float64) {
	t.Helper()
	for _, ev := range res.Timeline {
		if ev.TimeSeconds <= start+1e-9 || ev.TimeSeconds >= land-1e-9 {
			continue
		}
		switch ev.Name {
		case "Auto Attack", "Off-Hand", "Heroic Strike":
			t.Fatalf("%s at %v during slam cast [%v, %v]", ev.Name, ev.TimeSeconds, start, land)
		}
	}
}

func firstAutoAfter(res *pb.SimResult, after float64) float64 {
	next := math.Inf(1)
	for _, ev := range res.Timeline {
		if ev.Name != "Auto Attack" {
			continue
		}
		if ev.TimeSeconds > after+1e-9 && ev.TimeSeconds < next {
			next = ev.TimeSeconds
		}
	}
	return next
}

func TestImprovedSlamKeepsSwingTimer(t *testing.T) {
	req := slamOnlyReq()
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Improved Slam"), Rank: 2}}
	res := Run(req)
	start, land := slamCastWindow(t, res)
	if math.Abs(land-start-1.0) > 1e-9 {
		t.Fatalf("improved slam 2 cast=%v want 1.0", land-start)
	}
	assertNoMeleeDuringSlam(t, res, start, land)
	auto := firstAutoAfter(res, land-1e-9)
	if math.IsInf(auto, 1) {
		t.Fatal("expected an auto after improved slam")
	}
	resetAt := land + 0.8
	if auto > resetAt-0.05 {
		t.Fatalf("improved slam should not reset the swing timer, auto at %v (reset would be ~%v)", auto, resetAt)
	}
}

func TestSlamResetsSwingTimer(t *testing.T) {
	res := Run(slamOnlyReq())
	start, land := slamCastWindow(t, res)
	assertNoMeleeDuringSlam(t, res, start, land)
	auto := firstAutoAfter(res, land-1e-9)
	if math.IsInf(auto, 1) {
		t.Fatal("expected an auto after slam")
	}
	if auto < land+0.8-0.05 {
		t.Fatalf("unimproved slam should reset the swing timer, auto at %v want ~%v", auto, land+0.8)
	}
}

func TestDamagingActionsKeepCastCounts(t *testing.T) {
	req := TypicalOrcWarrior()
	req.Options.Iterations = 40
	req.Options.RngSeed = 923041862709377162
	res := Run(req)
	for _, a := range res.Actions {
		if a.Dps > 0.01 && a.Casts <= 0 {
			t.Fatalf("%s has %.1f dps but %.4f casts/iter", a.Name, a.Dps, a.Casts)
		}
	}
}

func TestOverpowerUsedOnCooldown(t *testing.T) {
	req := baseReq()
	req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     41.8,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
		Hand:          "1h",
	}}}
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "overpower", Priority: 670}}
	res := Run(req)
	if actionByName(res, "Overpower").Casts < 0.3 {
		t.Fatalf("overpower should fire after dodges, got %v", actionNames(res))
	}
}

func TestOverpowerRequiresDodge(t *testing.T) {
	op := clientdata.Ability{ID: "overpower", Kind: "strike", Priority: 900, GCD: true, RequiresProc: "dodge"}
	slam := clientdata.Ability{ID: "slam", Kind: "strike", Priority: 400, GCD: true}
	f := &fight{abilities: []clientdata.Ability{op, slam}, cds: map[string]float64{}, t: 1, end: 60}
	if got := f.pickGCD(); got == nil || got.ID != "slam" {
		t.Fatalf("without a dodge want slam, got %#v", got)
	}
	f.dodgeUntil = 6
	if got := f.pickGCD(); got == nil || got.ID != "overpower" {
		t.Fatalf("after dodge want overpower, got %#v", got)
	}
}

func TestBloodFuryMultipliesAttackPowerAndSpellPower(t *testing.T) {
	f := &fight{attackPower: 1000, spellPower: 200, t: 1, end: 60}
	f.refreshBuff(combatBuff{id: "blood-fury", name: "Blood Fury", expire: 16, apMul: 0.1, spMul: 0.1})
	if got := f.currentAP(); math.Abs(got-1100) > 1e-6 {
		t.Fatalf("blood fury AP=%v want 1100", got)
	}
	if got := f.currentSP(); math.Abs(got-220) > 1e-6 {
		t.Fatalf("blood fury SP=%v want 220", got)
	}
	if f.dmgMul() != 1 {
		t.Fatalf("blood fury must not be a damage%% aura, dmgMul=%v", f.dmgMul())
	}
}

func TestBerserkerDancesForOverpower(t *testing.T) {
	req := baseReq()
	req.Encounter.DurationSeconds = 180
	req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     41.8,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
		Hand:          "1h",
	}}}
	req.Player.Stance = pb.WarriorStance_WARRIOR_STANCE_BERSERKER
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "overpower", Priority: 670}}
	res := Run(req)
	var battle, zerk, op bool
	for _, ev := range res.Timeline {
		switch ev.Name {
		case "Battle Stance":
			battle = true
		case "Berserker Stance":
			zerk = true
		case "Overpower":
			op = true
		}
	}
	if !op || !battle || !zerk {
		t.Fatalf("berserker should dance to battle for overpower, timeline names=%v", actionNames(res))
	}
	var battleDur float64
	for _, ev := range res.Timeline {
		if ev.Name == "Battle Stance" || ev.Name == "Berserker Stance" {
			if ev.Kind != "buff" {
				t.Fatalf("%s should be a buff, got kind=%q", ev.Name, ev.Kind)
			}
		}
		if ev.Name == "Battle Stance" && ev.DurationSeconds > battleDur {
			battleDur = ev.DurationSeconds
		}
	}
	if battleDur < 1 {
		t.Fatalf("battle stance for overpower should last a GCD, duration=%f", battleDur)
	}
}

func TestBerserkerOutdamagesDefensiveStance(t *testing.T) {
	zerk := baseReq()
	zerk.Player.Stance = pb.WarriorStance_WARRIOR_STANCE_BERSERKER
	def := baseReq()
	def.Player.Stance = pb.WarriorStance_WARRIOR_STANCE_DEFENSIVE
	if Run(zerk).DpsMean <= Run(def).DpsMean {
		t.Fatal("berserker stance should deal more damage than defensive")
	}
}

func TestAngerManagementAndEnrageChangeDps(t *testing.T) {
	plain := Run(baseReq())
	req := baseReq()
	req.Player.Talents = []*pb.TalentPick{
		{Id: talentID(t, "Anger Management"), Rank: 1},
		{Id: talentID(t, "Enrage"), Rank: 5},
	}
	if Run(req).DpsMean <= plain.DpsMean {
		t.Fatalf("anger management / enrage should increase dps")
	}
}

func TestPaladinTalentsChangeDps(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_PALADIN
	plain := Run(req)
	talented := baseReq()
	talented.Player.Class = pb.Class_CLASS_PALADIN
	talented.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Divine Strength"), Rank: 5}}
	next := Run(talented)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("divine strength should increase paladin dps: %f vs %f", next.DpsMean, plain.DpsMean)
	}
}

func TestOrcOutdamagesNightElf(t *testing.T) {
	orc := baseReq()
	orc.Player.Race = pb.Race_RACE_ORC
	elf := baseReq()
	elf.Player.Race = pb.Race_RACE_NIGHT_ELF
	if Run(orc).DpsMean <= Run(elf).DpsMean {
		t.Fatalf("orc with Blood Fury should outdamage night elf")
	}
}

func TestTimelineRecordsFirstIteration(t *testing.T) {
	res := Run(baseReq())
	if len(res.Timeline) == 0 {
		t.Fatal("expected timeline events from the first iteration")
	}
	if !hasAction(res, "Charge") {
		t.Fatalf("expected Charge on the timeline, first=%s", res.Timeline[0].Name)
	}
	var maxRage float64
	for _, ev := range res.Timeline {
		if ev.ResourceKind != "rage" {
			t.Fatalf("warrior timeline should tag rage, got %q on %s", ev.ResourceKind, ev.Name)
		}
		if ev.Resource > maxRage {
			maxRage = ev.Resource
		}
	}
	if maxRage < 10 {
		t.Fatalf("expected rage to build on the timeline, max=%f", maxRage)
	}
	var chargeGain, autoGain float64
	for _, ev := range res.Timeline {
		if ev.Name == "Charge" && ev.ResourceGain > chargeGain {
			chargeGain = ev.ResourceGain
		}
		if ev.Name == "Auto Attack" && !ev.Miss && ev.ResourceGain > autoGain {
			autoGain = ev.ResourceGain
		}
	}
	if chargeGain < 10 {
		t.Fatalf("charge should generate rage, got %f", chargeGain)
	}
	if autoGain < 1 {
		t.Fatalf("auto attacks should generate rage, got %f", autoGain)
	}
	if actionByName(res, "Auto Attack").Misses == 0 {
		t.Fatal("expected auto-attack misses in the stub table")
	}
	for i := 1; i < len(res.Timeline); i++ {
		if res.Timeline[i].TimeSeconds+1e-9 < res.Timeline[i-1].TimeSeconds {
			t.Fatalf("timeline went backwards at %d", i)
		}
	}
}

func TestTimelineSplitsBuffsAndDotTicks(t *testing.T) {
	res := Run(baseReq())
	var bloodrage *pb.TimelineEvent
	var ticks int
	for _, ev := range res.Timeline {
		if ev.Name == "Bloodrage" && ev.Kind == "buff" {
			bloodrage = ev
		}
		if ev.Kind == "tick" {
			ticks++
		}
	}
	if bloodrage == nil || bloodrage.DurationSeconds < 9 {
		t.Fatalf("expected Bloodrage buff window, got %+v", bloodrage)
	}
	if hasAction(res, "Rend") && ticks == 0 {
		t.Fatal("expected Rend tick icons on the timeline")
	}
}

func TestDeepWoundsKeepsTickCadence(t *testing.T) {
	req := baseReq()
	req.Options.RngSeed = 8267877463386843184
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Deep Wounds"), Rank: 3}}
	req.Player.BonusStats = &pb.BonusStats{CritChance: 0.5}
	res := Run(req)
	var apply, tick *pb.TimelineEvent
	var windows int
	for _, ev := range res.Timeline {
		if ev.Name != "Deep Wounds" {
			continue
		}
		if ev.Kind == "dot" {
			windows++
			if apply == nil {
				apply = ev
			}
		}
		if ev.Kind == "tick" && tick == nil {
			tick = ev
		}
	}
	if apply == nil || tick == nil {
		t.Fatalf("expected Deep Wounds apply and tick, apply=%v tick=%v", apply, tick)
	}
	delay := tick.TimeSeconds - apply.TimeSeconds
	if delay < 2.5 || delay > 3.5 {
		t.Fatalf("first Deep Wounds tick at %.2fs after apply at %.2fs (want ~3s)", tick.TimeSeconds, apply.TimeSeconds)
	}
	if windows > 3 {
		t.Fatalf("Deep Wounds aura bars should refresh in place, got %d windows", windows)
	}
}

func TestWarriorUsesWhirlwindAndCharge(t *testing.T) {
	res := Run(baseReq())
	if !hasAction(res, "Whirlwind") {
		t.Fatal("expected whirlwind in warrior rotation")
	}
	if !hasAction(res, "Charge") {
		t.Fatal("expected charge opener")
	}
	autos := actionByName(res, "Auto Attack").Casts
	hs := actionByName(res, "Heroic Strike").Casts
	if hs >= autos && autos > 0 {
		t.Fatalf("heroic strike should not replace every swing: hs=%g auto=%g", hs, autos)
	}
}

func TestForeverRacialPassives(t *testing.T) {
	_, _, axeCrit, _ := racials(pb.Race_RACE_ORC, []string{"Axe"})
	if axeCrit < 0.009 {
		t.Fatalf("orc axe specialization crit=%v", axeCrit)
	}
	_, _, swordCrit, _ := racials(pb.Race_RACE_HUMAN, []string{"Sword"})
	if swordCrit < 0.019 {
		t.Fatalf("human sword specialization crit=%v", swordCrit)
	}
	_, _, maceCrit, _ := racials(pb.Race_RACE_DWARF, []string{"Mace"})
	if maceCrit < 0.009 {
		t.Fatalf("dwarf mace specialization crit=%v", maceCrit)
	}
	_, _, orcSword, _ := racials(pb.Race_RACE_ORC, []string{"Sword"})
	if orcSword != 0 {
		t.Fatalf("orc should not get axe crit on a sword, crit=%v", orcSword)
	}
	_, _, orcOHAxe, _ := racials(pb.Race_RACE_ORC, []string{"Sword", "Axe"})
	if orcOHAxe < 0.009 {
		t.Fatalf("orc should get axe spec from off-hand, crit=%v", orcOHAxe)
	}
	_, haste, _, _ := racials(pb.Race_RACE_SKYBORNE, nil)
	if haste > 0.995 {
		t.Fatalf("skyborne wind blessed haste mul=%v", haste)
	}
	_, _, _, hit := racials(pb.Race_RACE_TAUREN, nil)
	if hit < 0.009 {
		t.Fatalf("tauren endurance hit=%v", hit)
	}
}

func TestNightElfUsesElunesLight(t *testing.T) {
	req := baseReq()
	req.Player.Race = pb.Race_RACE_NIGHT_ELF
	res := Run(req)
	if !hasAction(res, "Elune's Light") {
		t.Fatal("expected Elune's Light on night elf")
	}
	on := false
	for _, ev := range res.Timeline {
		if ev.Name == "Elune's Light" && ev.Kind == "buff" && ev.DurationSeconds > 10 {
			if ev.TimeSeconds < 14 {
				t.Fatalf("Elune's Light should wait for Recklessness, t=%.2f", ev.TimeSeconds)
			}
			on = true
			break
		}
	}
	if !on {
		t.Fatal("expected Elune's Light buff on the timeline")
	}
	off := baseReq()
	off.Player.Race = pb.Race_RACE_NIGHT_ELF
	off.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "elunes-light", Priority: 0}}
	if Run(req).DpsMean <= Run(off).DpsMean {
		t.Fatal("Elune's Light should increase night elf dps")
	}
}

func TestOrcUsesBloodFury(t *testing.T) {
	req := baseReq()
	req.Player.Race = pb.Race_RACE_ORC
	res := Run(req)
	if !hasAction(res, "Blood Fury") {
		t.Fatal("expected Blood Fury on orc")
	}
	var names []string
	for _, ev := range res.Timeline {
		if ev.Name == "Charge" || ev.Name == "Blood Fury" {
			names = append(names, ev.Name)
		}
		if len(names) == 2 {
			break
		}
	}
	if len(names) < 2 || names[0] != "Charge" || names[1] != "Blood Fury" {
		t.Fatalf("pull CDs = %v", names)
	}
}

func TestTrollUsesBerserking(t *testing.T) {
	req := baseReq()
	req.Player.Race = pb.Race_RACE_TROLL
	if !hasAction(Run(req), "Berserking") {
		t.Fatal("expected Berserking on troll")
	}
}

func TestDeathWishWhenTalented(t *testing.T) {
	req := baseReq()
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Death Wish"), Rank: 1}}
	res := Run(req)
	if !hasAction(res, "Death Wish") {
		t.Fatal("expected Death Wish when talented")
	}
}

func TestBuffDotUptimeAndStrikesAreNA(t *testing.T) {
	req := baseReq()
	req.Options.Iterations = 80
	req.Player.Talents = []*pb.TalentPick{
		{Id: talentID(t, "Death Wish"), Rank: 1},
		{Id: talentID(t, "Bloodthirst"), Rank: 1},
		{Id: talentID(t, "Deep Wounds"), Rank: 3},
		{Id: talentID(t, "Impale"), Rank: 2},
	}
	res := Run(req)
	dw := actionByName(res, "Death Wish")
	if !dw.TracksUptime {
		t.Fatal("Death Wish should track uptime")
	}
	if dw.Uptime < 0.2 || dw.Uptime > 0.51 {
		t.Fatalf("Death Wish uptime=%v want ~30s/60s", dw.Uptime)
	}
	br := actionByName(res, "Bloodrage")
	if !br.TracksUptime {
		t.Fatal("Bloodrage should track uptime")
	}
	if br.Uptime <= 0 {
		t.Fatal("Bloodrage uptime should be > 0")
	}
	if charge := actionByName(res, "Charge"); charge.TracksUptime {
		t.Fatal("Charge has no aura, uptime should be n/a")
	}
	if bt := actionByName(res, "Bloodthirst"); bt.Name == "Bloodthirst" && bt.TracksUptime {
		t.Fatal("Bloodthirst is a strike, uptime should be n/a")
	}
	if auto := actionByName(res, "Auto Attack"); auto.TracksUptime {
		t.Fatal("Auto Attack uptime should be n/a")
	}
	dot := actionByName(res, "Deep Wounds")
	if dot.Name != "Deep Wounds" {
		t.Fatal("expected Deep Wounds")
	}
	if !dot.TracksUptime {
		t.Fatal("Deep Wounds should track uptime")
	}
	if dot.Uptime <= 0 {
		t.Fatal("Deep Wounds uptime should be > 0")
	}
}

func TestBloodthirstWhenTalented(t *testing.T) {
	req := baseReq()
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Bloodthirst"), Rank: 1}}
	if !hasAction(Run(req), "Bloodthirst") {
		t.Fatal("expected Bloodthirst when talented")
	}
}

func TestMortalStrikeWhenTalented(t *testing.T) {
	req := baseReq()
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Mortal Strike"), Rank: 1}}
	if !hasAction(Run(req), "Mortal Strike") {
		t.Fatal("expected Mortal Strike when talented")
	}
}

func TestHeroicStrikeIsRageDump(t *testing.T) {
	req := baseReq()
	req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     33.2,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
	}}}
	res := Run(req)
	autos := actionByName(res, "Auto Attack").Casts
	hs := actionByName(res, "Heroic Strike").Casts
	if autos == 0 {
		t.Fatal("expected white hits")
	}
	if hs >= autos {
		t.Fatalf("HS spam: heroic=%g auto=%g", hs, autos)
	}
}

func TestRogueSpendsEnergyOnSinisterStrike(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_ROGUE
	res := Run(req)
	ss := actionByName(res, "Sinister Strike").Casts
	if ss < 5 {
		t.Fatalf("expected several sinister strikes, got %g", ss)
	}
	if ss > 28 {
		t.Fatalf("energy should limit sinister strike casts, got %g", ss)
	}
}

func TestRogueStealthOpenersOnlyFromStealth(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_ROGUE
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "vanish", Priority: 0}}
	req.Options.Iterations = 1
	res := Run(req)
	var garroteApply, ambushHits int
	var lateOpener bool
	for _, ev := range res.Timeline {
		if ev.Name == "Garrote" && ev.Kind == "dot" {
			garroteApply++
			if ev.TimeSeconds > 0.05 {
				lateOpener = true
			}
		}
		if ev.Name == "Ambush" && ev.Kind == "hit" {
			ambushHits++
			if ev.TimeSeconds > 0.05 {
				lateOpener = true
			}
		}
	}
	if garroteApply+ambushHits != 1 {
		t.Fatalf("expected a single stealth opener, garrote=%d ambush=%d names=%v", garroteApply, ambushHits, actionNames(res))
	}
	if lateOpener {
		t.Fatal("garrote/ambush must not be used after stealth breaks")
	}
}

func TestRogueColdBloodCritsNextSpenderOnly(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_ROGUE
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "vanish", Priority: 0}}
	req.Player.Talents = []*pb.TalentPick{{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Cold Blood"), Rank: 1}}
	req.Options.Iterations = 1
	req.Options.RngSeed = 1
	res := Run(req)
	if !hasAction(res, "Cold Blood") {
		t.Fatalf("expected Cold Blood, got %v", actionNames(res))
	}
	var firstSpenderCrit, firstSpenderMiss bool
	var firstSpender string
	autoCrit, autoHit := 0, 0
	laterSpender, laterSpenderCrit := 0, 0
	for _, ev := range res.Timeline {
		if ev.Kind != "hit" {
			continue
		}
		switch ev.Name {
		case "Sinister Strike", "Backstab", "Ambush", "Eviscerate", "Mutilate", "Mutilate Off-Hand":
			if firstSpender == "" {
				firstSpender = ev.Name
				firstSpenderMiss = ev.Miss
				firstSpenderCrit = ev.Crit
				continue
			}
			if ev.Name == "Mutilate Off-Hand" && firstSpender == "Mutilate" {
				if !ev.Miss && !ev.Crit {
					t.Fatal("Cold Blood should crit both Mutilate hits")
				}
				continue
			}
			if ev.Miss {
				continue
			}
			laterSpender++
			if ev.Crit {
				laterSpenderCrit++
			}
		case "Auto Attack", "Off-Hand":
			if ev.Miss || firstSpender != "" {
				continue
			}
			autoHit++
			if ev.Crit {
				autoCrit++
			}
		}
	}
	if firstSpender == "" {
		t.Fatal("expected a Cold Blood spender")
	}
	if firstSpenderMiss {
		t.Fatalf("first %s missed; rerun if this is rng, Cold Blood is consumed on the attempt", firstSpender)
	}
	if !firstSpenderCrit {
		t.Fatalf("first %s should be a guaranteed crit", firstSpender)
	}
	if autoHit > 0 && autoCrit == autoHit {
		t.Fatal("Cold Blood must not give Recklessness-style crit to auto attacks")
	}
	if laterSpender >= 8 && laterSpenderCrit == laterSpender {
		t.Fatalf("later spenders should not all crit, crits=%d casts=%d", laterSpenderCrit, laterSpender)
	}
}

func TestImprovedSinisterStrikeReducesEnergyCost(t *testing.T) {
	id := talentIDClass(t, pb.Class_CLASS_ROGUE, "Improved Sinister Strike")
	ranks := map[int32]int32{id: 2}
	abs := applyResourceTalents(clientdata.AbilitiesFor(4, 1, map[int32]bool{id: true}), ranks)
	for _, ab := range abs {
		if ab.ID == "sinister-strike" {
			if ab.Cost != 40 {
				t.Fatalf("sinister-strike cost=%v want 40", ab.Cost)
			}
			return
		}
	}
	t.Fatal("missing sinister-strike")
}

func TestRogueSpendsComboAtFiveOnMaintainThenEviscerate(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_ROGUE
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "vanish", Priority: 0}}
	req.Player.Talents = []*pb.TalentPick{
		{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Ruthlessness"), Rank: 3},
		{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Improved Sinister Strike"), Rank: 2},
		{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Improved Slice and Dice"), Rank: 3},
		{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Relentless Strikes"), Rank: 1},
		{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Adrenaline Rush"), Rank: 1},
	}
	req.Options.Iterations = 1
	req.Options.RngSeed = 1
	req.Encounter.DurationSeconds = 60
	res := Run(req)
	var firstSnd, firstRupture, firstEvisc float64
	for _, ev := range res.Timeline {
		if ev.Kind == "tick" {
			continue
		}
		switch ev.Name {
		case "Slice and Dice":
			if firstSnd == 0 {
				firstSnd = ev.TimeSeconds + 1e-9
			}
		case "Rupture":
			if ev.Kind == "dot" && firstRupture == 0 {
				firstRupture = ev.TimeSeconds + 1e-9
			}
		case "Eviscerate":
			if ev.Kind == "hit" && !ev.Miss && firstEvisc == 0 {
				firstEvisc = ev.TimeSeconds + 1e-9
			}
		}
	}
	if firstSnd == 0 {
		t.Fatal("expected Slice and Dice at 5 combo points")
	}
	if firstRupture == 0 {
		t.Fatal("expected Rupture to be kept up after Slice and Dice")
	}
	if firstEvisc == 0 {
		t.Fatal("expected Eviscerate once Slice and Dice and Rupture are up")
	}
	if firstRupture < firstSnd {
		t.Fatalf("Rupture at %.2fs before Slice and Dice at %.2fs", firstRupture-1e-9, firstSnd-1e-9)
	}
	if firstEvisc < firstRupture {
		t.Fatalf("Eviscerate at %.2fs before Rupture at %.2fs", firstEvisc-1e-9, firstRupture-1e-9)
	}
}

func TestVanishAllowsSecondStealthOpener(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_ROGUE
	req.Encounter.DurationSeconds = 20
	req.Options.Iterations = 1
	req.Options.RngSeed = 1
	res := Run(req)
	var vanishAt, secondOpener float64
	openers := 0
	for _, ev := range res.Timeline {
		if ev.Name == "Vanish" && ev.Kind == "buff" {
			vanishAt = ev.TimeSeconds
		}
		if ev.Name == "Garrote" && ev.Kind == "dot" {
			openers++
			if ev.TimeSeconds > 1 {
				secondOpener = ev.TimeSeconds
			}
		}
		if ev.Kind == "hit" && ev.Name == "Ambush" {
			openers++
			if ev.TimeSeconds > 1 {
				secondOpener = ev.TimeSeconds
			}
		}
	}
	if vanishAt < 1 {
		t.Fatalf("expected vanish after combat started, got t=%f", vanishAt)
	}
	if openers < 2 {
		t.Fatalf("vanish should allow a second stealth opener, openers=%d", openers)
	}
	if secondOpener+1e-9 < vanishAt {
		t.Fatalf("second opener at %f before vanish at %f", secondOpener, vanishAt)
	}
}

func TestExecuteUsedInExecutePhase(t *testing.T) {
	req := baseReq()
	req.Encounter.DurationSeconds = 60
	req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     41.8,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
		Hand:          "1h",
	}}}
	res := Run(req)
	if !hasAction(res, "Execute") {
		t.Fatal("expected Execute in the last 20% of the fight")
	}
	early := false
	late := false
	for _, event := range res.Timeline {
		if event.Name != "Execute" {
			continue
		}
		if event.TimeSeconds < 47 {
			early = true
		}
		if event.TimeSeconds >= 47 {
			late = true
		}
	}
	if early {
		t.Fatal("Execute used before execute range")
	}
	if !late {
		t.Fatal("Execute missing in execute range")
	}
}

func TestExecuteDamageIsBasePlusExtraRage(t *testing.T) {
	ab := clientdata.Ability{ID: "execute", DamageFlat: 600, DumpRagePer: 15}
	f := &fight{}
	got := f.abilityDamage(ab, 75)
	if got != 1725 {
		t.Fatalf("execute raw=%v want 1725 (600 + 15*75 extra rage after cost)", got)
	}
}

func TestNormalizedYellowsUseWeaponSpeedTable(t *testing.T) {
	ww := clientdata.Ability{ID: "whirlwind", Kind: "strike", DamageWeapon: 1}
	ms := clientdata.Ability{ID: "mortal-strike", Kind: "strike", DamageWeapon: 1, DamageFlat: 160}
	slam := clientdata.Ability{ID: "slam", Kind: "strike", DamageWeapon: 1, CastTime: 1.5}
	hs := clientdata.Ability{ID: "heroic-strike", Kind: "queue", DamageFlat: 157}
	f := &fight{baseDPS: 50, swingTimer: 1.9, mhSubclass: "Sword", attackPower: 1400}
	// (50 + 1400/14) * speed = 150 * speed
	if got := f.mhSwing(); math.Abs(got-285) > 1e-6 {
		t.Fatalf("actual swing=%v want 285", got)
	}
	if got := f.abilityDamage(slam, 0); math.Abs(got-285) > 1e-6 {
		t.Fatalf("slam should use real speed, got %v", got)
	}
	if got := f.abilityDamage(ww, 0); math.Abs(got-360) > 1e-6 {
		t.Fatalf("whirlwind should normalize to 2.4, got %v", got)
	}
	if got := f.abilityDamage(ms, 0); math.Abs(got-520) > 1e-6 {
		t.Fatalf("mortal strike want 360+160, got %v", got)
	}
	if got := f.abilityDamage(hs, 0); got != 157 {
		t.Fatalf("heroic strike bonus is flat, got %v", got)
	}
}

func TestOffHandSwingUsesBuffAttackPower(t *testing.T) {
	f := &fight{
		ohDPS: 40, ohTimer: 1.5, ohDwMul: 0.5, hasOH: true, attackPower: 1400,
	}
	// (40+100)*1.5 * 0.5 = 105
	if got := f.ohSwing(); math.Abs(got-105) > 1e-6 {
		t.Fatalf("oh swing=%v want 105", got)
	}
	f.buffs = []combatBuff{{ap: 140, expire: 10}}
	if got := f.ohSwing(); math.Abs(got-112.5) > 1e-6 {
		t.Fatalf("oh swing with +140 AP=%v want 112.5", got)
	}
}

func TestTwoHandSpecMultipliesPhysicalHits(t *testing.T) {
	f := &fight{weaponMul: 1.03, damageMul: 1, bossArmor: 0}
	if got := f.physicalMulAt(0); math.Abs(got-1.03) > 1e-9 {
		t.Fatalf("2H spec physical mul=%v want 1.03", got)
	}
}

func TestMeleeAttackTableHasDodgeAndGlancing(t *testing.T) {
	if math.Abs((&fight{}).dodgeChance()-0.065) > 1e-9 {
		t.Fatalf("dodge=%v want 6.5%%", (&fight{}).dodgeChance())
	}
	if math.Abs((&fight{}).glanceChance()-0.40) > 1e-9 {
		t.Fatalf("glance=%v want 40%%", (&fight{}).glanceChance())
	}
	f := &fight{
		rng: rand.New(rand.NewSource(1)), missWhite: 0.09, missYellow: 0.09, crit: 0.20,
	}
	var glance, miss int
	const n = 8000
	for i := 0; i < n; i++ {
		crit, isMiss, mul := f.attackOutcome(false, false)
		if isMiss {
			miss++
			continue
		}
		if !crit && mul < 1 {
			glance++
		}
	}
	glanceRate := float64(glance) / n
	missRate := float64(miss) / n
	if glanceRate < 0.32 || glanceRate > 0.48 {
		t.Fatalf("white glance rate=%v want ~40%%", glanceRate)
	}
	if missRate < 0.12 || missRate > 0.20 {
		t.Fatalf("white miss+dodge rate=%v want ~15.5%%", missRate)
	}
	f.noDodge = true
	_, dodged, _ := f.attackOutcome(true, false)
	_ = dodged
	var yellowMiss int
	for i := 0; i < n; i++ {
		_, isMiss, mul := f.attackOutcome(true, false)
		if isMiss {
			yellowMiss++
		}
		if mul != 1 {
			t.Fatal("yellow hits must not glance")
		}
	}
	if float64(yellowMiss)/n > 0.12 {
		t.Fatalf("overpower-style yellows with noDodge miss=%v want ~9%%", float64(yellowMiss)/n)
	}
}

func TestActionMetricsSplitMissAndDodge(t *testing.T) {
	req := baseReq()
	req.Encounter.DurationSeconds = 60
	req.Options.Iterations = 40
	res := Run(req)
	var auto *pb.ActionMetric
	for _, action := range res.Actions {
		if action.Name == "Auto Attack" {
			auto = action
			break
		}
	}
	if auto == nil {
		t.Fatal("missing Auto Attack metrics")
	}
	if auto.Casts < 10 {
		t.Fatalf("casts=%v", auto.Casts)
	}
	if auto.Misses < 0.2 {
		t.Fatalf("misses=%v want some true misses", auto.Misses)
	}
	if auto.Dodges < 0.2 {
		t.Fatalf("dodges=%v want some dodges", auto.Dodges)
	}
	missRate := auto.Misses / auto.Casts
	dodgeRate := auto.Dodges / auto.Casts
	if missRate < 0.03 || missRate > 0.16 {
		t.Fatalf("miss rate=%v want ~white miss", missRate)
	}
	if dodgeRate < 0.03 || dodgeRate > 0.10 {
		t.Fatalf("dodge rate=%v want ~6.5%%", dodgeRate)
	}
}

func TestTimelineRageRisesAtPull(t *testing.T) {
	req := baseReq()
	req.Encounter.DurationSeconds = 180
	req.Options.Iterations = 1
	res := Run(req)
	var at0, last float64
	var lastT float64
	for _, ev := range res.Timeline {
		if ev.TimeSeconds <= 0.05 && ev.Resource > at0 {
			at0 = ev.Resource
		}
		if ev.TimeSeconds >= lastT {
			lastT = ev.TimeSeconds
			if ev.ResourceKind != "" {
				last = ev.Resource
			}
		}
	}
	t.Logf("t0 max rage=%v last t=%.2f rage=%v n=%d", at0, lastT, last, len(res.Timeline))
	if at0 < 20 {
		t.Fatalf("expected charge+bloodrage at pull, rage=%v", at0)
	}
}

func TestLongFightKeepsLateTimelineEvents(t *testing.T) {
	req := baseReq()
	req.Encounter.DurationSeconds = 180
	req.Options.Iterations = 2
	res := Run(req)
	var maxT float64
	for _, event := range res.Timeline {
		if event.TimeSeconds > maxT {
			maxT = event.TimeSeconds
		}
	}
	if maxT < 160 {
		t.Fatalf("timeline ended at %.1fs, expected events near the end of a 180s fight", maxT)
	}
}

func hasAction(res *pb.SimResult, name string) bool {
	for _, a := range res.Actions {
		if a.Name == name && (a.Casts > 0 || a.Dps > 0) {
			return true
		}
	}
	return false
}

func actionNames(res *pb.SimResult) []string {
	out := make([]string, 0, len(res.Actions))
	for _, a := range res.Actions {
		out = append(out, a.Name)
	}
	return out
}

func actionByName(res *pb.SimResult, name string) *pb.ActionMetric {
	for _, a := range res.Actions {
		if a.Name == name {
			return a
		}
	}
	return &pb.ActionMetric{}
}

func TestMageDoesNotAutoAttack(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_MAGE
	res := Run(req)
	if res.DpsMean <= 0 {
		t.Fatalf("mage should deal spell damage, got %f", res.DpsMean)
	}
	if hasAction(res, "Auto Attack") || hasAction(res, "Off-Hand") {
		t.Fatalf("mage should not auto-attack: %v", actionNames(res))
	}
}

func TestSpellPowerIncreasesCasterDps(t *testing.T) {
	plain := baseReq()
	plain.Player.Class = pb.Class_CLASS_MAGE
	geared := baseReq()
	geared.Player.Class = pb.Class_CLASS_MAGE
	geared.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:         1,
		Name:       "Spellbound",
		Slot:       pb.ItemSlot_ITEM_SLOT_CHEST,
		Intellect:  30,
		SpellPower: 80,
	}}}
	if Run(geared).DpsMean <= Run(plain).DpsMean {
		t.Fatal("spell power should increase mage dps")
	}
}

func TestWarriorAttackPowerFromStrengthNotAgility(t *testing.T) {
	strReq := baseReq()
	strReq.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:       1,
		Slot:     pb.ItemSlot_ITEM_SLOT_CHEST,
		Strength: 100,
	}}}
	agiReq := baseReq()
	agiReq.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:      1,
		Slot:    pb.ItemSlot_ITEM_SLOT_CHEST,
		Agility: 100,
	}}}
	strDPS := Run(strReq).DpsMean
	agiDPS := Run(agiReq).DpsMean
	if strDPS <= agiDPS {
		t.Fatalf("warrior strength should add more AP than agility: str=%f agi=%f", strDPS, agiDPS)
	}
}

func TestRogueAttackPowerUsesAgility(t *testing.T) {
	plain := baseReq()
	plain.Player.Class = pb.Class_CLASS_ROGUE
	geared := baseReq()
	geared.Player.Class = pb.Class_CLASS_ROGUE
	geared.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:      1,
		Slot:    pb.ItemSlot_ITEM_SLOT_CHEST,
		Agility: 100,
	}}}
	if Run(geared).DpsMean <= Run(plain).DpsMean {
		t.Fatal("rogue agility should increase attack power and dps")
	}
}

func TestWarriorKeepsRendUp(t *testing.T) {
	req := baseReq()
	req.Player.Stance = pb.WarriorStance_WARRIOR_STANCE_BATTLE
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "rend", Priority: 665}}
	res := Run(req)
	if !hasAction(res, "Rend") {
		t.Fatalf("expected Rend ticks, got %v", actionNames(res))
	}
	if actionByName(res, "Rend").Casts < 3 {
		t.Fatalf("rend should stay up across the fight, casts=%g", actionByName(res, "Rend").Casts)
	}
}

func TestDeepWoundsAndImprovedRend(t *testing.T) {
	plain := Run(baseReq())
	talented := baseReq()
	talented.Player.Talents = []*pb.TalentPick{
		{Id: talentID(t, "Improved Rend"), Rank: 3},
		{Id: talentID(t, "Deep Wounds"), Rank: 3},
	}
	next := Run(talented)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("arms bleeds should increase dps: %f vs %f", next.DpsMean, plain.DpsMean)
	}
	if !hasAction(next, "Deep Wounds") {
		t.Fatalf("expected Deep Wounds from crits, got %v", actionNames(next))
	}
}

func TestRoguePoisonsAndRupture(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_ROGUE
	req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		{Id: 1, Slot: pb.ItemSlot_ITEM_SLOT_MAIN_HAND, WeaponDps: 40, AttackSpeedMs: 1800, Hand: "1h"},
		{Id: 2, Slot: pb.ItemSlot_ITEM_SLOT_OFF_HAND, WeaponDps: 35, AttackSpeedMs: 1600, Hand: "1h"},
	}}
	res := Run(req)
	if !hasAction(res, "Instant Poison") {
		t.Fatalf("expected Instant Poison, got %v", actionNames(res))
	}
	if !hasAction(res, "Deadly Poison") {
		t.Fatalf("expected Deadly Poison, got %v", actionNames(res))
	}
	if !hasAction(res, "Rupture") && !hasAction(res, "Garrote") {
		t.Fatalf("expected a rogue bleed, got %v", actionNames(res))
	}
}

func TestRogueMutilateWhenTalented(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_ROGUE
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "vanish", Priority: 0}}
	req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
		{Id: 1, Slot: pb.ItemSlot_ITEM_SLOT_MAIN_HAND, WeaponDps: 40, AttackSpeedMs: 1800, Hand: "1h"},
		{Id: 2, Slot: pb.ItemSlot_ITEM_SLOT_OFF_HAND, WeaponDps: 35, AttackSpeedMs: 1600, Hand: "1h"},
	}}
	req.Options.Iterations = 1
	plain := Run(req)
	if hasAction(plain, "Mutilate") {
		t.Fatalf("mutilate should require the talent, got %v", actionNames(plain))
	}
	req.Player.Talents = []*pb.TalentPick{{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Mutilate"), Rank: 1}}
	res := Run(req)
	if !hasAction(res, "Mutilate") {
		t.Fatalf("expected Mutilate, got %v", actionNames(res))
	}
	if hasAction(res, "Sinister Strike") && actionByName(res, "Sinister Strike").Casts >= actionByName(res, "Mutilate").Casts {
		t.Fatalf("mutilate should be the primary builder, ss=%v mut=%v", actionByName(res, "Sinister Strike").Casts, actionByName(res, "Mutilate").Casts)
	}
}

func TestRogueMutilateTalentsIncreaseDamage(t *testing.T) {
	withMut := func() *pb.SimRequest {
		req := baseReq()
		req.Player.Class = pb.Class_CLASS_ROGUE
		req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "vanish", Priority: 0}}
		req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{
			{Id: 1, Slot: pb.ItemSlot_ITEM_SLOT_MAIN_HAND, WeaponDps: 40, AttackSpeedMs: 1800, Hand: "1h"},
			{Id: 2, Slot: pb.ItemSlot_ITEM_SLOT_OFF_HAND, WeaponDps: 35, AttackSpeedMs: 1600, Hand: "1h"},
		}}
		req.Player.Talents = []*pb.TalentPick{{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Mutilate"), Rank: 1}}
		req.Options.Iterations = 80
		req.Options.RngSeed = 2
		return req
	}
	plain := Run(withMut())
	talented := withMut()
	talented.Player.Talents = append(talented.Player.Talents,
		&pb.TalentPick{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Opportunity"), Rank: 2},
		&pb.TalentPick{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Lethality"), Rank: 5},
		&pb.TalentPick{Id: talentIDClass(t, pb.Class_CLASS_ROGUE, "Puncturing Wounds"), Rank: 3},
	)
	g := collectGenericTalents(pb.Class_CLASS_ROGUE, talented.Player.Talents)
	if math.Abs(g.abilityMul["mutilate"]-1.10) > 1e-9 {
		t.Fatalf("opportunity 2 should be 10%% mutilate damage, got %v", g.abilityMul["mutilate"])
	}
	next := Run(talented)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("mutilate talents should increase dps: %f vs %f", next.DpsMean, plain.DpsMean)
	}
}

func TestWarlockAndPriestDotsTick(t *testing.T) {
	lock := baseReq()
	lock.Player.Class = pb.Class_CLASS_WARLOCK
	lockRes := Run(lock)
	if !hasAction(lockRes, "Corruption") {
		t.Fatalf("expected Corruption, got %v", actionNames(lockRes))
	}
	if actionByName(lockRes, "Corruption").Casts < 6 {
		t.Fatalf("corruption should tick, casts=%g", actionByName(lockRes, "Corruption").Casts)
	}
	priest := baseReq()
	priest.Player.Class = pb.Class_CLASS_PRIEST
	priestRes := Run(priest)
	if !hasAction(priestRes, "Shadow Word: Pain") {
		t.Fatalf("expected Shadow Word: Pain, got %v", actionNames(priestRes))
	}
	if actionByName(priestRes, "Shadow Word: Pain").Casts < 6 {
		t.Fatalf("SW:P should tick, casts=%g", actionByName(priestRes, "Shadow Word: Pain").Casts)
	}
}

func TestRaidBuffsIncreaseWarriorDps(t *testing.T) {
	plain := Run(baseReq())
	buffed := baseReq()
	buffed.Player.RaidBuffs = []string{"blessing-of-kings", "blessing-of-might", "strength-of-earth", "sunder-armor"}
	next := Run(buffed)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("raid buffs should increase dps: %f vs %f", next.DpsMean, plain.DpsMean)
	}
}

func TestWindfuryTotemAddsHits(t *testing.T) {
	req := baseReq()
	req.Player.RaidBuffs = []string{"windfury-totem"}
	req.Options.Iterations = 200
	res := Run(req)
	if !hasAction(res, "Windfury") {
		t.Fatalf("expected Windfury hits, got %v", actionNames(res))
	}
}

func TestMaintainedBuffsAreNotCast(t *testing.T) {
	warrior := Run(baseReq())
	if hasAction(warrior, "Battle Shout") {
		t.Fatal("Battle Shout belongs on the Buffs tab, not the rotation")
	}

	hunter := baseReq()
	hunter.Player.Class = pb.Class_CLASS_HUNTER
	if hasAction(Run(hunter), "Hunter's Mark") {
		t.Fatal("Hunter's Mark belongs on the Buffs tab, not the rotation")
	}

	druid := baseReq()
	druid.Player.Class = pb.Class_CLASS_DRUID
	if hasAction(Run(druid), "Faerie Fire") {
		t.Fatal("Faerie Fire belongs on the Buffs tab, not the rotation")
	}
}

func TestArmorDebuffsIncreasePhysicalTaken(t *testing.T) {
	lost := 0.0
	for _, id := range []string{"sunder-armor", "faerie-fire", "curse-of-recklessness"} {
		b, ok := clientdata.RaidBuffByID(id)
		if !ok {
			t.Fatalf("missing %s", id)
		}
		lost += b.Armor
	}
	if lost != 2250+505+640 {
		t.Fatalf("armor shred = %v", lost)
	}
	full := physicalTaken(defaultBossArmor)
	shredded := physicalTaken(defaultBossArmor - lost)
	if shredded <= full {
		t.Fatalf("lower armor should take more damage: %f vs %f on %.0f armor boss", shredded, full, defaultBossArmor)
	}

	plain := Run(baseReq())
	debuffed := baseReq()
	debuffed.Player.RaidBuffs = []string{"sunder-armor", "faerie-fire", "curse-of-recklessness"}
	next := Run(debuffed)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("armor debuffs should increase warrior dps: %f vs %f", next.DpsMean, plain.DpsMean)
	}
}

func TestPatchwerkArmorLowersDpsVsDummy(t *testing.T) {
	dummy := baseReq()
	dummy.Encounter.Armor = 3731
	boss := baseReq()
	boss.Encounter.Armor = 0
	dummyRes := Run(dummy)
	bossRes := Run(boss)
	if bossRes.DpsMean >= dummyRes.DpsMean {
		t.Fatalf("7700 armor Patchwerk should take less than 3731 dummy: boss %f dummy %f", bossRes.DpsMean, dummyRes.DpsMean)
	}
}

func TestMightyRagePotionActsLikeDamageCooldown(t *testing.T) {
	plain := Run(baseReq())
	with := baseReq()
	with.Player.CombatPotion = 13442
	res := Run(with)
	if res.DpsMean <= plain.DpsMean {
		t.Fatalf("mighty rage should increase dps: plain=%f with=%f", plain.DpsMean, res.DpsMean)
	}
	if !hasAction(res, "Mighty Rage Potion") {
		t.Fatalf("expected Mighty Rage Potion in results, got %v", actionNames(res))
	}
	if actionByName(res, "Mighty Rage Potion").Casts < 1 {
		t.Fatalf("expected potion uses, casts=%g", actionByName(res, "Mighty Rage Potion").Casts)
	}
	var buff *pb.TimelineEvent
	for _, ev := range res.Timeline {
		if ev.Name == "Mighty Rage Potion" && ev.Kind == "buff" {
			buff = ev
			break
		}
	}
	if buff == nil {
		t.Fatal("expected Mighty Rage Potion buff on the timeline")
	}
	if buff.DurationSeconds < 19 || buff.DurationSeconds > 21 {
		t.Fatalf("potion buff duration = %f", buff.DurationSeconds)
	}
}

func TestBonusAttackPowerRaisesDps(t *testing.T) {
	plain := Run(baseReq())
	buffed := baseReq()
	buffed.Player.BonusStats = &pb.BonusStats{AttackPower: 100}
	next := Run(buffed)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("bonus AP should raise dps: %f vs %f", next.DpsMean, plain.DpsMean)
	}
}

func TestStatWeightsWarrior(t *testing.T) {
	req := baseReq()
	req.Options.Iterations = 120
	res := RunStatWeights(req)
	if res.ReferenceId != "attack-power" {
		t.Fatalf("warrior reference = %s", res.ReferenceId)
	}
	byID := map[string]*pb.StatWeight{}
	for _, w := range res.Weights {
		byID[w.Id] = w
	}
	ap := byID["attack-power"]
	if ap == nil || ap.Ep < 0.99 || ap.Ep > 1.01 {
		t.Fatalf("AP EP should be 1, got %+v", ap)
	}
	if ap.Dps <= 0 {
		t.Fatalf("AP should add DPS, got %f", ap.Dps)
	}
	str := byID["strength"]
	if str == nil || str.Ep <= 0 {
		t.Fatalf("warrior strength should be worth AP, got %+v", str)
	}
}

func TestStatWeightsMageUsesSpellPower(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_MAGE
	req.Options.Iterations = 80
	res := RunStatWeights(req)
	if res.ReferenceId != "spell-power" {
		t.Fatalf("mage reference = %s", res.ReferenceId)
	}
	if len(res.Weights) == 0 || res.Weights[0].Dps == 0 && res.BaselineDps == 0 {
		t.Fatalf("expected mage baseline dps, got %+v", res)
	}
}

func TestApplyAbilityPriorities(t *testing.T) {
	abs := []clientdata.Ability{
		{ID: "whirlwind", Priority: 680},
		{ID: "rend", Priority: 665},
	}
	out := applyAbilityPriorities(abs, map[string]int{"rend": 900})
	if out[0].ID != "rend" || out[0].Priority != 900 {
		t.Fatalf("rend should be first after override, got %+v", out[0])
	}
	dropped := applyAbilityPriorities(abs, map[string]int{"rend": 0})
	if len(dropped) != 1 || dropped[0].ID != "whirlwind" {
		t.Fatalf("priority 0 should drop rend, got %+v", dropped)
	}
}

func TestPriorityZeroStopsCasts(t *testing.T) {
	req := TypicalOrcWarrior()
	req.Options.Iterations = 40
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "rend", Priority: 0}}
	res := Run(req)
	if res.DpsMean <= 0 {
		t.Fatal("expected autos still deal damage")
	}
	for _, a := range res.Actions {
		if a.Name == "Rend" {
			t.Fatal("rend must not be used when priority is 0")
		}
	}
}

func TestTypicalOrcWarriorHasStartingGear(t *testing.T) {
	req := TypicalOrcWarrior()
	if req.Player.GetClass() != pb.Class_CLASS_WARRIOR || req.Player.GetRace() != pb.Race_RACE_ORC {
		t.Fatal("expected orc warrior")
	}
	if len(req.Player.GetGear().GetItems()) < 10 {
		t.Fatalf("expected starting raid gear, got %d items", len(req.Player.GetGear().GetItems()))
	}
}

func TestFieldMarshalSixPieceAttackPowerIncreasesDps(t *testing.T) {
	set, ok := clientdata.SetByID("field-marshals-battlegear")
	if !ok || len(set.Pieces) < 6 {
		t.Fatal("missing Field Marshal's Battlegear")
	}
	weapon := &pb.EquippedItem{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     41.8,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
		Hand:          "1h",
	}
	five := baseReq()
	five.Options.Iterations = 80
	five.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{weapon}}
	for i, id := range set.Pieces[:5] {
		five.Player.Gear.Items = append(five.Player.Gear.Items, &pb.EquippedItem{
			Id:   id,
			Slot: pb.ItemSlot(i + 1),
		})
	}
	six := baseReq()
	six.Options.Iterations = 80
	six.Player.Gear = &pb.Gear{Items: append([]*pb.EquippedItem{}, five.Player.Gear.Items...)}
	six.Player.Gear.Items = append(six.Player.Gear.Items, &pb.EquippedItem{
		Id:   set.Pieces[5],
		Slot: pb.ItemSlot_ITEM_SLOT_FEET,
	})
	plain := Run(five)
	buffed := Run(six)
	if buffed.DpsMean <= plain.DpsMean {
		t.Fatalf("6pc +40 AP should increase dps: 5pc=%f 6pc=%f", plain.DpsMean, buffed.DpsMean)
	}
}

func TestBloodrageSkipsNearRageCap(t *testing.T) {
	ab := clientdata.Ability{ID: "bloodrage", Kind: "opener", Priority: 945, Duration: 10}
	high := &fight{resourceKind: "rage", resource: 91, maxRage: 100}
	if high.usable(ab) {
		t.Fatal("bloodrage should skip when rage is above cap-10")
	}
	ok := &fight{resourceKind: "rage", resource: 90, maxRage: 100}
	if !ok.usable(ab) {
		t.Fatal("bloodrage should still cast at exactly cap-10")
	}
}

func TestBoundlessRageRaisesMaxRage(t *testing.T) {
	id := talentID(t, "Boundless Rage")
	plain := warriorPassivesFor(&pb.Player{Class: pb.Class_CLASS_WARRIOR}, map[int32]int32{}, false, "Axe", 7700)
	buffed := warriorPassivesFor(&pb.Player{Class: pb.Class_CLASS_WARRIOR}, map[int32]int32{id: 3}, false, "Axe", 7700)
	if plain.maxRage != 100 {
		t.Fatalf("base max rage=%v want 100", plain.maxRage)
	}
	if buffed.maxRage != 130 {
		t.Fatalf("boundless rage 3/3 max=%v want 130", buffed.maxRage)
	}
	f := &fight{resourceKind: "rage", resource: 121, maxRage: buffed.maxRage}
	if f.usable(clientdata.Ability{ID: "bloodrage", Kind: "opener", Priority: 945, Duration: 10}) {
		t.Fatal("bloodrage skip should use the raised cap")
	}
}

func TestWhirlwindWaitsForBloodthirst(t *testing.T) {
	ww := clientdata.Ability{ID: "whirlwind", Kind: "strike", Priority: 680, GCD: true, WaitForReadyAbove: 1.5}
	bt := clientdata.Ability{ID: "bloodthirst", Kind: "strike", Priority: 720, GCD: true}
	f := &fight{
		abilities: []clientdata.Ability{bt, ww},
		cds:       map[string]float64{"bloodthirst": 1.0},
	}
	if f.usable(ww) {
		t.Fatal("whirlwind should wait while bloodthirst is ready in 1s")
	}
	f.cds["bloodthirst"] = 1.6
	if !f.usable(ww) {
		t.Fatal("whirlwind should fill when bloodthirst is more than 1.5s away")
	}
}

func TestWhirlwindPriorityAboveBloodthirstDoesNotWait(t *testing.T) {
	ww := clientdata.Ability{ID: "whirlwind", Kind: "strike", Priority: 900, GCD: true, WaitForReadyAbove: 1.5}
	bt := clientdata.Ability{ID: "bloodthirst", Kind: "strike", Priority: 720, GCD: true}
	f := &fight{
		abilities: []clientdata.Ability{ww, bt},
		cds:       map[string]float64{"bloodthirst": 1.0},
	}
	if !f.usable(ww) {
		t.Fatal("whirlwind should not wait for a lower-priority bloodthirst")
	}
}

func TestWhirlwindNotBlockedByExecuteOutsidePhase(t *testing.T) {
	ww := clientdata.Ability{ID: "whirlwind", Kind: "strike", Priority: 800, GCD: true, WaitForReadyAbove: 1.5}
	ex := clientdata.Ability{ID: "execute", Kind: "strike", Priority: 900, GCD: true, HealthBelow: 0.2}
	bt := clientdata.Ability{ID: "bloodthirst", Kind: "strike", Priority: 720, GCD: true}
	f := &fight{
		abilities: []clientdata.Ability{ex, ww, bt},
		cds:       map[string]float64{},
		end:       180,
		t:         10,
	}
	if !f.usable(ww) {
		t.Fatal("whirlwind should still cast when execute is higher but not in execute phase")
	}
}

func TestExecuteRotationOverridesMain(t *testing.T) {
	bt := clientdata.Ability{ID: "bloodthirst", Kind: "strike", Priority: 900, GCD: true}
	ww := clientdata.Ability{ID: "whirlwind", Kind: "strike", Priority: 700, GCD: true}
	f := &fight{
		abilities: []clientdata.Ability{bt, ww},
		executeAbs: []clientdata.Ability{
			{ID: "whirlwind", Kind: "strike", Priority: 900, GCD: true},
			{ID: "bloodthirst", Kind: "strike", Priority: 700, GCD: true},
		},
		cds: map[string]float64{},
		end: 100,
		t:   10,
	}
	if got := f.pickGCD(); got == nil || got.ID != "bloodthirst" {
		t.Fatalf("before execute want bloodthirst, got %#v", got)
	}
	f.t = 85
	if got := f.pickGCD(); got == nil || got.ID != "whirlwind" {
		t.Fatalf("in execute want whirlwind, got %#v", got)
	}
}

func TestDeathWishExecuteOnlyAppearsOnTimeline(t *testing.T) {
	req := baseReq()
	req.Options.Iterations = 1
	req.Encounter.DurationSeconds = 60
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Death Wish"), Rank: 1}}
	req.Player.Gear = &pb.Gear{Items: []*pb.EquippedItem{{
		Id:            19019,
		Name:          "Thunderfury",
		Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
		WeaponDps:     41.8,
		AttackSpeedMs: 1900,
		ItemSubclass:  "Sword",
		Hand:          "1h",
	}}}
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "death-wish", Priority: 0}}
	req.Player.ExecuteAbilityPriorities = []*pb.AbilityPriority{
		{Id: "death-wish", Priority: 930},
		{Id: "execute", Priority: 2000},
	}
	res := Run(req)
	dw := actionByName(res, "Death Wish")
	if dw.Casts < 1 {
		t.Fatalf("execute-only death wish should cast, actions=%v", actionNames(res))
	}
	var at float64
	for _, ev := range res.Timeline {
		if ev.Name == "Death Wish" {
			at = ev.TimeSeconds
			break
		}
	}
	if !timelineHas(res, "Death Wish") {
		t.Fatal("expected Death Wish on the timeline")
	}
	if at < 47 {
		t.Fatalf("death wish should wait for execute, t=%v", at)
	}
}

func timelineHas(res *pb.SimResult, name string) bool {
	for _, ev := range res.Timeline {
		if ev.Name == name {
			return true
		}
	}
	return false
}

func TestDeathWishCastsInExecuteWhenExecuteIsHigherPriority(t *testing.T) {
	ex := clientdata.Ability{
		ID: "execute", Kind: "strike", Priority: 2000, GCD: true, Cost: 15, Resource: "rage",
		HealthBelow: 0.2, DumpRage: true,
	}
	dw := clientdata.Ability{
		ID: "death-wish", Kind: "buff", Priority: 930, GCD: true, Cost: 10, Resource: "rage",
		Duration: 30, Cooldown: 180, BuffDamage: 0.2,
	}
	f := &fight{
		abilities:    []clientdata.Ability{ex, dw},
		executeAbs:   []clientdata.Ability{ex, dw},
		cds:          map[string]float64{},
		resourceKind: "rage",
		resource:     50,
		end:          100,
		t:            85,
	}
	if got := f.pickGCD(); got == nil || got.ID != "death-wish" {
		t.Fatalf("execute-only death wish should fire before execute, got %#v", got)
	}
	if f.starvesHigher(dw) {
		t.Fatal("execute dump should not reserve rage against death wish")
	}
}

func TestHeroicStrikeQueuesInExecute(t *testing.T) {
	hs := clientdata.Ability{ID: "heroic-strike", Kind: "queue", Priority: 400, Cost: 15, DumpAbove: 40, Resource: "rage"}
	f := &fight{
		abilities:    []clientdata.Ability{hs},
		resourceKind: "rage",
		resource:     20,
		end:          100,
		t:            85,
	}
	if f.queueAbility() == nil {
		t.Fatal("heroic strike should queue in execute even below dumpAbove")
	}
}

func TestHeroicStrikeDumpAboveProtectsHigherStrike(t *testing.T) {
	hs := clientdata.Ability{ID: "heroic-strike", Kind: "queue", Priority: 400, Cost: 15, DumpAbove: 40, Resource: "rage"}
	bt := clientdata.Ability{ID: "bloodthirst", Kind: "strike", Priority: 720, Cost: 30, Resource: "rage", GCD: true}
	f := &fight{
		abilities:    []clientdata.Ability{hs, bt},
		resourceKind: "rage",
		resource:     20,
		end:          100,
		t:            10,
	}
	if f.queueAbility() != nil {
		t.Fatal("heroic strike should not dump below dumpAbove when a higher strike needs rage")
	}
	f.resource = 50
	if f.queueAbility() == nil {
		t.Fatal("heroic strike should dump when rage is above dumpAbove")
	}
}

func TestHeroicStrikeQueuesWhenHighest(t *testing.T) {
	hs := clientdata.Ability{ID: "heroic-strike", Kind: "queue", Priority: 900, Cost: 15, DumpAbove: 40, Resource: "rage"}
	slam := clientdata.Ability{ID: "slam", Kind: "strike", Priority: 400, Cost: 15, Resource: "rage", GCD: true, CastTime: 1.5}
	f := &fight{
		abilities:    []clientdata.Ability{hs, slam},
		resourceKind: "rage",
		resource:     20,
		end:          100,
		t:            10,
	}
	if f.queueAbility() == nil {
		t.Fatal("heroic strike above slam should queue whenever it is payable")
	}
}

func TestSlamWaitsForMortalStrike(t *testing.T) {
	ms := clientdata.Ability{ID: "mortal-strike", Kind: "strike", Priority: 800, GCD: true, Cooldown: 6, Cost: 30, Resource: "rage"}
	slam := clientdata.Ability{ID: "slam", Kind: "strike", Priority: 400, GCD: true, Cost: 15, Resource: "rage", CastTime: 1.5}
	f := &fight{
		abilities: []clientdata.Ability{ms, slam},
		cds:       map[string]float64{"mortal-strike": 1.0},
		t:         0,
	}
	if f.usable(slam) {
		t.Fatal("slam should wait while mortal strike is ready in 1s, like whirlwind waits for bloodthirst")
	}
	f.cds["mortal-strike"] = 1.6
	if !f.usable(slam) {
		t.Fatal("slam should fill when mortal strike is more than a GCD away")
	}
}

func TestSlamStarvesHigherHeroicStrike(t *testing.T) {
	hs := clientdata.Ability{ID: "heroic-strike", Kind: "queue", Priority: 900, Cost: 15, DumpAbove: 40, Resource: "rage"}
	slam := clientdata.Ability{ID: "slam", Kind: "strike", Priority: 400, Cost: 15, Resource: "rage", GCD: true, CastTime: 1.5}
	f := &fight{
		abilities:    []clientdata.Ability{hs, slam},
		resourceKind: "rage",
		resource:     20,
	}
	if !f.starvesHigher(slam) {
		t.Fatal("slam should not spend the rage heroic strike needs when HS is higher")
	}
	f.resource = 40
	if f.starvesHigher(slam) {
		t.Fatal("slam may spend when both slam and heroic strike still fit")
	}
}

func TestSlamDoesNotClipHigherHeroicStrike(t *testing.T) {
	hs := clientdata.Ability{ID: "heroic-strike", Kind: "queue", Priority: 900, Cost: 15, Resource: "rage"}
	slam := clientdata.Ability{ID: "slam", Kind: "strike", Priority: 400, GCD: true, Cost: 15, Resource: "rage", CastTime: 1.5}
	f := &fight{
		abilities:    []clientdata.Ability{hs, slam},
		resourceKind: "rage",
		resource:     50,
		meleeAutos:   true,
		swingTimer:   3.8,
		swingAt:      2,
	}
	if f.usable(slam) {
		t.Fatal("unimproved slam should not reset the swing while heroic strike is higher")
	}
	f.ranks = map[int32]int32{1: 1}
	f.namedMemo = map[string]int32{"Improved Slam": 2}
	f.swingAt = 1.0
	if f.usable(slam) {
		t.Fatal("slam should not lock a higher-priority heroic strike swing that is due during the cast")
	}
	f.swingAt = 4
	if !f.usable(slam) {
		t.Fatal("improved slam may fill when the next heroic strike swing is after the cast")
	}
}

func withTargets(req *pb.SimRequest, n int) *pb.SimRequest {
	if req.Encounter == nil {
		req.Encounter = &pb.Encounter{DurationSeconds: 60}
	}
	req.Encounter.Targets = nil
	for i := 0; i < n; i++ {
		name := "Boss"
		if i > 0 {
			name = "Add"
		}
		req.Encounter.Targets = append(req.Encounter.Targets, &pb.EncounterTarget{Name: name, Armor: 7700})
	}
	return req
}

func TestWhirlwindHitsCleaveTargets(t *testing.T) {
	one := TypicalOrcWarrior()
	one.Options.Iterations = 40
	one.Encounter.DurationSeconds = 30
	four := TypicalOrcWarrior()
	four.Options.Iterations = 40
	four.Options.RngSeed = one.Options.RngSeed
	four.Encounter.DurationSeconds = 30
	withTargets(four, 4)
	ww1 := actionByName(Run(one), "Whirlwind")
	ww4 := actionByName(Run(four), "Whirlwind")
	if ww4.Dps <= ww1.Dps*1.5 {
		t.Fatalf("whirlwind on 4 targets should deal more than on 1: 1t=%.1f 4t=%.1f", ww1.Dps, ww4.Dps)
	}
	if ww4.Casts > ww1.Casts*1.4 {
		t.Fatalf("extra whirlwind targets should not count as extra casts: 1t=%.2f 4t=%.2f", ww1.Casts, ww4.Casts)
	}
}

func TestCleaveRequiresTwoTargets(t *testing.T) {
	one := baseReq()
	one.Player.AbilityPriorities = []*pb.AbilityPriority{
		{Id: "cleave", Priority: 900},
		{Id: "heroic-strike", Priority: 0},
	}
	if actionByName(Run(one), "Cleave").Casts > 0 {
		t.Fatal("cleave should not queue on a single target")
	}
	two := baseReq()
	two.Player.AbilityPriorities = one.Player.AbilityPriorities
	withTargets(two, 2)
	if actionByName(Run(two), "Cleave").Dps <= 0 {
		t.Fatal("cleave should hit when a second target is in the encounter")
	}
}

func TestAddArmorAffectsCleaveDamage(t *testing.T) {
	hard := baseReq()
	hard.Options.Iterations = 80
	hard.Encounter.DurationSeconds = 30
	hard.Player.AbilityPriorities = []*pb.AbilityPriority{
		{Id: "cleave", Priority: 900},
		{Id: "heroic-strike", Priority: 0},
	}
	withTargets(hard, 2)
	hard.Encounter.Targets[1].Armor = 7700

	soft := baseReq()
	soft.Options.Iterations = 80
	soft.Options.RngSeed = hard.Options.RngSeed
	soft.Encounter.DurationSeconds = 30
	soft.Player.AbilityPriorities = hard.Player.AbilityPriorities
	withTargets(soft, 2)
	soft.Encounter.Targets[1].Armor = 3200

	cHard := actionByName(Run(hard), "Cleave")
	cSoft := actionByName(Run(soft), "Cleave")
	if cSoft.Dps <= cHard.Dps*1.05 {
		t.Fatalf("3200-armor add should take more cleave than 7700: hard=%.1f soft=%.1f", cHard.Dps, cSoft.Dps)
	}
}

func TestImprovedCleaveReducesRageCost(t *testing.T) {
	id := talentID(t, "Improved Cleave")
	ab := clientdata.Ability{ID: "cleave", Name: "Cleave", Cost: 20, Resource: "rage"}
	got := applyWarriorAbilityTalents(ab, map[int32]int32{id: 3})
	if got.Cost != 17 {
		t.Fatalf("improved cleave 3/3 should cost 17 rage, got %f", got.Cost)
	}
	rb := talentID(t, "Raging Blows")
	both := applyWarriorAbilityTalents(ab, map[int32]int32{id: 3, rb: 1})
	if both.Cost != 15 {
		t.Fatalf("improved cleave + raging blows should cost 15 rage, got %f", both.Cost)
	}
}

func TestSweepingStrikesHitsSecondTarget(t *testing.T) {
	req := TypicalOrcWarrior()
	req.Options.Iterations = 40
	req.Encounter.DurationSeconds = 30
	withTargets(req, 2)
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Sweeping Strikes"), Rank: 1}}
	req.Player.AbilityPriorities = append(req.Player.AbilityPriorities, &pb.AbilityPriority{Id: "sweeping-strikes", Priority: 950})
	res := Run(req)
	if actionByName(res, "Sweeping Strikes").Dps <= 0 {
		t.Fatalf("sweeping strikes should hit a second target, names=%v", actionNames(res))
	}
}

func TestTimelineFoldsWhirlwindTargetsAndRageAtCast(t *testing.T) {
	req := TypicalOrcWarrior()
	req.Options.Iterations = 1
	req.Encounter.DurationSeconds = 20
	withTargets(req, 4)
	res := Run(req)
	var wwHits int
	for _, ev := range res.Timeline {
		if ev.Name != "Whirlwind" || ev.Kind != "hit" {
			continue
		}
		wwHits++
		if ev.TargetHits != 4 {
			t.Fatalf("whirlwind timeline hit should fold 4 targets, got %d dmg=%.0f", ev.TargetHits, ev.Damage)
		}
		if ev.ResourceKind != "rage" {
			t.Fatalf("whirlwind should record rage, got %q", ev.ResourceKind)
		}
		if ev.ResourceBefore <= ev.Resource {
			t.Fatalf("rage at cast should be before spend, before=%f after=%f", ev.ResourceBefore, ev.Resource)
		}
		if ev.ResourceCost < 20 {
			t.Fatalf("whirlwind should record rage cost, got %f", ev.ResourceCost)
		}
	}
	if wwHits == 0 {
		t.Fatal("expected whirlwind hits on the timeline")
	}
}

func TestWhirlwindCritsEachTargetIndependently(t *testing.T) {
	req := TypicalOrcWarrior()
	req.Options.Iterations = 1
	req.Encounter.DurationSeconds = 20
	req.Player.AbilityPriorities = []*pb.AbilityPriority{{Id: "recklessness", Priority: 0}}
	withTargets(req, 4)
	res := Run(req)
	var wwHits int
	for _, ev := range res.Timeline {
		if ev.Name != "Whirlwind" || ev.Kind != "hit" {
			continue
		}
		wwHits++
		if len(ev.HitCrit) != 4 || len(ev.HitMiss) != 4 || len(ev.HitDamage) != 4 {
			t.Fatalf("whirlwind should store 4 independent rolls, crits=%d misses=%d dmg=%d", len(ev.HitCrit), len(ev.HitMiss), len(ev.HitDamage))
		}
	}
	if wwHits == 0 {
		t.Fatal("expected whirlwind hits on the timeline")
	}

	f := &fight{
		rng:         rand.New(rand.NewSource(1)),
		crit:        0.4,
		damageMul:   1,
		weaponMul:   1,
		targetArmor: []float64{0, 0, 0, 0},
	}
	var crits [4]int
	const n = 5000
	for i := 0; i < n; i++ {
		for tidx := 0; tidx < 4; tidx++ {
			_, crit, _ := f.rollAt(100, true, false, 2, tidx)
			if crit {
				crits[tidx]++
			}
		}
	}
	if crits[0] == crits[1] && crits[1] == crits[2] && crits[2] == crits[3] {
		t.Fatalf("identical crit counts %v; extra targets should roll independently", crits)
	}
	for tidx, c := range crits {
		if c < n*3/10 || c > n*5/10 {
			t.Fatalf("target %d crits=%d of %d, want about 40%%", tidx, c, n)
		}
	}
}

func withRagingBlows(t *testing.T, req *pb.SimRequest) *pb.SimRequest {
	t.Helper()
	req.Player.Talents = append(req.Player.Talents, &pb.TalentPick{Id: talentID(t, "Raging Blows"), Rank: 1})
	if req.Player.Gear == nil {
		req.Player.Gear = &pb.Gear{}
	}
	kept := make([]*pb.EquippedItem, 0, len(req.Player.Gear.Items))
	for _, item := range req.Player.Gear.Items {
		switch item.GetSlot() {
		case pb.ItemSlot_ITEM_SLOT_MAIN_HAND, pb.ItemSlot_ITEM_SLOT_OFF_HAND:
			continue
		}
		kept = append(kept, item)
	}
	req.Player.Gear.Items = append(kept,
		&pb.EquippedItem{
			Id:            1,
			Name:          "Main Hand",
			Slot:          pb.ItemSlot_ITEM_SLOT_MAIN_HAND,
			WeaponDps:     50,
			AttackSpeedMs: 2600,
			ItemSubclass:  "Axe",
			Hand:          "1h",
		},
		&pb.EquippedItem{
			Id:            2,
			Name:          "Off Hand",
			Slot:          pb.ItemSlot_ITEM_SLOT_OFF_HAND,
			WeaponDps:     40,
			AttackSpeedMs: 1800,
			ItemSubclass:  "Axe",
			Hand:          "1h",
		},
	)
	return req
}

func TestRagingBlowsWhirlwindOffHandHitsCleaveTargets(t *testing.T) {
	one := withRagingBlows(t, TypicalOrcWarrior())
	one.Options.Iterations = 40
	one.Encounter.DurationSeconds = 30
	four := withRagingBlows(t, TypicalOrcWarrior())
	four.Options.Iterations = 40
	four.Options.RngSeed = one.Options.RngSeed
	four.Encounter.DurationSeconds = 30
	withTargets(four, 4)
	res1 := Run(one)
	oh1 := actionByName(res1, "Whirlwind Off-Hand")
	oh4 := actionByName(Run(four), "Whirlwind Off-Hand")
	if oh1.Dps <= 0 {
		t.Fatal("raging blows should make whirlwind hit with the off-hand")
	}
	if oh4.Dps <= oh1.Dps*1.5 {
		t.Fatalf("whirlwind off-hand on 4 targets should deal more than on 1: 1t=%.1f 4t=%.1f", oh1.Dps, oh4.Dps)
	}
	if oh4.Casts > oh1.Casts*1.4 {
		t.Fatalf("extra whirlwind off-hand targets should not count as extra casts: 1t=%.2f 4t=%.2f", oh1.Casts, oh4.Casts)
	}
}

func TestTimelineFoldsWhirlwindOffHandTargets(t *testing.T) {
	req := withRagingBlows(t, TypicalOrcWarrior())
	req.Options.Iterations = 1
	req.Encounter.DurationSeconds = 20
	withTargets(req, 4)
	res := Run(req)
	var ohHits int
	for _, ev := range res.Timeline {
		if ev.Name != "Whirlwind Off-Hand" || ev.Kind != "hit" {
			continue
		}
		ohHits++
		if ev.TargetHits != 4 {
			t.Fatalf("whirlwind off-hand timeline hit should fold 4 targets, got %d dmg=%.0f", ev.TargetHits, ev.Damage)
		}
		if ev.ResourceCost != 0 {
			t.Fatalf("off-hand whirlwind should not pay extra rage, cost=%f", ev.ResourceCost)
		}
	}
	if ohHits == 0 {
		t.Fatal("expected whirlwind off-hand hits on the timeline")
	}
}
