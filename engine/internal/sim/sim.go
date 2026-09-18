package sim

import (
	"math"
	"math/rand"
	"sort"
	"strings"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

// Run executes iterations of an APL-style combat model.
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
	kit := buildModel(player, req.GetEncounter())
	ranks := talentRankMap(player.GetTalents())

	totals := make(map[string]*actionAccum)
	var timeline []*pb.TimelineEvent
	var sum, sumSq float64
	minDPS, maxDPS := math.Inf(1), math.Inf(-1)
	samples := make([]float64, 0, iterations)

	for i := 0; i < iterations; i++ {
		dmg, events, stats := simulateFight(duration, kit, player.GetClass(), ranks, rng, i == 0 && player.GetName() != "-")
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
			tot.hitDmg += acc.hitDmg
			tot.critDmg += acc.critDmg
			tot.casts += acc.casts
			tot.crits += acc.crits
			tot.miss += acc.miss
		}
		dps := dmg / duration
		samples = append(samples, dps)
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
		avgCast := 0.0
		if acc.casts > 0 {
			avgCast = acc.dmg / float64(acc.casts)
		}
		actions = append(actions, &pb.ActionMetric{
			Name:    acc.name,
			Dps:     acc.dmg / dur / iter,
			Casts:   float64(acc.casts) / iter,
			Crits:   float64(acc.crits) / iter,
			Misses:  float64(acc.miss) / iter,
			Icon:    acc.icon,
			HitDps:  acc.hitDmg / dur / iter,
			CritDps: acc.critDmg / dur / iter,
			AvgCast: avgCast,
		})
	}
	sort.SliceStable(actions, func(i, j int) bool {
		return actions[i].Dps > actions[j].Dps
	})

	return &pb.SimResult{
		DpsMean:      mean,
		DpsStdev:     math.Sqrt(variance),
		DpsMin:       minDPS,
		DpsMax:       maxDPS,
		Iterations:   int32(iterations),
		Actions:      actions,
		Timeline:     timeline,
		IterationDps: samples,
	}
}

