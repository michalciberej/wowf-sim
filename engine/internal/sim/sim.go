package sim

import (
	"math"
	"math/rand"
	"sort"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

// Run executes iterations of an APL-style combat model.
// Weapon, talent, and racial numbers are still stubs; they exist so the UI
// choices change DPS. Real Forever tables will replace these multipliers.
func Run(req *pb.SimRequest) *pb.SimResult {
	if req == nil {
		req = &pb.SimRequest{}
	}

	iterations := int(req.GetOptions().GetIterations())
	if iterations <= 0 {
		iterations = 1000
	}

	duration := req.GetEncounter().GetDurationSeconds()
	if duration <= 0 {
		duration = 60
	}

	rng := rand.New(rand.NewSource(seedOrDefault(req.GetOptions().GetRngSeed())))
	player := req.GetPlayer()
	kit := buildModel(player)
	ranks := talentRankMap(player.GetTalents())

	totals := make(map[string]*actionAccum)
	var timeline []*pb.TimelineEvent
	var sum, sumSq float64
	minDPS, maxDPS := math.Inf(1), math.Inf(-1)

	for i := 0; i < iterations; i++ {
		dmg, events, stats := simulateFight(duration, kit, player.GetClass(), ranks, rng, i == 0)
		if i == 0 {
			timeline = events
		}
		for name, acc := range stats {
			tot := totals[name]
			if tot == nil {
				tot = &actionAccum{name: acc.name, icon: acc.icon}
				totals[name] = tot
			}
			tot.dmg += acc.dmg
			tot.casts += acc.casts
			tot.crits += acc.crits
			tot.miss += acc.miss
		}
		dps := dmg / duration
		sum += dps
		sumSq += dps * dps
		if dps < minDPS {
			minDPS = dps
		}
		if dps > maxDPS {
			maxDPS = dps
		}
	}

	mean := sum / float64(iterations)
	variance := sumSq/float64(iterations) - mean*mean
	if variance < 0 {
		variance = 0
	}

	iter := float64(iterations)
	dur := duration
	actions := make([]*pb.ActionMetric, 0, len(totals))
	for _, acc := range totals {
		actions = append(actions, &pb.ActionMetric{
			Name:   acc.name,
			Dps:    acc.dmg / dur / iter,
			Casts:  roundPerIter(acc.casts, iterations),
			Crits:  roundPerIter(acc.crits, iterations),
			Misses: roundPerIter(acc.miss, iterations),
			Icon:   acc.icon,
		})
	}
	sort.SliceStable(actions, func(i, j int) bool {
		if actions[i].Name == "Auto Attack" {
			return true
		}
		if actions[j].Name == "Auto Attack" {
			return false
		}
		return actions[i].Dps > actions[j].Dps
	})

	return &pb.SimResult{
		DpsMean:    mean,
		DpsStdev:   math.Sqrt(variance),
		DpsMin:     minDPS,
		DpsMax:     maxDPS,
		Iterations: int32(iterations),
		Actions:    actions,
		Timeline:   timeline,
	}
}

func buildModel(player *pb.Player) combatKit {
	ranks := talentRankMap(player.GetTalents())
	meleeAutos := usesMeleeAutos(player.GetClass(), ranks)

	swingTimer := 2.4
	hitChance := 0.0
	spellHit := 0.0
	gearCrit := 0.0
	gearSpellCrit := 0.0
	baseDPS := classBaseline(player.GetClass())
	str, agi, intel, _, _, classAP := playerBaseStats(player.GetClass(), player.GetRace())
	var gearAP, spellPower, ohWeapon, ohSpeed float64
	mhTwoHand := false
	raid := collectRaidBuffs(player)

	for _, item := range player.GetGear().GetItems() {
		if item.GetId() == 0 {
			continue
		}
		str += float64(item.GetStrength())
		agi += float64(item.GetAgility())
		intel += float64(item.GetIntellect())
		gearAP += float64(item.GetAttackPower())
		sp := float64(item.GetSpellPower())
		if cat, ok := clientdata.ItemByID(item.GetId()); ok {
			for _, effect := range cat.Effects {
				if effect.Kind == "use" && effect.SpellPower > 0 && effect.SpellPower == sp {
					sp = 0
				}
			}
		}
		spellPower += sp
		gearCrit += item.GetCritChance()
		gearSpellCrit += item.GetSpellCritChance()
		hitChance += item.GetHitChance()
		spellHit += item.GetSpellHitChance()
		switch item.GetSlot() {
		case pb.ItemSlot_ITEM_SLOT_MAIN_HAND:
			if item.GetWeaponDps() > 0 {
				baseDPS = item.GetWeaponDps()
				if item.GetAttackSpeedMs() > 0 {
					swingTimer = float64(item.GetAttackSpeedMs()) / 1000
				}
			}
			if item.GetHand() == "2h" {
				mhTwoHand = true
			}
		case pb.ItemSlot_ITEM_SLOT_OFF_HAND:
			if item.GetWeaponDps() > 0 && item.GetHand() != "oh" {
				ohWeapon = item.GetWeaponDps()
				if item.GetAttackSpeedMs() > 0 {
					ohSpeed = float64(item.GetAttackSpeedMs()) / 1000
				}
			}
		}
	}

	bonus := player.GetBonusStats()
	str += bonus.GetStrength()
	agi += bonus.GetAgility()
	intel += bonus.GetIntellect()
	gearAP += bonus.GetAttackPower()
	spellPower += bonus.GetSpellPower()
	gearCrit += bonus.GetCritChance()
	gearSpellCrit += bonus.GetSpellCritChance()
	hitChance += bonus.GetHitChance()
	spellHit += bonus.GetSpellHitChance()
	if bonus.GetWeaponDps() != 0 {
		baseDPS += bonus.GetWeaponDps()
	}

	str += raid.str
	agi += raid.agi
	intel += raid.intel
	str *= raid.statMul
	agi *= raid.statMul
	intel *= raid.statMul
	spellPower += raid.spellPower
	hitChance += raid.hit
	spellHit += raid.spellHit
	gearCrit += raid.meleeCrit
	gearSpellCrit += raid.spellCrit

	ap := (gearAP + raid.ap + classAP + selfClassAP(player.GetClass(), ranks, player.GetRaidBuffs())) * raid.apMul
	if meleeAutos {
		ap += attackPowerFromStats(player.GetClass(), str, agi) * raid.apMul
		baseDPS += ap / 14
	} else {
		baseDPS = 0
		ap = 0
		ohWeapon = 0
	}

	meleeCrit := meleeCritChance(player.GetClass(), agi, gearCrit)
	spellCrit := baseSpellCrit(player.GetClass()) + spellCritFromInt(player.GetClass(), intel) + gearSpellCrit

	raceMul, raceHaste, raceCrit := racials(player.GetRace(), mainHandSubclass(player))
	baseDPS *= raceMul
	swingTimer *= raceHaste
	meleeCrit += raceCrit
	spellMul := 1.0
	if !meleeAutos {
		spellMul = raceMul
	}

	talents := map[int32]bool{}
	for _, pick := range player.GetTalents() {
		if pick.GetRank() > 0 {
			talents[pick.GetId()] = true
		}
	}
	talMul, talHaste, talCrit := applyTalents(player.GetClass(), player.GetTalents())
	baseDPS *= talMul
	swingTimer *= talHaste
	meleeCrit += talCrit
	spellCrit += talCrit
	if !meleeAutos {
		spellMul *= talMul
	}

	dwMul := 0.5
	dwRanks := talentRank(ranks, "Dual Wield Specialization")
	if dwRanks > 0 {
		dwMul *= 1 + 0.05*float64(dwRanks)
	}

	hasOH := meleeAutos && !mhTwoHand && ohWeapon > 0 && ohSpeed > 0
	ohDPS := 0.0
	if hasOH {
		ohDPS = (ohWeapon + ap/14) * raceMul * talMul * dwMul
		ohSpeed *= raceHaste * talHaste
	}

	if meleeCrit < 0 {
		meleeCrit = 0
	}
	if meleeCrit > 0.6 {
		meleeCrit = 0.6
	}
	if spellCrit < 0 {
		spellCrit = 0
	}
	if spellCrit > 0.6 {
		spellCrit = 0.6
	}
	if swingTimer < 0.8 {
		swingTimer = 0.8
	}
	if ohSpeed > 0 && ohSpeed < 0.8 {
		ohSpeed = 0.8
	}

	missYellow := missChance - hitChance
	missWhite := 0.08 - hitChance
	if hasOH {
		missWhite = 0.19 - hitChance
	}
	missSpell := baseSpellMiss - spellHit
	if missYellow < 0 {
		missYellow = 0
	}
	if missWhite < 0 {
		missWhite = 0
	}
	if missSpell < 0 {
		missSpell = 0
	}

	remainingArmor := bossArmor - raid.armorLost
	if remainingArmor < 0 {
		remainingArmor = 0
	}
	physMul := physicalTaken(remainingArmor) / physicalTaken(bossArmor)
	physMul *= raid.damageMul
	spellMul *= raid.damageMul

	var itemEffects []clientdata.ItemEffect
	for _, item := range player.GetGear().GetItems() {
		name := item.GetName()
		var existing []clientdata.ItemEffect
		if cat, ok := clientdata.ItemByID(item.GetId()); ok {
			existing = cat.Effects
			if name == "" {
				name = cat.Name
			}
		}
		for _, effect := range clientdata.ItemEffectsFor(name, existing) {
			if effect.Name == "" {
				effect.Name = name
			}
			itemEffects = append(itemEffects, effect)
		}
	}

	return combatKit{
		baseDPS:     baseDPS,
		swingTimer:  swingTimer,
		ohDPS:       ohDPS,
		ohTimer:     ohSpeed,
		crit:        meleeCrit,
		ap:          ap,
		spellPower:  spellPower,
		spellCrit:   spellCrit,
		spellMul:    spellMul,
		physMul:     physMul,
		fireMul:     raid.fireMul,
		frostMul:    raid.frostMul,
		shadowMul:   raid.shadowMul,
		natureMul:   raid.natureMul,
		holyMul:     raid.holyMul,
		missWhite:   missWhite,
		missYellow:  missYellow,
		missSpell:   missSpell,
		hasOH:       hasOH,
		meleeAutos:  meleeAutos,
		windfury:    raid.windfury,
		wfAP:        raid.wfAP,
		abilities:   clientdata.AbilitiesFor(int32(player.GetClass()), int32(player.GetRace()), talents),
		itemEffects: itemEffects,
		armorLost:   raid.armorLost,
		damageMul:   raid.damageMul,
	}
}

func mainHandSubclass(player *pb.Player) string {
	for _, item := range player.GetGear().GetItems() {
		if item.GetSlot() == pb.ItemSlot_ITEM_SLOT_MAIN_HAND {
			return item.GetItemSubclass()
		}
	}
	return ""
}

func racials(race pb.Race, subclass string) (damageMul, hasteMul, crit float64) {
	damageMul, hasteMul = 1, 1
	switch race {
	case pb.Race_RACE_ORC:
		if subclass == "Axe" {
			damageMul = 1.02
		}
	case pb.Race_RACE_HUMAN:
		if subclass == "Sword" || subclass == "Mace" {
			damageMul = 1.01
		}
	case pb.Race_RACE_DWARF:
		if subclass == "Mace" || subclass == "Gun" {
			damageMul = 1.01
		}
	case pb.Race_RACE_NIGHT_ELF:
		damageMul = 0.99
	case pb.Race_RACE_UNDEAD:
		damageMul = 1.01
	case pb.Race_RACE_GNOME:
		damageMul = 1.02
	case pb.Race_RACE_SKYBORNE:
		damageMul = 1.02
	}
	return damageMul, hasteMul, crit
}

func applyTalents(class pb.Class, picks []*pb.TalentPick) (damageMul, hasteMul, crit float64) {
	damageMul, hasteMul = 1, 1
	for _, pick := range picks {
		if pick.GetRank() <= 0 {
			continue
		}
		rank := float64(pick.GetRank())
		talent, ok := clientdata.TalentByID(pick.GetId())
		if !ok {
			continue
		}
		if class != pb.Class_CLASS_UNSPECIFIED && talent.Class != int32(class) {
			continue
		}
		effect := talent.Effect
		if effect.Utility || talentHandledLocally(pick.GetId()) {
			continue
		}
		if effect.Damage > 0 {
			damageMul *= 1 + effect.Damage*rank
		}
		crit += effect.Crit * rank
		if effect.Haste > 0 {
			hasteMul *= 1 - effect.Haste*rank
		}
	}
	return damageMul, hasteMul, crit
}

func roundPerIter(total int64, iterations int) int64 {
	if iterations <= 0 {
		return 0
	}
	n := int64(iterations)
	return (total + n/2) / n
}

func talentRankMap(picks []*pb.TalentPick) map[int32]int32 {
	ranks := map[int32]int32{}
	for _, pick := range picks {
		if pick.GetRank() > 0 {
			ranks[pick.GetId()] = pick.GetRank()
		}
	}
	return ranks
}

func seedOrDefault(seed int64) int64 {
	if seed == 0 {
		return 1
	}
	return seed
}

func classBaseline(class pb.Class) float64 {
	switch class {
	case pb.Class_CLASS_WARRIOR:
		return 12
	case pb.Class_CLASS_ROGUE:
		return 11
	case pb.Class_CLASS_HUNTER:
		return 11
	case pb.Class_CLASS_MAGE:
		return 10
	default:
		return 10
	}
}
