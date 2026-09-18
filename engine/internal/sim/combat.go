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
	comboSpendAt   = 5
)

type actionAccum struct {
	name, icon           string
	dmg, hitDmg, critDmg float64
	casts, crits, miss   int64
}

type combatBuff struct {
	id, name, icon                                  string
	expire                                          float64
	dmg, haste, ap, crit, sp, str, agi, armorIgnore float64
}

type pendingCast struct {
	ab        clientdata.Ability
	extraRage float64
	combo     int
	landAt    float64
}

type fight struct {
	t, end, gcdReady, swingAt              float64
	swingLockUntil                         float64
	pending                                pendingCast
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
	stealthed                              bool
	record                                 bool
	eventCap                               int
	events                                 []*pb.TimelineEvent
	stats                                  map[string]*actionAccum
	class                                  pb.Class
	ranks                                  map[int32]int32
	namedMemo                              map[string]int32
	resourceKind                           string
	resource                               float64
	energyTickAt                           float64
	bloodrageLeft                          int
	bloodrageTickAt                        float64
	dots                                   []combatDot
	isbUntil                               float64
	physMul, fireMul, frostMul, shadowMul  float64
	natureMul, holyMul, arcaneMul          float64
	weaponMul                              float64
	abilityMul                             map[string]float64
	windfury                               bool
	wfAP                                   float64
	itemEffects                            []clientdata.ItemEffect
	itemReady                              map[string]float64
	abilityPrio                            map[string]int
	executePrio                            map[string]int
	executeAbs                             []clientdata.Ability
	armorLost, damageMul                   float64
	maxRage, missOH, ohRageMul, swordProc  float64
	mhTwoHand                              bool
	flurryLeft                             int
	angerAt, enrageAt                      float64
	pendingCritBonus                       float64
	useOHMiss                              bool
	mainStance, stance                     string
	bossArmor                              float64
}