func buildModel(player *pb.Player, enc *pb.Encounter) combatKit {
	bossArmor := encounterArmor(enc)
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
	var mhBonusDmg, ohBonusDmg, gearHaste float64
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
		for _, effect := range resolvedItemEffects(item) {
			if effect.Kind == "use" && effect.SpellPower > 0 && effect.SpellPower == sp {
				sp = 0
				break
			}
		}
		spellPower += sp
		gearCrit += item.GetCritChance()
		gearSpellCrit += item.GetSpellCritChance()
		hitChance += item.GetHitChance()
		spellHit += item.GetSpellHitChance()
		if enc, ok := clientdata.EnchantByID(item.GetEnchantId()); ok {
			str += float64(enc.Strength)
			agi += float64(enc.Agility)
			intel += float64(enc.Intellect)
			gearAP += float64(enc.AttackPower)
			spellPower += float64(enc.SpellPower)
			gearCrit += enc.CritChance
			gearSpellCrit += enc.SpellCritChance
			hitChance += enc.HitChance
			spellHit += enc.SpellHitChance
			gearHaste += enc.Haste
			switch item.GetSlot() {
			case pb.ItemSlot_ITEM_SLOT_MAIN_HAND:
				mhBonusDmg += enc.WeaponDamage
			case pb.ItemSlot_ITEM_SLOT_OFF_HAND:
				ohBonusDmg += enc.WeaponDamage
			}
		}
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
			if item.GetWeaponDps() > 0 && item.GetItemSubclass() != "Shield" && item.GetHand() != "2h" {
				ohWeapon = item.GetWeaponDps()
				if item.GetAttackSpeedMs() > 0 {
					ohSpeed = float64(item.GetAttackSpeedMs()) / 1000
				}
			}
		}
	}

	var equippedIDs []int32
	namesByID := make(map[int32]string)
	for _, item := range player.GetGear().GetItems() {
		if item.GetId() == 0 {
			continue
		}
		equippedIDs = append(equippedIDs, item.GetId())
		if item.GetName() != "" {
			namesByID[item.GetId()] = item.GetName()
		}
	}
	for _, bonus := range clientdata.ActiveSetBonusesFor(equippedIDs, namesByID) {
		str += float64(bonus.Strength)
		agi += float64(bonus.Agility)
		intel += float64(bonus.Intellect)
		gearAP += float64(bonus.AttackPower)
		if player.GetClass() == pb.Class_CLASS_HUNTER {
			gearAP += float64(bonus.RangedAttackPower)
		}
		spellPower += float64(bonus.SpellPower)
		gearCrit += bonus.CritChance
		gearSpellCrit += bonus.SpellCritChance
		hitChance += bonus.HitChance
		spellHit += bonus.SpellHitChance
		gearHaste += bonus.Haste
	}

	mhTemp := weaponTempBuff(player.GetMhWeaponTemp())
	ohTemp := weaponTempBuff(player.GetOhWeaponTemp())
	mhBonusDmg += mhTemp.WeaponDamage
	spellPower += mhTemp.SpellPower
	gearSpellCrit += mhTemp.SpellCrit
	if !mhTwoHand && ohWeapon > 0 && ohSpeed > 0 {
		ohBonusDmg += ohTemp.WeaponDamage
		gearCrit += ohTemp.MeleeCrit
	}
	gearCrit += mhTemp.MeleeCrit

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
	g := collectGenericTalents(player.GetClass(), player.GetTalents())
	str *= g.strMul
	agi *= g.agiMul
	intel *= g.intMul
	spellPower += raid.spellPower
	hitChance += raid.hit
	spellHit += raid.spellHit
	gearCrit += raid.meleeCrit
	gearSpellCrit += raid.spellCrit

	ap := (gearAP + raid.ap + classAP + selfClassAP(player.GetClass(), ranks, player.GetRaidBuffs())) * raid.apMul
	if meleeAutos {
		ap += attackPowerFromStats(player.GetClass(), str, agi) * raid.apMul
		baseDPS += ap / 14
		bonusSwing := mhBonusDmg + raid.weaponDamage
		if bonusSwing > 0 && swingTimer > 0 {
			baseDPS += bonusSwing / swingTimer
		}
		if ohBonusDmg > 0 && ohSpeed > 0 {
			ohWeapon += ohBonusDmg / ohSpeed
		}
		if gearHaste > 0 {
			swingTimer *= 1 - gearHaste
			if ohSpeed > 0 {
				ohSpeed *= 1 - gearHaste
			}
		}
	} else {
		baseDPS = 0
		ap = 0
		ohWeapon = 0
	}

	meleeCrit := meleeCritChance(player.GetClass(), agi, gearCrit)
	spellCrit := baseSpellCrit(player.GetClass()) + spellCritFromInt(player.GetClass(), intel) + gearSpellCrit

	raceMul, raceHaste, raceCrit, raceHit := racials(player.GetRace(), equippedWeaponSubclasses(player))
	baseDPS *= raceMul
	swingTimer *= raceHaste
	meleeCrit += raceCrit
	spellCrit += raceCrit
	hitChance += raceHit
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
	w := warriorPassivesFor(player, ranks, mhTwoHand, mainHandSubclass(player), bossArmor)
	talMul := g.damageMul * w.damageMul
	talHaste := g.hasteMul
	hitChance += w.hit + g.hit
	spellHit += g.spellHit
	raid.armorLost += w.armorIgnore
	baseDPS *= talMul
	swingTimer *= talHaste
	meleeCrit += g.meleeCrit + w.crit
	spellCrit += g.spellCrit
	if !meleeAutos {
		spellMul *= talMul
	}
	weaponMul := g.weaponMul(mhTwoHand)

	dwMul := 0.5
	ohTalentDmg := g.ohDmg
	if ohTalentDmg == 0 {
		dwRanks := talentRank(ranks, "Dual Wield Specialization")
		if dwRanks > 0 {
			ohTalentDmg = 0.05 * float64(dwRanks)
		}
	}
	if ohTalentDmg > 0 {
		dwMul *= 1 + ohTalentDmg
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
	missWhite := 0.09 - hitChance
	if hasOH {
		missWhite = 0.28 - hitChance
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
	missOH := missWhite
	if hasOH {
		missOH = 0.28 - hitChance - w.ohHit
		if missOH < 0 {
			missOH = 0
		}
	}

	remainingArmor := bossArmor - raid.armorLost
	if remainingArmor < 0 {
		remainingArmor = 0
	}
	physMul := physicalTaken(remainingArmor) * raid.damageMul
	spellMul *= raid.damageMul

	var itemEffects []clientdata.ItemEffect
	for _, item := range player.GetGear().GetItems() {
		for _, effect := range resolvedItemEffects(item) {
			itemEffects = append(itemEffects, effect)
		}
	}
	if _, effect, ok := clientdata.CombatPotionEffect(player.GetCombatPotion()); ok {
		itemEffects = append(itemEffects, effect)
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
		fireMul:     raid.fireMul * g.fireMul,
		frostMul:    raid.frostMul * g.frostMul,
		shadowMul:   raid.shadowMul * g.shadowMul,
		natureMul:   raid.natureMul * g.natureMul,
		holyMul:     raid.holyMul * g.holyMul,
		arcaneMul:   g.arcaneMul,
		weaponMul:   weaponMul,
		abilityMul:  g.abilityMul,
		missWhite:   missWhite,
		missYellow:  missYellow,
		missSpell:   missSpell,
		hasOH:       hasOH,
		meleeAutos:  meleeAutos,
		windfury:    raid.windfury,
		wfAP:        raid.wfAP,
		abilities:   clientdata.AbilitiesFor(int32(player.GetClass()), int32(player.GetRace()), talents),
		itemEffects: itemEffects,
		abilityPrio: abilityPriorityMap(player.GetAbilityPriorities()),
		executePrio: abilityPriorityMap(player.GetExecuteAbilityPriorities()),
		armorLost:   raid.armorLost,
		damageMul:   raid.damageMul,
		maxRage:     w.maxRage,
		missOH:      missOH,
		ohRageMul:   w.ohRageMul,
		swordProc:   w.swordProc,
		mhTwoHand:   mhTwoHand,
		mainStance:  warriorMainStance(player),
		bossArmor:   bossArmor,
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

func equippedWeaponSubclasses(player *pb.Player) []string {
	var out []string
	for _, item := range player.GetGear().GetItems() {
		switch item.GetSlot() {
		case pb.ItemSlot_ITEM_SLOT_MAIN_HAND, pb.ItemSlot_ITEM_SLOT_OFF_HAND, pb.ItemSlot_ITEM_SLOT_RANGED:
			sub := item.GetItemSubclass()
			if sub != "" && sub != "Shield" {
				out = append(out, sub)
			}
		}
	}
	return out
}

func racials(race pb.Race, subclasses []string) (damageMul, hasteMul, crit, hit float64) {
	damageMul, hasteMul = 1, 1
	for _, racial := range clientdata.RacialsFor(int32(race)) {
		if !racial.Passive {
			continue
		}
		if racial.CritWhile > 0 {
			for _, sub := range subclasses {
				if weaponMatches(sub, racial.CritWhileWeapon) {
					crit += racial.CritWhile
					break
				}
			}
		}
		hit += racial.HitChance
		if racial.Haste > 0 {
			hasteMul *= 1 - racial.Haste
		}
	}
	return damageMul, hasteMul, crit, hit
}

func weaponMatches(subclass, kind string) bool {
	if subclass == "" || kind == "" {
		return false
	}
	return strings.Contains(strings.ToLower(subclass), strings.ToLower(kind))
}

func applyTalents(class pb.Class, picks []*pb.TalentPick) (damageMul, hasteMul, crit float64) {
	g := collectGenericTalents(class, picks)
	return g.damageMul, g.hasteMul, g.meleeCrit
}

func protoItemEffects(item *pb.EquippedItem) []clientdata.ItemEffect {
	if item == nil {
		return nil
	}
	out := make([]clientdata.ItemEffect, 0, len(item.GetEffects()))
	for _, effect := range item.GetEffects() {
		out = append(out, clientdata.ItemEffect{
			Kind:        effect.GetKind(),
			Name:        effect.GetName(),
			Text:        effect.GetText(),
			AttackPower: effect.GetAttackPower(),
			SpellPower:  effect.GetSpellPower(),
			Haste:       effect.GetHaste(),
			Crit:        effect.GetCrit(),
			Strength:    effect.GetStrength(),
			Agility:     effect.GetAgility(),
			ArmorIgnore: effect.GetArmorIgnore(),
			Rage:        effect.GetRage(),
			Duration:    effect.GetDuration(),
			Cooldown:    effect.GetCooldown(),
			Chance:      effect.GetChance(),
			ExtraAttack: effect.GetExtraAttack(),
			StackAP:     effect.GetStackAp(),
			Interval:    effect.GetInterval(),
			Icon:        effect.GetIcon(),
		})
	}
	return out
}

func resolvedItemEffects(item *pb.EquippedItem) []clientdata.ItemEffect {
	name := item.GetName()
	existing := protoItemEffects(item)
	if cat, ok := clientdata.ItemByID(item.GetId()); ok {
		if name == "" {
			name = cat.Name
		}
		if len(existing) == 0 {
			existing = cat.Effects
		}
	}
	effects := clientdata.ItemEffectsFor(name, existing)
	for i := range effects {
		if effects[i].Name == "" {
			effects[i].Name = name
		}
	}
	return effects
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
