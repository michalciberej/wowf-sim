package sim

import (
	"math"
	"testing"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

func talentID(t *testing.T, name string) int32 {
	t.Helper()
	talent, ok := clientdata.TalentByName(name)
	if !ok {
		t.Fatalf("missing talent %s", name)
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
		{id: "bloodthirst", rank: 4, cost: 30, cd: 6, ap: 0.45},
		{id: "mortal-strike", rank: 4, cost: 30, cd: 6, flat: 160, weapon: 1},
		{id: "slam", rank: 4, cost: 15, flat: 87, weapon: 1},
		{id: "shield-slam", rank: 4, cost: 20, cd: 6, flat: 350},
		{id: "battle-shout", rank: 7, cost: 10, dur: 120},
		{id: "shadow-bolt", rank: 10, flat: 510},
		{id: "fireball", rank: 12, flat: 754},
		{id: "sinister-strike", rank: 8, cost: 45, flat: 68, weapon: 1},
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
		class              pb.Class
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

func TestTalentsChangeDps(t *testing.T) {
	plain := Run(baseReq())
	talented := baseReq()
	talented.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Cruelty"), Rank: 5}, {Id: talentID(t, "Mortal Strike"), Rank: 1}}
	next := Run(talented)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("talents should increase dps: %f vs %f", next.DpsMean, plain.DpsMean)
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
		t.Fatalf("orc should outdamage night elf stub")
	}
}

func TestTimelineRecordsFirstIteration(t *testing.T) {
	res := Run(baseReq())
	if len(res.Timeline) == 0 {
		t.Fatal("expected timeline events from the first iteration")
	}
	if res.Timeline[0].Name != "Charge" {
		t.Fatalf("first event = %s", res.Timeline[0].Name)
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
		t.Fatalf("heroic strike should not replace every swing: hs=%d auto=%d", hs, autos)
	}
}

func TestOrcUsesBloodFury(t *testing.T) {
	req := baseReq()
	req.Player.Race = pb.Race_RACE_ORC
	res := Run(req)
	if !hasAction(res, "Blood Fury") {
		t.Fatal("expected Blood Fury on orc")
	}
	if res.Timeline[0].Name != "Charge" || res.Timeline[1].Name != "Blood Fury" {
		t.Fatalf("pull CDs = %s, %s", res.Timeline[0].Name, res.Timeline[1].Name)
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

func TestBloodthirstWhenTalented(t *testing.T) {
	req := baseReq()
	req.Player.Talents = []*pb.TalentPick{{Id: talentID(t, "Bloodthirst"), Rank: 1}}
	if !hasAction(Run(req), "Bloodthirst") {
		t.Fatal("expected Bloodthirst when talented")
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
		t.Fatalf("HS spam: heroic=%d auto=%d", hs, autos)
	}
}

func TestRogueSpendsEnergyOnSinisterStrike(t *testing.T) {
	req := baseReq()
	req.Player.Class = pb.Class_CLASS_ROGUE
	res := Run(req)
	ss := actionByName(res, "Sinister Strike").Casts
	if ss < 5 {
		t.Fatalf("expected several sinister strikes, got %d", ss)
	}
	if ss > 28 {
		t.Fatalf("energy should limit sinister strike casts, got %d", ss)
	}
}

func TestExecuteUsedInExecutePhase(t *testing.T) {
	req := baseReq()
	req.Encounter.DurationSeconds = 60
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
	res := Run(baseReq())
	if !hasAction(res, "Rend") {
		t.Fatalf("expected Rend ticks, got %v", actionNames(res))
	}
	if actionByName(res, "Rend").Casts < 5 {
		t.Fatalf("rend should tick across the fight, casts=%d", actionByName(res, "Rend").Casts)
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

func TestWarlockAndPriestDotsTick(t *testing.T) {
	lock := baseReq()
	lock.Player.Class = pb.Class_CLASS_WARLOCK
	lockRes := Run(lock)
	if !hasAction(lockRes, "Corruption") {
		t.Fatalf("expected Corruption, got %v", actionNames(lockRes))
	}
	if actionByName(lockRes, "Corruption").Casts < 6 {
		t.Fatalf("corruption should tick, casts=%d", actionByName(lockRes, "Corruption").Casts)
	}
	priest := baseReq()
	priest.Player.Class = pb.Class_CLASS_PRIEST
	priestRes := Run(priest)
	if !hasAction(priestRes, "Shadow Word: Pain") {
		t.Fatalf("expected Shadow Word: Pain, got %v", actionNames(priestRes))
	}
	if actionByName(priestRes, "Shadow Word: Pain").Casts < 6 {
		t.Fatalf("SW:P should tick, casts=%d", actionByName(priestRes, "Shadow Word: Pain").Casts)
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
	full := physicalTaken(bossArmor)
	shredded := physicalTaken(bossArmor - lost)
	if shredded <= full {
		t.Fatalf("lower armor should take more damage: %f vs %f on %.0f armor dummy", shredded, full, bossArmor)
	}

	plain := Run(baseReq())
	debuffed := baseReq()
	debuffed.Player.RaidBuffs = []string{"sunder-armor", "faerie-fire", "curse-of-recklessness"}
	next := Run(debuffed)
	if next.DpsMean <= plain.DpsMean {
		t.Fatalf("armor debuffs should increase warrior dps: %f vs %f", next.DpsMean, plain.DpsMean)
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