type combatKit struct {
	baseDPS, swingTimer, ohDPS, ohTimer, crit, ap, missWhite, missYellow float64
	spellPower, spellCrit, missSpell, spellMul                           float64
	physMul, fireMul, frostMul, shadowMul, natureMul, holyMul, arcaneMul float64
	weaponMul                                                            float64
	abilityMul                                                           map[string]float64
	hasOH, meleeAutos, windfury                                          bool
	wfAP                                                                 float64
	abilities                                                            []clientdata.Ability
	itemEffects                                                          []clientdata.ItemEffect
	abilityPrio                                                          map[string]int
	executePrio                                                          map[string]int
	armorLost, damageMul                                                 float64
	maxRage, missOH, ohRageMul, swordProc                                float64
	mhTwoHand                                                            bool
	mainStance                                                           string
	bossArmor                                                            float64
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
	if kit.weaponMul == 0 {
		kit.weaponMul = 1
	}
	if kit.arcaneMul == 0 {
		kit.arcaneMul = 1
	}
	if kit.holyMul == 0 {
		kit.holyMul = 1
	}
	if kit.abilityMul == nil {
		kit.abilityMul = map[string]float64{}
	}
	baseAbs := applyResourceTalents(kit.abilities, ranks)
	var executeAbs []clientdata.Ability
	if len(kit.executePrio) > 0 {
		executeAbs = applyAbilityPriorities(baseAbs, kit.executePrio)
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
		arcaneMul:    kit.arcaneMul,
		weaponMul:    kit.weaponMul,
		abilityMul:   kit.abilityMul,
		windfury:     kit.windfury && kit.meleeAutos,
		wfAP:         kit.wfAP,
		itemEffects:  kit.itemEffects,
		itemReady:    map[string]float64{},
		abilityPrio:  kit.abilityPrio,
		executePrio:  kit.executePrio,
		armorLost:    kit.armorLost,
		damageMul:    kit.damageMul,
		missWhite:    kit.missWhite,
		missYellow:   kit.missYellow,
		maxRage:      kit.maxRage,
		missOH:       kit.missOH,
		ohRageMul:    kit.ohRageMul,
		swordProc:    kit.swordProc,
		mhTwoHand:    kit.mhTwoHand,
		rng:          rng,
		abilities:    applyAbilityPriorities(baseAbs, kit.abilityPrio),
		executeAbs:   executeAbs,
		cds:          make(map[string]float64, len(kit.abilities)),
		record:       record,
		eventCap:     timelineLimit(duration),
		stats:        make(map[string]*actionAccum),
		class:        class,
		ranks:        ranks,
		namedMemo:    map[string]int32{},
		resourceKind: resourceKindFor(class, ranks),
		mainStance:   kit.mainStance,
		stance:       kit.mainStance,
		bossArmor:    kit.bossArmor,
	}
	if f.bossArmor <= 0 {
		f.bossArmor = defaultBossArmor
	}
	switch f.resourceKind {
	case "rage":
		f.resource = 0
	case "energy":
		f.resource = maxResource
		f.energyTickAt = energyTickBase
	}
	if f.ohRageMul <= 0 {
		f.ohRageMul = 1
	}
	if f.maxRage <= 0 {
		f.maxRage = maxResource
	}
	if f.class == pb.Class_CLASS_WARRIOR {
		f.angerAt = 3
		f.enrageAt = bossSwingInterval
	}
	if f.class == pb.Class_CLASS_ROGUE {
		f.stealthed = true
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
	f.openStanceAura()
	if f.stealthed && !f.stealthOpenerInRotation() {
		f.breakStealth()
	}
	for steps := 0; f.t < f.end-1e-9 && steps < 200000; steps++ {
		f.tickResources()
		f.tickWarrior()
		f.tickDots()
		f.finishPendingCast()
		casting := f.isCasting()
		if !casting {
			f.useOffGCD()
		}
		meleeLocked := f.meleeLocked()
		atSwing := math.Abs(f.t-f.swingAt) < 1e-9 || f.t >= f.swingAt-1e-12
		atOH := f.hasOH && (math.Abs(f.t-f.ohAt) < 1e-9 || f.t >= f.ohAt-1e-12)
		atGCD := math.Abs(f.t-f.gcdReady) < 1e-9 || f.t >= f.gcdReady-1e-12
		if f.meleeAutos && atSwing && !f.stealthed {
			if meleeLocked {
				f.swingAt = f.t + f.swingTimer*f.hasteMul()
			} else {
				f.autoAttack()
				f.swingAt = f.t + f.swingTimer*f.hasteMul()
				f.consumeFlurry()
			}
		}
		if atOH && !f.stealthed {
			if meleeLocked {
				f.ohAt = f.t + f.ohTimer*f.hasteMul()
			} else {
				f.offHandAttack()
				f.ohAt = f.t + f.ohTimer*f.hasteMul()
				f.consumeFlurry()
			}
		}
		if atGCD && !casting {
			if ab := f.pickGCD(); ab != nil {
				if ab.RequiresStance == "" || ab.RequiresStance == f.mainStance {
					f.restoreMainStanceKeeping(ab.Cost)
				}
				stealthHit := requiresStealth(*ab) && f.stealthed
				f.cast(*ab)
				if stealthHit {
					if f.meleeAutos && f.swingTimer > 0 {
						f.swingAt = f.t + f.swingTimer*f.hasteMul()
					}
					if f.hasOH && f.ohTimer > 0 {
						f.ohAt = f.t + f.ohTimer*f.hasteMul()
					}
				}
				if ab.GCD {
					f.gcdReady = f.t + f.gcdAfter(*ab)
				}
			} else {
				f.restoreMainStance()
				f.gcdReady = f.nextGCDReady()
			}
		}
		next := f.end
		if f.pending.landAt > 0 && f.pending.landAt < next {
			next = f.pending.landAt
		}
		if f.meleeAutos && !f.stealthed && f.swingAt < next {
			next = f.swingAt
		}
		if f.hasOH && !f.stealthed && f.ohAt < next {
			next = f.ohAt
		}
		if !f.isCasting() && f.gcdReady < next {
			next = f.gcdReady
		}
		if t := f.nextResourceEvent(); t < next {
			next = t
		}
		if t := f.nextWarriorEvent(); t < next {
			next = t
		}
		if t := f.nextDotEvent(); t < next {
			next = t
		}
		if rem := f.remainingBuff("recklessness"); rem > 0 && f.t+rem < next {
			next = f.t + rem
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
		ab = applyWarriorAbilityTalents(ab, ranks)
		switch ab.ID {
		case "sinister-strike":
			switch talentRank(ranks, "Improved Sinister Strike") {
			case 1:
				ab.Cost -= 3
			case 2:
				ab.Cost -= 5
			}
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

func abilityPriorityMap(rows []*pb.AbilityPriority) map[string]int {
	if len(rows) == 0 {
		return nil
	}
	out := make(map[string]int, len(rows))
	for _, row := range rows {
		if row.GetId() == "" {
			continue
		}
		out[row.GetId()] = int(row.GetPriority())
	}
	return out
}

func applyAbilityPriorities(abilities []clientdata.Ability, prio map[string]int) []clientdata.Ability {
	if len(prio) == 0 {
		return abilities
	}
	kept := make([]clientdata.Ability, 0, len(abilities))
	for _, ab := range abilities {
		if p, ok := prio[ab.ID]; ok {
			ab.Priority = p
		}
		if ab.Priority <= 0 {
			continue
		}
		kept = append(kept, ab)
	}
	sortAbilities(kept)
	return kept
}

func inRotation(ab clientdata.Ability) bool {
	return ab.Priority > 0 && !ab.SkipRotation
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
	if f.flurryLeft > 0 {
		if r := f.named("Flurry"); r > 0 {
			m *= 1 - 0.05*float64(r)
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
	return m * stanceDamageMul(f.stance)
}

func (f *fight) critChance() float64 {
	c := f.crit + stanceCritBonus(f.stance)
	var extraAgi float64
	for _, b := range f.buffs {
		if f.t < b.expire {
			c += b.crit
			extraAgi += b.agi
		}
	}
	if extraAgi != 0 {
		c += meleeCritFromAgi(f.class, extraAgi)
	}
	if c > 0.95 {
		return 0.95
	}
	return c
}

func (f *fight) currentAP() float64 {
	ap := f.attackPower
	var extraStr float64
	var extraAgi float64
	for _, b := range f.buffs {
		if f.t < b.expire {
			ap += b.ap
			extraStr += b.str
			extraAgi += b.agi
		}
	}
	if extraStr != 0 || extraAgi != 0 {
		ap += meleeAPFromStats(f.class, extraStr, extraAgi)
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
	remain := f.bossArmor - f.armorLost - ignore
	if remain < 0 {
		remain = 0
	}
	m := physicalTaken(remain)
	if f.damageMul > 0 {
		m *= f.damageMul
	}
	if f.weaponMul > 0 {
		m *= f.weaponMul
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
	if f.resource > f.rageCap() {
		f.resource = f.rageCap()
	}
	if f.resource < 0 {
		f.resource = 0
	}
	if f.record {
		f.emitTimeline("resource", f.resourceKind, "", 0, false, false, 0)
	}
}

func requiresStealth(ab clientdata.Ability) bool {
	if ab.RequiresStealth {
		return true
	}
	switch ab.ID {
	case "garrote", "ambush", "cheap-shot", "premeditation":
		return true
	}
	return false
}

func (f *fight) inExecute() bool {
	return f.targetHealth() <= 0.2
}

func (f *fight) rotation() []clientdata.Ability {
	if f.inExecute() && len(f.executeAbs) > 0 {
		return f.executeAbs
	}
	return f.abilities
}

func (f *fight) prioMap() map[string]int {
	if f.inExecute() && len(f.executePrio) > 0 {
		return f.executePrio
	}
	return f.abilityPrio
}

func (f *fight) stealthOpenerInRotation() bool {
	for _, ab := range f.rotation() {
		if requiresStealth(ab) && inRotation(ab) {
			return true
		}
	}
	return false
}

func (f *fight) stealthOpenerWouldUse() bool {
	saved := f.stealthed
	f.stealthed = true
	defer func() { f.stealthed = saved }()
	for _, ab := range f.rotation() {
		if !requiresStealth(ab) || !inRotation(ab) || !ab.GCD {
			continue
		}
		if !f.ready(ab) || !f.canPay(ab) || !f.usable(ab) {
			continue
		}
		return true
	}
	return false
}

func (f *fight) dropBuff(id string) {
	n := 0
	for _, b := range f.buffs {
		if b.id == id {
			continue
		}
		f.buffs[n] = b
		n++
	}
	f.buffs = f.buffs[:n]
}

func (f *fight) breakStealth() {
	if !f.stealthed {
		return
	}
	f.stealthed = false
	f.dropBuff("vanish")
}

func (f *fight) canPay(ab clientdata.Ability) bool {
	if ab.Resource == "" || ab.Cost <= 0 {
		return true
	}
	if ab.Resource != f.resourceKind {
		return true
	}
	return f.payableRage(ab)+1e-9 >= ab.Cost
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

func (f *fight) refreshBuff(next combatBuff) {
	for i := range f.buffs {
		if f.buffs[i].id == next.id {
			f.buffs[i] = next
			f.recordAura("buff", next)
			return
		}
	}
	f.buffs = append(f.buffs, next)
	f.recordAura("buff", next)
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
		f.refreshBuff(combatBuff{
			id:     ab.ID,
			name:   ab.Name,
			icon:   ab.Icon,
			expire: f.end + 3600,
			dmg:    ab.BuffDamage,
			haste:  ab.BuffHaste,
			ap:     ab.BuffAP,
			crit:   ab.BuffCrit,
			str:    ab.BuffStr,
			agi:    ab.BuffAgi,
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
	if ab.ID == "bloodrage" && f.resource > f.rageCap()-10 {
		return false
	}
	if f.waitForBlocks(ab) {
		return false
	}
	if f.clipsHigherMelee(ab) {
		return false
	}
	if ab.MinTargets > 1 && f.targetCount() < ab.MinTargets {
		return false
	}
	if ab.Kind == "opener" && ab.ID == "pyroblast" && f.t > 0.05 {
		return false
	}
	if requiresStealth(ab) && !f.stealthed {
		return false
	}
	if ab.ID == "vanish" && (f.stealthed || !f.stealthOpenerWouldUse()) {
		return false
	}
	if ab.ID == "adrenaline-rush" && f.remainingBuff("slice-and-dice") <= 0 {
		return false
	}
	if f.stealthed && !requiresStealth(ab) && ab.ID != "vanish" {
		return false
	}
	if ab.ID == "mutilate" && !f.hasOH {
		return false
	}
	if ab.ConsumeCombo {
		return f.comboFinisherReady(ab)
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
	if critOnlyBuff(ab) && f.holdCritBuff(ab) {
		return false
	}
	if ab.ComboMin > 0 && f.combo < ab.ComboMin {
		return false
	}
	if ab.ComboGen > 0 && f.combo >= comboSpendAt {
		return false
	}
	return true
}

func (f *fight) comboFinisherReady(ab clientdata.Ability) bool {
	if f.combo < comboSpendAt {
		return false
	}
	switch ab.ID {
	case "slice-and-dice":
		return f.remainingBuff(ab.ID) <= 0
	case "rupture":
		return f.remainingDot(ab.ID) <= 0
	default:
		return true
	}
}

func critOnlyBuff(ab clientdata.Ability) bool {
	if ab.BuffCrit <= 0 {
		return false
	}
	return ab.BuffDamage == 0 && ab.BuffHaste == 0 && ab.BuffAP == 0 && ab.BuffStr == 0 && ab.BuffAgi == 0
}

func (f *fight) critSaturated() bool {
	return f.critChance() >= 0.95-1e-9
}

func (f *fight) holdCritBuff(ab clientdata.Ability) bool {
	if ab.ID == "recklessness" {
		return false
	}
	if f.critSaturated() || f.buffActive("recklessness") {
		return true
	}
	for _, other := range f.rotation() {
		if other.ID == "recklessness" && inRotation(other) && f.ready(other) && f.canPay(other) {
			return true
		}
	}
	return false
}

func (f *fight) remainingBuff(id string) float64 {
	for _, b := range f.buffs {
		if b.id == id && b.expire > f.t {
			return b.expire - f.t
		}
	}
	return 0
}

func (f *fight) waitForBlocks(ab clientdata.Ability) bool {
	window := f.readyWaitWindow(ab)
	if window <= 0 {
		return false
	}
	rem, ok := f.soonestHigherPriorityReady(ab)
	if !ok {
		return false
	}
	return rem <= window
}

func (f *fight) readyWaitWindow(ab clientdata.Ability) float64 {
	if ab.WaitForReadyAbove > 0 {
		return ab.WaitForReadyAbove
	}
	if ab.GCD && ab.Kind == "strike" {
		return gcdDuration
	}
	return 0
}

func (f *fight) soonestHigherPriorityReady(ab clientdata.Ability) (float64, bool) {
	soonest := math.Inf(1)
	found := false
	for _, other := range f.rotation() {
		if other.ID == ab.ID || !inRotation(other) || !other.GCD || other.Kind != "strike" {
			continue
		}
		if other.Priority <= ab.Priority {
			continue
		}
		if !f.phaseOK(other) {
			continue
		}
		found = true
		rem := f.cds[other.ID] - f.t
		if rem < 0 {
			rem = 0
		}
		if rem < soonest {
			soonest = rem
		}
	}
	return soonest, found
}

func (f *fight) remainingDot(id string) float64 {
	for _, d := range f.dots {
		if d.id == id && d.expire > f.t {
			return d.expire - f.t
		}
	}
	return 0
}

func (f *fight) addCombo(n int) {
	if n <= 0 {
		return
	}
	f.combo += n
	if f.combo > comboSpendAt {
		f.combo = comboSpendAt
	}
}

func (f *fight) useOffGCD() {
	for _, ab := range f.rotation() {
		if !inRotation(ab) || ab.GCD || !f.ready(ab) || !f.canPay(ab) {
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

func itemUseAbilityID(name string) string {
	out := make([]byte, 0, 4+len(name))
	out = append(out, "use:"...)
	for i := 0; i < len(name); i++ {
		c := name[i]
		if c >= 'A' && c <= 'Z' {
			c = c - 'A' + 'a'
		}
		if c == '\'' {
			continue
		}
		if c == ' ' || c == '-' {
			if len(out) > 4 && out[len(out)-1] != '-' {
				out = append(out, '-')
			}
			continue
		}
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			out = append(out, c)
		}
	}
	if n := len(out); n > 4 && out[n-1] == '-' {
		out = out[:n-1]
	}
	return string(out)
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
		if p, ok := f.prioMap()[itemUseAbilityID(name)]; ok && p <= 0 {
			continue
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
		if effect.Rage > 0 && f.resourceKind == "rage" {
			f.addResource(effect.Rage)
		}
		ap := effect.AttackPower
		if effect.StackAP > 0 && effect.Interval > 0 && effect.Duration > 0 {
			n := effect.Duration / effect.Interval
			ap = effect.StackAP * (n + 1) / 2
		}
		dur := effect.Duration
		if dur <= 0 {
			dur = 0.1
		}
		f.accumulate(name, effect.Icon, 0, false, false)
		f.refreshBuff(combatBuff{
			id:          name,
			name:        name,
			icon:        effect.Icon,
			expire:      f.t + dur,
			ap:          ap,
			sp:          effect.SpellPower,
			haste:       effect.Haste,
			crit:        effect.Crit,
			str:         effect.Strength,
			agi:         effect.Agility,
			armorIgnore: effect.ArmorIgnore,
		})
	}
}

func (f *fight) pickGCD() *clientdata.Ability {
	if ab := f.pickComboFinisher(); ab != nil {
		return ab
	}
	if f.combo >= comboSpendAt {
		return nil
	}
	rot := f.rotation()
	for i := range rot {
		ab := &rot[i]
		if !inRotation(*ab) || !ab.GCD || ab.Kind == "queue" || ab.ConsumeCombo || !f.ready(*ab) || !f.canPay(*ab) {
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

func (f *fight) pickComboFinisher() *clientdata.Ability {
	rot := f.rotation()
	for i := range rot {
		ab := &rot[i]
		if !ab.ConsumeCombo || !inRotation(*ab) || !ab.GCD || !f.ready(*ab) || !f.canPay(*ab) || !f.usable(*ab) {
			continue
		}
		return ab
	}
	return nil
}

func (f *fight) nextGCDReady() float64 {
	next := f.end
	for _, ab := range f.rotation() {
		if !inRotation(ab) || !ab.GCD || ab.Kind == "queue" || ab.SkipRotation {
			continue
		}
		if !f.phaseOK(ab) || f.waitForBlocks(ab) {
			continue
		}
		if requiresStealth(ab) && !f.stealthed {
			continue
		}
		if ab.ConsumeCombo {
			if !f.comboFinisherReady(ab) {
				rem := 0.0
				switch ab.ID {
				case "slice-and-dice":
					rem = f.remainingBuff(ab.ID)
				case "rupture":
					rem = f.remainingDot(ab.ID)
				}
				if rem > 0 && f.combo >= comboSpendAt {
					if rem+f.t < next {
						next = f.t + rem
					}
				}
				continue
			}
		} else if ab.ComboMin > 0 && f.combo < ab.ComboMin {
			continue
		}
		readyAt := f.cds[ab.ID]
		if readyAt < f.t {
			readyAt = f.t
		}
		if !ab.ConsumeCombo && ab.Duration > 0 && isDotAbility(ab) && f.dotActive(ab.ID) {
			for _, d := range f.dots {
				if d.id == ab.ID && d.expire < next && d.expire > f.t {
					next = d.expire
				}
			}
			continue
		}
		if !ab.ConsumeCombo && ab.Duration > 0 && f.buffActive(ab.ID) {
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
	rot := f.rotation()
	for i := range rot {
		ab := &rot[i]
		if ab.Kind != "queue" || !inRotation(*ab) {
			continue
		}
		if !f.phaseOK(*ab) || !f.canPay(*ab) {
			continue
		}
		if ab.MinTargets > 1 && f.targetCount() < ab.MinTargets {
			continue
		}
		if ab.DumpAbove > 0 && f.resource < ab.DumpAbove && f.targetHealth() > 0.2 {
			if f.rageNeedAbove(*ab) > 0 {
				continue
			}
		}
		if f.resource-ab.Cost+1e-9 < f.rageNeedAbove(*ab) {
			continue
		}
		return ab
	}
	return nil
}

func (f *fight) targetCount() int {
	return 1
}

func (f *fight) rageNeedAbove(ab clientdata.Ability) float64 {
	if f.resourceKind != "rage" {
		return 0
	}
	var need float64
	for _, other := range f.rotation() {
		if !inRotation(other) || other.Priority <= ab.Priority || other.Cost <= 0 {
			continue
		}
		if other.Resource != "rage" && other.Resource != f.resourceKind {
			continue
		}
		if other.Kind != "strike" && other.Kind != "buff" && other.Kind != "queue" {
			continue
		}
		if !f.phaseOK(other) {
			continue
		}
		if f.cds[other.ID] > f.t+gcdDuration {
			continue
		}
		if other.Cost > need {
			need = other.Cost
		}
	}
	return need
}

func (f *fight) starvesHigher(ab clientdata.Ability) bool {
	if ab.Cost <= 0 || ab.Resource == "" || ab.Resource != f.resourceKind {
		return false
	}
	for _, other := range f.rotation() {
		if !inRotation(other) || other.Priority <= ab.Priority || other.Cost <= 0 {
			continue
		}
		if other.Resource != ab.Resource {
			continue
		}
		if other.Kind != "strike" && other.Kind != "buff" && other.Kind != "queue" {
			continue
		}
		if other.ConsumeCombo && !f.comboFinisherReady(other) {
			continue
		}
		if f.cds[other.ID] > f.t+gcdDuration {
			continue
		}
		if !f.phaseOK(other) {
			continue
		}
		need := other.Cost
		left := f.payableRage(ab) - ab.Cost
		if left+1e-9 < need {
			return true
		}
	}
	return false
}

func (f *fight) clipsHigherMelee(ab clientdata.Ability) bool {
	cast := defaultCastTime(ab)
	if cast <= 0 || !f.meleeAutos {
		return false
	}
	higherQueue := false
	for _, other := range f.rotation() {
		if other.Kind != "queue" || !inRotation(other) || other.Priority <= ab.Priority {
			continue
		}
		if !f.phaseOK(other) {
			continue
		}
		higherQueue = true
		break
	}
	if !higherQueue {
		return false
	}
	if ab.ID == "slam" && f.named("Improved Slam") <= 0 {
		return true
	}
	land := f.t + cast
	return f.swingAt > f.t+1e-12 && f.swingAt < land-1e-12
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
	if !miss {
		f.onPhysicalHit(crit, false)
		f.maybeWindfury()
	}
	if f.resourceKind == "rage" && !miss {
		f.addResource(rageFromWhite(dmg, f.swingTimer, crit))
	}
	f.recordHit("Auto Attack", iconAuto, dmg, crit, miss)
}

func (f *fight) offHandAttack() {
	white := f.ohDPS * f.ohTimer
	f.useOHMiss = true
	dmg, crit, miss := f.roll(white, false, false, 2)
	f.useOHMiss = false
	if !miss {
		f.onPhysicalHit(crit, true)
	}
	if f.resourceKind == "rage" && !miss {
		f.addResource(rageFromWhite(dmg, f.ohTimer, crit) * f.ohRageMul)
	}
	f.recordHit("Off-Hand", iconOffHand, dmg, crit, miss)
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

func (f *fight) isCasting() bool {
	return f.pending.landAt > 0
}

func (f *fight) meleeLocked() bool {
	return f.swingLockUntil > f.t+1e-12
}

func (f *fight) gcdAfter(ab clientdata.Ability) float64 {
	wait := gcdDuration
	if ab.ID == "slam" {
		wait -= 0.25 * float64(f.named("Improved Slam"))
	}
	if wait < 1 {
		wait = 1
	}
	return wait
}

func (f *fight) delayMeleeForCast(ab clientdata.Ability, cast float64) {
	if cast <= 0 {
		return
	}
	land := f.t + cast
	f.swingLockUntil = land
	if ab.ID != "slam" || f.named("Improved Slam") > 0 {
		return
	}
	if f.meleeAutos && f.swingTimer > 0 {
		f.swingAt = land + f.swingTimer*f.hasteMul()
	}
	if f.hasOH && f.ohTimer > 0 {
		f.ohAt = land + f.ohTimer*f.hasteMul()
	}
}

func (f *fight) finishPendingCast() {
	if f.pending.landAt <= 0 || f.t < f.pending.landAt-1e-12 {
		return
	}
	p := f.pending
	f.pending = pendingCast{}
	if f.t > f.swingLockUntil {
		f.swingLockUntil = 0
	}
	if f.t >= f.end-1e-9 {
		return
	}
	f.resolveAbility(p.ab, p.extraRage, p.combo)
}

func (f *fight) cast(ab clientdata.Ability) {
	if f.record {
		logRotation(f.t, ab.Name, f.resourceKind, f.resource)
	}
	f.ensureStance(ab)
	cd := ab.Cooldown
	if cd <= 0 {
		cd = gcdDuration
	}
	f.cds[ab.ID] = f.t + cd
	f.pay(ab)
	if ab.ID == "vanish" {
		f.stealthed = true
	} else if requiresStealth(ab) || ab.Kind == "strike" || ab.Kind == "queue" {
		f.breakStealth()
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
	if ct := defaultCastTime(ab); ct > 1e-9 {
		f.delayMeleeForCast(ab, ct)
		f.pending = pendingCast{ab: ab, extraRage: extraRage, combo: combo, landAt: f.t + ct}
		f.emitTimeline("cast", ab.Name, ab.Icon, 0, false, false, ct)
		return
	}
	f.resolveAbility(ab, extraRage, combo)
}

func (f *fight) resolveAbility(ab clientdata.Ability, extraRage float64, combo int) {
	dur := ab.Duration
	if ab.ComboDurationPer > 0 {
		dur = ab.ComboDurationBase + ab.ComboDurationPer*float64(combo)
	}
	if ab.ID == "slice-and-dice" {
		dur *= 1 + 0.15*float64(f.named("Improved Slice and Dice"))
	}
	if ab.ID == "cold-blood" {
		dur = f.end - f.t
		if dur < 0.05 {
			dur = 0.05
		}
	}
	if dur > 0 && !isDotAbility(ab) {
		f.refreshBuff(combatBuff{
			id:     ab.ID,
			name:   ab.Name,
			icon:   ab.Icon,
			expire: f.t + dur,
			dmg:    ab.BuffDamage,
			haste:  ab.BuffHaste,
			ap:     ab.BuffAP,
			crit:   ab.BuffCrit,
			str:    ab.BuffStr,
			agi:    ab.BuffAgi,
		})
	}
	if ab.ConsumeCombo {
		f.combo = 0
		if combo > 0 && f.named("Relentless Strikes") > 0 && f.rng.Float64() < 0.20*float64(combo) {
			f.addResource(25)
		}
		if r := f.named("Ruthlessness"); r > 0 && f.rng.Float64() < 0.20*float64(r) {
			f.addCombo(1)
		}
	}
	if ab.ID == "mutilate" {
		f.castMutilate(ab)
		return
	}
	if isDotAbility(ab) {
		spec := abilityDots[ab.ID]
		crit, miss := f.hitCheck(true, spec.spell)
		if miss {
			f.recordHit(ab.Name, ab.Icon, 0, false, true)
			return
		}
		f.addCombo(ab.ComboGen)
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
		f.addCombo(ab.ComboGen)
		f.accumulate(ab.Name, ab.Icon, 0, false, false)
		if dur <= 0 {
			f.emitTimeline("hit", ab.Name, ab.Icon, 0, false, false, 0)
		}
		return
	}
	spell := isSpellAbility(ab)
	if spell {
		raw *= f.schoolTaken(ab.ID)
	}
	if ab.ID == "overpower" {
		f.pendingCritBonus = 0.25 * float64(f.named("Improved Overpower"))
	}
	f.pendingCritBonus += f.consumeColdBlood(ab.ID)
	dmg, crit, miss := f.roll(raw, true, spell, f.critMultiplier(ab, spell, true))
	f.recordHit(ab.Name, ab.Icon, dmg, crit, miss)
	if !miss {
		f.addCombo(ab.ComboGen)
		if crit {
			f.maybeSealFate()
		}
	}
	if !miss && !spell {
		f.onPhysicalHit(crit, false)
	}
	if ab.ID == "whirlwind" && !miss {
		f.ragingBlowsOH()
	}
	f.maybeImprovedShadowBolt(ab, crit)
}

func (f *fight) ohSpecialSwing() float64 {
	if !f.hasOH || f.ohTimer <= 0 {
		return 0
	}
	return f.ohDPS * f.ohTimer / 0.5
}

func (f *fight) targetPoisoned() bool {
	return f.remainingDot("deadly-poison") > 0
}

func (f *fight) consumeColdBlood(id string) float64 {
	switch id {
	case "sinister-strike", "backstab", "ambush", "eviscerate", "mutilate":
	default:
		return 0
	}
	if !f.buffActive("cold-blood") {
		return 0
	}
	f.dropBuff("cold-blood")
	f.clipAura("buff", "Cold Blood")
	return 1
}

func (f *fight) maybeSealFate() {
	r := f.named("Seal Fate")
	if r <= 0 {
		return
	}
	if f.rng.Float64() < 0.20*float64(r) {
		f.addCombo(1)
	}
}

func (f *fight) castMutilate(ab clientdata.Ability) {
	poisonMul := 1.0
	if f.targetPoisoned() {
		poisonMul = 1.2
	}
	extraCrit := 0.05*float64(f.named("Puncturing Wounds")) + f.consumeColdBlood(ab.ID)
	critMul := f.critMultiplier(ab, false, true)
	strike := func(raw float64, name string, offHand bool) (crit, hit bool) {
		f.pendingCritBonus += extraCrit
		dmg, crit, miss := f.roll(raw, true, false, critMul)
		f.recordHit(name, ab.Icon, dmg, crit, miss)
		if miss {
			return false, false
		}
		f.onPhysicalHit(crit, offHand)
		return crit, true
	}
	mhRaw := (f.mhSwing()*ab.DamageWeapon + ab.DamageFlat) * f.talentMul(ab.ID) * poisonMul
	mhCrit, connected := strike(mhRaw, ab.Name, false)
	ohCrit := false
	if f.hasOH {
		ohRaw := (f.ohSpecialSwing()*ab.DamageWeapon + ab.DamageFlat) * f.talentMul(ab.ID) * poisonMul
		var ohHit bool
		ohCrit, ohHit = strike(ohRaw, ab.Name+" Off-Hand", true)
		if ohHit {
			connected = true
		}
	}
	if !connected {
		return
	}
	f.addCombo(ab.ComboGen)
	if mhCrit || ohCrit {
		f.maybeSealFate()
	}
}

func (f *fight) hitCheck(yellow, spell bool) (crit, miss bool) {
	missP := f.missWhite
	if spell {
		missP = f.missSpell
	} else if yellow {
		missP = f.missYellow
	} else if f.useOHMiss && f.missOH > 0 {
		missP = f.missOH
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
	critP += f.pendingCritBonus
	f.pendingCritBonus = 0
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
	case "arcane":
		m = f.arcaneMul
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
			f.refreshBuff(combatBuff{
				id:     name,
				name:   name,
				expire: f.t + effect.Duration,
				ap:     effect.AttackPower,
			})
		}
	}
}

func (f *fight) accumulate(name, icon string, dmg float64, crit, miss bool) {
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
		acc.critDmg += dmg
	} else {
		acc.hitDmg += dmg
	}
}

func (f *fight) emitTimeline(kind, name, icon string, dmg float64, crit, miss bool, duration float64) {
	if !f.record || len(f.events) >= f.eventCap {
		return
	}
	f.events = append(f.events, &pb.TimelineEvent{
		TimeSeconds:     f.t,
		Name:            name,
		Damage:          dmg,
		Crit:            crit,
		Miss:            miss,
		Icon:            icon,
		ResourceKind:    f.resourceKind,
		Resource:        f.resource,
		Kind:            kind,
		DurationSeconds: duration,
	})
}

func (f *fight) recordHit(name, icon string, dmg float64, crit, miss bool) {
	f.accumulate(name, icon, dmg, crit, miss)
	f.emitTimeline("hit", name, icon, dmg, crit, miss, 0)
}

func (f *fight) recordTick(name, icon string, dmg float64) {
	f.accumulate(name, icon, dmg, false, false)
	f.emitTimeline("tick", name, icon, dmg, false, false, 0)
}

func (f *fight) recordAura(kind string, buff combatBuff) {
	duration := buff.expire - f.t
	if duration <= 0 || buff.expire > f.end+1 {
		return
	}
	name := buff.name
	if name == "" {
		name = buff.id
	}
	f.emitAura(kind, name, buff.icon, duration)
}

func (f *fight) emitAura(kind, name, icon string, duration float64) {
	if duration <= 0 {
		return
	}
	if remain := f.end - f.t; duration > remain && remain > 0 {
		duration = remain
	}
	expire := f.t + duration
	for i := len(f.events) - 1; i >= 0; i-- {
		ev := f.events[i]
		if ev.Name != name || ev.Kind != kind {
			continue
		}
		if f.t <= ev.TimeSeconds+ev.DurationSeconds+1e-6 {
			ev.DurationSeconds = expire - ev.TimeSeconds
			return
		}
		break
	}
	f.emitTimeline(kind, name, icon, 0, false, false, duration)
}

func (f *fight) openStanceAura() {
	if !f.record || f.stance == "" {
		return
	}
	dur := f.end - f.t
	if dur <= 1e-6 {
		return
	}
	f.emitAura("buff", stanceLabel(f.stance), stanceIcon(f.stance), dur)
}

func (f *fight) closeStanceAura() {
	if !f.record || f.stance == "" {
		return
	}
	f.clipAura("buff", stanceLabel(f.stance))
}

func (f *fight) clipAura(kind, name string) {
	for i := len(f.events) - 1; i >= 0; i-- {
		ev := f.events[i]
		if ev.Name != name || ev.Kind != kind {
			continue
		}
		if f.t > ev.TimeSeconds+ev.DurationSeconds+1e-6 {
			return
		}
		ev.DurationSeconds = f.t - ev.TimeSeconds
		if ev.DurationSeconds <= 1e-6 {
			f.events = append(f.events[:i], f.events[i+1:]...)
		}
		return
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
