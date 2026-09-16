package sim

import (
	"math"
	"math/rand"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

const (
	gcdDuration    = 1.5
	missChance     = 0.09
	iconAuto       = "inv_sword_04"
	iconOffHand    = "inv_weapon_shortblade_05"
	maxResource    = 100.0
	energyTickAmt  = 20.0
	energyTickBase = 2.0
	playerLevel    = 60.0
)

type actionAccum struct {
	name, icon         string
	dmg                float64
	casts, crits, miss int64
}

type combatBuff struct {
	id          string
	expire      float64
	dmg         float64
	haste       float64
	ap          float64
	crit        float64
	sp          float64
	str         float64
	armorIgnore float64
}

type fight struct {
	t, end, gcdReady, swingAt              float64
	swingTimer, baseDPS, crit, attackPower float64
	rng                                    *rand.Rand
	ohDPS, ohTimer, ohAt                   float64
	hasOH, meleeAutos                      bool
	spellPower, spellCrit, missSpell       float64
	spellMul                               float64
	missWhite, missYellow                  float64
	abilities                              []clientdata.Ability
	cds                                    map[string]float64
	buffs                                  []combatBuff
	combo                                  int
	overpowerUntil                         float64
	record                                 bool
	eventCap                               int
	events                                 []*pb.TimelineEvent
	stats                                  map[string]*actionAccum
	class                                  pb.Class
	ranks                                  map[int32]int32
	resourceKind                           string
	resource                               float64
	energyTickAt                           float64
	bloodrageLeft                          int
	bloodrageTickAt                        float64
	dots                                   []combatDot
	isbUntil                               float64
	physMul, fireMul, frostMul, shadowMul  float64
	natureMul, holyMul                     float64
	windfury                               bool
	wfAP                                   float64
	itemEffects                            []clientdata.ItemEffect
	itemReady                              map[string]float64
	armorLost, damageMul                   float64
}

type combatKit struct {
	baseDPS, swingTimer, ohDPS, ohTimer, crit, ap, missWhite, missYellow float64
	spellPower, spellCrit, missSpell, spellMul                           float64
	physMul, fireMul, frostMul, shadowMul, natureMul, holyMul            float64
	hasOH, meleeAutos, windfury                                          bool
	wfAP                                                                 float64
	abilities                                                            []clientdata.Ability
	itemEffects                                                          []clientdata.ItemEffect
	armorLost, damageMul                                                 float64
}

func simulateFight(duration float64, kit combatKit, class pb.Class, ranks map[int32]int32, rng *rand.Rand, record bool) (damage float64, events []*pb.TimelineEvent, stats map[string]*actionAccum) {
	if ranks == nil {
		ranks = map[int32]int32{}
	}
	if kit.physMul == 0 {
		kit.physMul = 1
	}
	if kit.fireMul == 0 {
		kit.fireMul = 1
	}
	if kit.frostMul == 0 {
		kit.frostMul = 1
	}
	if kit.shadowMul == 0 {
		kit.shadowMul = 1
	}
	if kit.natureMul == 0 {
		kit.natureMul = 1
	}
	if kit.damageMul == 0 {
		kit.damageMul = 1
	}
	f := &fight{
		end:          duration,
		swingTimer:   kit.swingTimer,
		baseDPS:      kit.baseDPS,
		crit:         kit.crit,
		attackPower:  kit.ap,
		ohDPS:        kit.ohDPS,
		ohTimer:      kit.ohTimer,
		hasOH:        kit.hasOH && kit.meleeAutos,
		meleeAutos:   kit.meleeAutos,
		spellPower:   kit.spellPower,
		spellCrit:    kit.spellCrit,
		missSpell:    kit.missSpell,
		spellMul:     kit.spellMul,
		physMul:      kit.physMul,
		fireMul:      kit.fireMul,
		frostMul:     kit.frostMul,
		shadowMul:    kit.shadowMul,
		natureMul:    kit.natureMul,
		holyMul:      kit.holyMul,
		windfury:     kit.windfury && kit.meleeAutos,
		wfAP:         kit.wfAP,
		itemEffects:  kit.itemEffects,
		itemReady:    map[string]float64{},
		armorLost:    kit.armorLost,
		damageMul:    kit.damageMul,
		missWhite:    kit.missWhite,
		missYellow:   kit.missYellow,
		rng:          rng,
		abilities:    applyResourceTalents(kit.abilities, ranks),
		cds:          make(map[string]float64, len(kit.abilities)),
		record:       record,
		eventCap:     timelineLimit(duration),
		stats:        make(map[string]*actionAccum),
		class:        class,
		ranks:        ranks,
		resourceKind: resourceKindFor(class, ranks),
	}
	switch f.resourceKind {
	case "rage":
		f.resource = 0
	case "energy":
		f.resource = maxResource
		f.energyTickAt = energyTickBase
	}
	if f.meleeAutos {
		f.swingAt = 0
	} else {
		f.swingAt = f.end + 3600
		f.hasOH = false
	}
	if f.hasOH && f.ohTimer > 0 {
		f.ohAt = 0
	} else {
		f.hasOH = false
	}
	f.applyPullBuffs()
	for steps := 0; f.t < f.end-1e-9 && steps < 200000; steps++ {
		f.tickResources()
		f.tickDots()
		f.useOffGCD()
		atSwing := math.Abs(f.t-f.swingAt) < 1e-9 || f.t >= f.swingAt-1e-12
		atOH := f.hasOH && (math.Abs(f.t-f.ohAt) < 1e-9 || f.t >= f.ohAt-1e-12)
		atGCD := math.Abs(f.t-f.gcdReady) < 1e-9 || f.t >= f.gcdReady-1e-12
		if f.meleeAutos && atSwing {
			f.autoAttack()
			f.swingAt = f.t + f.swingTimer*f.hasteMul()
		}
		if atOH {
			f.offHandAttack()
			f.ohAt = f.t + f.ohTimer*f.hasteMul()
		}
		if atGCD {
			if ab := f.pickGCD(); ab != nil {
				f.cast(*ab)
				if ab.GCD {
					wait := gcdDuration
					if ct := defaultCastTime(*ab); ct > wait {
						wait = ct
					}
					f.gcdReady = f.t + wait
				}
			} else {
				f.gcdReady = f.nextGCDReady()
			}
		}
		next := f.end
		if f.meleeAutos && f.swingAt < next {
			next = f.swingAt
		}
		if f.hasOH && f.ohAt < next {
			next = f.ohAt
		}
		if f.gcdReady < next {
			next = f.gcdReady
		}
		if t := f.nextResourceEvent(); t < next {
			next = t
		}
		if t := f.nextDotEvent(); t < next {
			next = t
		}
		if next <= f.t {
			next = f.t + 0.01
		}
		f.t = next
	}
	return f.totalDamage(), f.events, f.stats
}

func resourceKindFor(class pb.Class, ranks map[int32]int32) string {
	switch class {
	case pb.Class_CLASS_WARRIOR:
		return "rage"
	case pb.Class_CLASS_ROGUE:
		return "energy"
	case pb.Class_CLASS_DRUID:
		if talentAny(ranks, "Feral Instinct", "Predatory Strikes", "Savage Fury", "Feral Charge", "Leader of the Pack") {
			return "energy"
		}
		return ""
	default:
		return ""
	}
}

func applyResourceTalents(abilities []clientdata.Ability, ranks map[int32]int32) []clientdata.Ability {
	out := make([]clientdata.Ability, 0, len(abilities))
	impHS := float64(talentRank(ranks, "Improved Heroic Strike"))
	impCharge := float64(talentRank(ranks, "Improved Charge"))
	impSS := float64(talentRank(ranks, "Improved Sinister Strike"))
	hasCommand := talentAny(ranks, "Seal of Command")
	frostMage := talentAny(ranks, "Winter's Chill", "Improved Frostbolt", "Ice Shards")
	fireMage := talentAny(ranks, "Ignite", "Pyroblast", "Combustion")
	moonkin := talentAny(ranks, "Moonkin Form")
	for _, ab := range abilities {
		if hasCommand && ab.ID == "seal-of-the-crusader" {
			continue
		}
		if moonkin && (ab.ID == "shred" || ab.ID == "ferocious-bite" || ab.ID == "tigers-fury") {
			continue
		}
		switch ab.ID {
		case "heroic-strike":
			ab.Cost -= impHS
			if ab.Cost < 1 {
				ab.Cost = 1
			}
		case "charge":
			ab.Gain += 5 * impCharge
		case "sinister-strike":
			ab.Cost -= 5 * impSS
			if ab.Cost < 1 {
				ab.Cost = 1
			}
		case "frostbolt":
			if frostMage {
				ab.Priority = 615
			}
		case "corruption":
			ab.CastTime -= 0.4 * float64(talentRank(ranks, "Improved Corruption"))
			if ab.CastTime < 0 {
				ab.CastTime = 0
			}
		case "fireball":
			if fireMage {
				ab.Priority = 615
			}
		case "starfire":
			if moonkin {
				ab.Priority = 640
			}
		}
		out = append(out, ab)
	}
	sortAbilities(out)
	return out
}

func sortAbilities(out []clientdata.Ability) {
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].Priority > out[i].Priority {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
}

func rageConversion() float64 {
	lvl := playerLevel
	return 0.0091107836*lvl*lvl + 3.225598133*lvl + 4.2652911
}

func (f *fight) totalDamage() float64 {
	var sum float64
	for _, a := range f.stats {
		sum += a.dmg
	}
	return sum
}

func (f *fight) hasteMul() float64 {
	m := 1.0
	for _, b := range f.buffs {
		if f.t < b.expire {
			m *= 1 - b.haste
		}
	}
	if m < 0.5 {
		return 0.5
	}
	return m
}

func (f *fight) dmgMul() float64 {
	m := 1.0
	for _, b := range f.buffs {
		if f.t < b.expire {
			m *= 1 + b.dmg
		}
	}
	return m
}

func (f *fight) critChance() float64 {
	c := f.crit
	for _, b := range f.buffs {
		if f.t < b.expire {
			c += b.crit
		}
	}
	if c > 0.95 {
		return 0.95
	}
	return c
}

func (f *fight) currentAP() float64 {
	ap := f.attackPower
	var extraStr float64
	for _, b := range f.buffs {
		if f.t < b.expire {
			ap += b.ap
			extraStr += b.str
		}
	}
	if extraStr != 0 {
		ap += meleeAPFromStats(f.class, extraStr, 0)
	}
	return ap
}

func (f *fight) extraAP() float64 {
	return f.currentAP() - f.attackPower
}

func (f *fight) currentSP() float64 {
	sp := f.spellPower
	for _, b := range f.buffs {
		if f.t < b.expire {
			sp += b.sp
		}
	}
	return sp
}

func (f *fight) physicalMul() float64 {
	ignore := 0.0
	for _, b := range f.buffs {
		if f.t < b.expire {
			ignore += b.armorIgnore
		}
	}
	remain := bossArmor - f.armorLost - ignore
	if remain < 0 {
		remain = 0
	}
	m := physicalTaken(remain) / physicalTaken(bossArmor)
	if f.damageMul > 0 {
		m *= f.damageMul
	}
	return m
}

func (f *fight) mhSwing() float64 {
	return (f.baseDPS + f.extraAP()/14) * f.swingTimer
}

func (f *fight) abilityDamage(ab clientdata.Ability, extraRage float64) float64 {
	dmg := ab.DamageFlat
	if ab.DamageWeapon > 0 {
		dmg += f.mhSwing() * ab.DamageWeapon
	}
	if ab.DamageAP > 0 {
		dmg += f.currentAP() * ab.DamageAP
	}
	if coeff := spellCoefficient(ab); coeff > 0 {
		dmg += f.currentSP() * coeff
	}
	if extraRage > 0 && ab.DumpRagePer > 0 {
		dmg += extraRage * ab.DumpRagePer
	}
	if dmg == 0 && ab.Damage > 0 {
		dmg = f.baseDPS * gcdDuration * ab.Damage
		if extraRage > 0 {
			dmg *= 1 + extraRage/25
		}
	}
	return dmg
}

func (f *fight) energyInterval() float64 {
	if f.buffActive("adrenaline-rush") {
		return 1.0
	}
	return energyTickBase
}

func (f *fight) addResource(amount float64) {
	if f.resourceKind == "" || amount == 0 {
		return
	}
	f.resource += amount
	if f.resource > maxResource {
		f.resource = maxResource
	}
	if f.resource < 0 {
		f.resource = 0
	}
}

func (f *fight) canPay(ab clientdata.Ability) bool {
	if ab.Resource == "" || ab.Cost <= 0 {
		return true
	}
	if ab.Resource != f.resourceKind {
		return true
	}
	return f.resource+1e-9 >= ab.Cost
}

func (f *fight) pay(ab clientdata.Ability) {
	if ab.Resource == f.resourceKind && ab.Cost > 0 {
		f.addResource(-ab.Cost)
	}
	if ab.Gain > 0 && (ab.Resource == f.resourceKind || ab.Resource == "") {
		f.addResource(ab.Gain)
	}
}

func (f *fight) ready(ab clientdata.Ability) bool {
	return f.t+1e-9 >= f.cds[ab.ID]
}

func (f *fight) buffActive(id string) bool {
	for _, b := range f.buffs {
		if b.id == id && f.t < b.expire {
			return true
		}
	}
	return false
}

func (f *fight) tickResources() {
	if f.resourceKind == "energy" {
		for f.energyTickAt <= f.t+1e-9 && f.t < f.end {
			f.addResource(energyTickAmt)
			f.energyTickAt += f.energyInterval()
		}
	}
	for f.bloodrageLeft > 0 && f.bloodrageTickAt <= f.t+1e-9 {
		f.addResource(1)
		f.bloodrageLeft--
		f.bloodrageTickAt += 1
	}
}

func (f *fight) nextResourceEvent() float64 {
	next := f.end
	if f.resourceKind == "energy" && f.energyTickAt < next {
		next = f.energyTickAt
	}
	if f.bloodrageLeft > 0 && f.bloodrageTickAt < next {
		next = f.bloodrageTickAt
	}
	return next
}

func (f *fight) targetHealth() float64 {
	if f.end <= 0 {
		return 1
	}
	hp := 1 - f.t/f.end
	if hp < 0 {
		return 0
	}
	return hp
}

func (f *fight) phaseOK(ab clientdata.Ability) bool {
	hp := f.targetHealth()
	if ab.HealthBelow > 0 && hp > ab.HealthBelow {
		return false
	}
	if ab.HealthAbove > 0 && hp <= ab.HealthAbove {
		return false
	}
	return true
}

func raidCatalogAbility(id string) bool {
	switch id {
	case "battle-shout", "hunters-mark", "faerie-fire":
		return true
	}
	return false
}

func (f *fight) applyPullBuffs() {
	hasCommand := false
	for _, ab := range f.abilities {
		if ab.ID == "seal-of-command" {
			hasCommand = true
			break
		}
	}
	for _, ab := range f.abilities {
		if !ab.SkipRotation || raidCatalogAbility(ab.ID) {
			continue
		}
		if ab.ID == "seal-of-the-crusader" && hasCommand {
			continue
		}
		if ab.BuffDamage == 0 && ab.BuffHaste == 0 && ab.BuffAP == 0 && ab.BuffCrit == 0 {
			continue
		}
		f.buffs = append(f.buffs, combatBuff{
			id:     ab.ID,
			expire: f.end + 3600,
			dmg:    ab.BuffDamage,
			haste:  ab.BuffHaste,
			ap:     ab.BuffAP,
			crit:   ab.BuffCrit,
		})
	}
}

func (f *fight) usable(ab clientdata.Ability) bool {
	if ab.SkipRotation {
		return false
	}
	if !f.phaseOK(ab) {
		return false
	}
	if ab.Kind == "opener" && ab.ID == "pyroblast" && f.t > 0.05 {
		return false
	}
	if ab.Duration > 0 {
		if isDotAbility(ab) {
			if f.dotActive(ab.ID) {
				return false
			}
		} else if f.buffActive(ab.ID) {
			return false
		}
	}
	if ab.ComboMin > 0 && f.combo < ab.ComboMin {
		return false
	}
	if ab.ComboGen > 0 && f.combo >= 5 {
		return false
	}
	if ab.RequiresProc == "overpower" && f.t > f.overpowerUntil {
		return false
	}
	return true
}

func (f *fight) useOffGCD() {
	for i := range f.abilities {
		ab := f.abilities[i]
		if ab.GCD || !f.ready(ab) || !f.canPay(ab) {
			continue
		}
		if f.starvesHigher(ab) {
			continue
		}
		if ab.Kind != "buff" && ab.Kind != "opener" {
			continue
		}
		if !f.usable(ab) {
			continue
		}
		if ab.Kind == "buff" && f.buffActive(ab.ID) {
			continue
		}
		f.cast(ab)
	}
	f.useItems()
}

func (f *fight) useItems() {
	for _, effect := range f.itemEffects {
		if effect.Kind != "use" {
			continue
		}
		name := effect.Name
		if name == "" {
			name = effect.Text
		}
		if f.t < f.itemReady[name] {
			continue
		}
		if effect.Duration > 0 && f.buffActive(name) {
			continue
		}
		cd := effect.Cooldown
		if cd <= 0 {
			cd = 120
		}
		f.itemReady[name] = f.t + cd
		if f.record {
			logRotation(f.t, name, "use", effect.Cooldown)
		}
		ap := effect.AttackPower
		if effect.StackAP > 0 && effect.Interval > 0 && effect.Duration > 0 {
			n := effect.Duration / effect.Interval
			ap = effect.StackAP * (n + 1) / 2
		}
		f.buffs = append(f.buffs, combatBuff{
			id:          name,
			expire:      f.t + math.Max(effect.Duration, 0.1),
			ap:          ap,
			sp:          effect.SpellPower,
			haste:       effect.Haste,
			crit:        effect.Crit,
			str:         effect.Strength,
			armorIgnore: effect.ArmorIgnore,
		})
	}
}

func (f *fight) pickGCD() *clientdata.Ability {
	for i := range f.abilities {
		ab := &f.abilities[i]
		if !ab.GCD || ab.Kind == "queue" || !f.ready(*ab) || !f.canPay(*ab) {
			continue
		}
		if f.starvesHigher(*ab) {
			continue
		}
		if !f.usable(*ab) {
			continue
		}
		return ab
	}
	return nil
}

func (f *fight) nextGCDReady() float64 {
	next := f.end
	for _, ab := range f.abilities {
		if !ab.GCD || ab.Kind == "queue" || ab.SkipRotation {
			continue
		}
		if !f.phaseOK(ab) {
			continue
		}
		if ab.RequiresProc == "overpower" && f.t > f.overpowerUntil {
			continue
		}
		if ab.ComboMin > 0 && f.combo < ab.ComboMin {
			continue
		}
		readyAt := f.cds[ab.ID]
		if readyAt < f.t {
			readyAt = f.t
		}
		if ab.Duration > 0 && isDotAbility(ab) && f.dotActive(ab.ID) {
			for _, d := range f.dots {
				if d.id == ab.ID && d.expire < next && d.expire > f.t {
					next = d.expire
				}
			}
			continue
		}
		if ab.Duration > 0 && f.buffActive(ab.ID) {
			for _, b := range f.buffs {
				if b.id == ab.ID && b.expire < next && b.expire > f.t {
					next = b.expire
				}
			}
			continue
		}
		if ab.Cost > 0 && ab.Resource == f.resourceKind && f.resource+1e-9 < ab.Cost {
			wait := f.waitForResource(ab.Cost)
			if wait > readyAt {
				readyAt = wait
			}
		}
		if readyAt < next {
			next = readyAt
		}
	}
	if next <= f.t {
		return f.t + 0.05
	}
	return next
}

func (f *fight) waitForResource(need float64) float64 {
	if f.resourceKind == "energy" {
		missing := need - f.resource
		if missing <= 0 {
			return f.t
		}
		ticks := math.Ceil(missing / energyTickAmt)
		return f.energyTickAt + (ticks-1)*f.energyInterval()
	}
	if f.resourceKind == "rage" {
		return f.swingAt
	}
	return f.t
}

func (f *fight) queueAbility() *clientdata.Ability {
	for i := range f.abilities {
		ab := &f.abilities[i]
		if ab.Kind != "queue" {
			continue
		}
		if !f.phaseOK(*ab) || !f.canPay(*ab) {
			continue
		}
		if ab.DumpAbove > 0 && f.resource < ab.DumpAbove {
			return nil
		}
		if f.resource-ab.Cost+1e-9 < f.rageReserve() {
			return nil
		}
		return ab
	}
	return nil
}

func (f *fight) rageReserve() float64 {
	if f.resourceKind != "rage" {
		return 0
	}
	var need float64
	for _, ab := range f.abilities {
		if ab.Kind != "strike" || ab.Resource != "rage" || ab.Cost <= 0 {
			continue
		}
		if !f.phaseOK(ab) {
			continue
		}
		if f.cds[ab.ID] <= f.t+gcdDuration {
			if ab.Cost > need {
				need = ab.Cost
			}
		}
	}
	return need
}

func (f *fight) starvesHigher(ab clientdata.Ability) bool {
	if ab.Cost <= 0 || ab.Resource == "" || ab.Resource != f.resourceKind {
		return false
	}
	for _, other := range f.abilities {
		if other.Priority <= ab.Priority || other.Cost <= 0 {
			continue
		}
		if other.Resource != ab.Resource {
			continue
		}
		if other.Kind != "strike" && other.Kind != "buff" {
			continue
		}
		if f.cds[other.ID] > f.t+gcdDuration {
			continue
		}
		if !f.phaseOK(other) {
			continue
		}
		if f.resource-ab.Cost+1e-9 < other.Cost {
			return true
		}
	}
	return false
}

func (f *fight) autoAttack() {
	white := f.mhSwing()
	hs := f.queueAbility()
	if hs != nil {
		f.pay(*hs)
		bonus := hs.DamageFlat
		if bonus == 0 && hs.Damage > 0 {
			bonus = white * hs.Damage
		}
		dmg, crit, miss := f.roll(white+bonus, true, false, f.critMultiplier(*hs, false, true))
		f.recordHit(hs.Name, hs.Icon, dmg, crit, miss)
		if !miss {
			f.onPhysicalHit(crit, false)
			f.maybeWindfury()
		}
		return
	}
	dmg, crit, miss := f.roll(white, false, false, 2)
	if !miss && f.rng.Float64() < 0.056 {
		dmg = 0
		crit = false
		miss = true
		f.overpowerUntil = f.t + 5
	}
	f.recordHit("Auto Attack", iconAuto, dmg, crit, miss)
	if !miss {
		f.onPhysicalHit(crit, false)
		f.maybeWindfury()
	}
	if f.resourceKind == "rage" && !miss {
		f.addResource(rageFromWhite(dmg, f.swingTimer, crit))
		uw := f.named("Unbridled Wrath")
		if uw > 0 && f.rng.Float64() < 0.08*float64(uw) {
			f.addResource(1)
		}
	}
}

func (f *fight) offHandAttack() {
	white := f.ohDPS * f.ohTimer
	dmg, crit, miss := f.roll(white, false, false, 2)
	f.recordHit("Off-Hand", iconOffHand, dmg, crit, miss)
	if !miss {
		f.onPhysicalHit(crit, true)
	}
	if f.resourceKind == "rage" && !miss {
		f.addResource(rageFromWhite(dmg, f.ohTimer, crit))
		uw := f.named("Unbridled Wrath")
		if uw > 0 && f.rng.Float64() < 0.08*float64(uw) {
			f.addResource(1)
		}
	}
}

func (f *fight) maybeWindfury() {
	if !f.windfury || f.rng.Float64() >= windfuryChance {
		return
	}
	raw := f.mhSwing() + (f.wfAP/14)*f.swingTimer
	for i := 0; i < 2; i++ {
		dmg, crit, miss := f.roll(raw, false, false, 2)
		f.recordHit("Windfury", iconWindfury, dmg, crit, miss)
		if !miss {
			f.onPhysicalHit(crit, false)
		}
	}
}

func rageFromWhite(damage, speed float64, crit bool) float64 {
	c := rageConversion()
	f := 3.5
	if crit {
		f = 7.0
	}
	rage := 15*damage/(4*c) + f*speed/2
	cap := 15 * damage / c
	if rage > cap {
		rage = cap
	}
	if rage < 0 {
		rage = 0
	}
	return rage
}

func (f *fight) cast(ab clientdata.Ability) {
	if f.record {
		logRotation(f.t, ab.Name, f.resourceKind, f.resource)
	}
	cd := ab.Cooldown
	if cd <= 0 {
		cd = gcdDuration
	}
	f.cds[ab.ID] = f.t + cd
	f.pay(ab)
	if ab.RequiresProc == "overpower" {
		f.overpowerUntil = 0
	}
	extraRage := 0.0
	if ab.DumpRage {
		extraRage = f.resource
		f.resource = 0
	}
	if ab.ID == "bloodrage" {
		f.bloodrageLeft = 10
		f.bloodrageTickAt = f.t + 1
	}
	combo := f.combo
	dur := ab.Duration
	if ab.ComboDurationPer > 0 {
		dur = ab.ComboDurationBase + ab.ComboDurationPer*float64(f.combo)
	}
	if dur > 0 && !isDotAbility(ab) {
		f.buffs = append(f.buffs, combatBuff{
			id:     ab.ID,
			expire: f.t + dur,
			dmg:    ab.BuffDamage,
			haste:  ab.BuffHaste,
			ap:     ab.BuffAP,
			crit:   ab.BuffCrit,
		})
	}
	if ab.ComboGen > 0 {
		f.combo += ab.ComboGen
		if f.combo > 5 {
			f.combo = 5
		}
	}
	if ab.ConsumeCombo {
		f.combo = 0
	}
	if isDotAbility(ab) {
		spec := abilityDots[ab.ID]
		crit, miss := f.hitCheck(true, spec.spell)
		if miss {
			f.recordHit(ab.Name, ab.Icon, 0, false, true)
			return
		}
		direct, _ := f.applyAbilityDot(ab, combo)
		if direct > 0 {
			raw := direct * f.talentMul(ab.ID)
			dmg := raw * f.dmgMul()
			if spec.spell {
				if f.spellMul > 0 {
					dmg *= f.spellMul
				}
				dmg *= f.schoolTaken(ab.ID)
			} else if mul := f.physicalMul(); mul > 0 {
				dmg *= mul
			}
			if crit {
				dmg *= f.critMultiplier(ab, spec.spell, true)
			}
			f.recordHit(ab.Name, ab.Icon, dmg, crit, false)
			if !spec.spell {
				f.onPhysicalHit(crit, false)
			}
			f.maybeImprovedShadowBolt(ab, crit)
		}
		return
	}
	raw := f.abilityDamage(ab, extraRage) * f.talentMul(ab.ID)
	if raw <= 0 {
		f.recordHit(ab.Name, ab.Icon, 0, false, false)
		return
	}
	spell := isSpellAbility(ab)
	if spell {
		raw *= f.schoolTaken(ab.ID)
	}
	dmg, crit, miss := f.roll(raw, true, spell, f.critMultiplier(ab, spell, true))
	f.recordHit(ab.Name, ab.Icon, dmg, crit, miss)
	if !miss && !spell {
		f.onPhysicalHit(crit, false)
	}
	f.maybeImprovedShadowBolt(ab, crit)
}

func (f *fight) hitCheck(yellow, spell bool) (crit, miss bool) {
	missP := f.missWhite
	if spell {
		missP = f.missSpell
	} else if yellow {
		missP = f.missYellow
	}
	if missP < 0 {
		missP = 0
	}
	if f.rng.Float64() < missP {
		return false, true
	}
	critP := f.critChance()
	if spell {
		critP = f.spellCritChance()
	}
	if f.rng.Float64() < critP {
		return true, false
	}
	return false, false
}

func (f *fight) roll(raw float64, yellow, spell bool, critMul float64) (dmg float64, crit, miss bool) {
	crit, miss = f.hitCheck(yellow, spell)
	if miss {
		return 0, false, true
	}
	dmg = raw * f.dmgMul()
	if spell {
		if f.spellMul > 0 {
			dmg *= f.spellMul
		}
	} else if mul := f.physicalMul(); mul > 0 {
		dmg *= mul
	}
	if crit {
		if critMul <= 0 {
			critMul = 2
		}
		return dmg * critMul, true, false
	}
	return dmg, false, false
}

func (f *fight) schoolTaken(id string) float64 {
	m := 1.0
	switch spellSchool(id) {
	case "fire":
		m = f.fireMul
	case "frost":
		m = f.frostMul
	case "shadow":
		m = f.shadowMul
	case "nature":
		m = f.natureMul
	case "holy":
		m = f.holyMul
	}
	if m == 0 {
		return 1
	}
	return m
}

func (f *fight) spellCritChance() float64 {
	c := f.spellCrit
	for _, b := range f.buffs {
		if f.t < b.expire {
			c += b.crit
		}
	}
	if c > 0.95 {
		return 0.95
	}
	return c
}

func (f *fight) procItems() {
	for _, effect := range f.itemEffects {
		if effect.Kind != "proc" {
			continue
		}
		chance := effect.Chance
		if chance <= 0 {
			chance = 0.02
		}
		if f.rng.Float64() >= chance {
			continue
		}
		name := effect.Name
		if name == "" {
			name = "Item Proc"
		}
		if effect.ExtraAttack > 0 {
			raw := f.mhSwing()
			n := int(effect.ExtraAttack)
			if n < 1 {
				n = 1
			}
			for i := 0; i < n; i++ {
				dmg, crit, miss := f.roll(raw, false, false, 2)
				f.recordHit(name, "", dmg, crit, miss)
			}
		}
		if effect.AttackPower > 0 && effect.Duration > 0 {
			f.buffs = append(f.buffs, combatBuff{
				id:     name,
				expire: f.t + effect.Duration,
				ap:     effect.AttackPower,
			})
		}
	}
}

func (f *fight) recordHit(name, icon string, dmg float64, crit, miss bool) {
	acc := f.stats[name]
	if acc == nil {
		acc = &actionAccum{name: name, icon: icon}
		f.stats[name] = acc
	}
	acc.casts++
	acc.dmg += dmg
	if miss {
		acc.miss++
	} else if crit {
		acc.crits++
	}
	if f.record && len(f.events) < f.eventCap {
		f.events = append(f.events, &pb.TimelineEvent{
			TimeSeconds: f.t,
			Name:        name,
			Damage:      dmg,
			Crit:        crit,
			Miss:        miss,
			Icon:        icon,
		})
	}
}

func timelineLimit(duration float64) int {
	n := int(duration*50) + 200
	if n < 800 {
		n = 800
	}
	if n > 25000 {
		n = 25000
	}
	return n
}
