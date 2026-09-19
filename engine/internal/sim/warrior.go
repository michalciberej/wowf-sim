package sim

import (
	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

const bossSwingInterval = 2.0

const (
	stanceBattle    = "battle"
	stanceBerserker = "berserker"
	stanceDefensive = "defensive"
)

type warriorPassives struct {
	crit        float64
	hit         float64
	damageMul   float64
	armorIgnore float64
	maxRage     float64
	ohRageMul   float64
	ohHit       float64
	swordProc   float64
	twoHand     bool
}

func warriorPassivesFor(player *pb.Player, ranks map[int32]int32, twoHand bool, subclass string, bossArmor float64) warriorPassives {
	out := warriorPassives{damageMul: 1, maxRage: maxResource, ohRageMul: 1, twoHand: twoHand}
	if player.GetClass() != pb.Class_CLASS_WARRIOR {
		return out
	}
	out.crit += 0.01 * float64(talentRank(ranks, "Cruelty"))
	out.hit += 0.01 * float64(talentRank(ranks, "Precision"))
	if twoHand {
		out.damageMul *= 1 + 0.01*float64(talentRank(ranks, "Two-Handed Weapon Specialization"))
	}
	wm := talentRank(ranks, "Weaponmaster")
	if wm > 0 {
		switch subclass {
		case "Axe", "Polearm":
			out.crit += 0.01 * float64(wm)
		case "Mace", "Staff":
			out.armorIgnore = 0.03 * float64(wm) * bossArmor
		case "Sword":
			out.swordProc = 0.01 * float64(wm)
		}
	}
	dw := talentRank(ranks, "Dual Wield Specialization")
	if dw > 0 && !twoHand {
		out.ohRageMul = 1 + 0.20*float64(dw)
		out.ohHit = 0.02 * float64(dw)
	}
	if br := talentRank(ranks, "Boundless Rage"); br > 0 {
		out.maxRage = maxResource + 10*float64(br)
	}
	return out
}

func applyWarriorAbilityTalents(ab clientdata.Ability, ranks map[int32]int32) clientdata.Ability {
	switch ab.ID {
	case "charge":
		ab.Gain += 3 * float64(talentRank(ranks, "Improved Charge"))
	case "heroic-strike":
		ab.Cost -= float64(talentRank(ranks, "Improved Heroic Strike"))
		if ab.Cost < 1 {
			ab.Cost = 1
		}
	case "execute":
		switch talentRank(ranks, "Improved Execute") {
		case 1:
			ab.Cost -= 3
		case 2:
			ab.Cost -= 5
		}
		if ab.Cost < 1 {
			ab.Cost = 1
		}
	case "slam":
		ab.CastTime -= 0.25 * float64(talentRank(ranks, "Improved Slam"))
		if ab.CastTime < 0 {
			ab.CastTime = 0
		}
	case "berserker-rage":
		ab.Gain += 5 * float64(talentRank(ranks, "Improved Berserker Rage"))
	case "cleave":
		ab.Cost -= float64(talentRank(ranks, "Improved Cleave"))
		if talentRank(ranks, "Raging Blows") > 0 {
			ab.Cost -= 2
		}
		if ab.Cost < 1 {
			ab.Cost = 1
		}
	}
	off := float64(talentRank(ranks, "Focused Rage"))
	if off > 0 && ab.Resource == "rage" && ab.Cost > 0 && ab.Kind != "opener" {
		ab.Cost -= off
		if ab.Cost < 1 {
			ab.Cost = 1
		}
	}
	return ab
}

func warriorMainStance(player *pb.Player) string {
	if player.GetClass() != pb.Class_CLASS_WARRIOR {
		return ""
	}
	switch player.GetStance() {
	case pb.WarriorStance_WARRIOR_STANCE_BATTLE:
		return stanceBattle
	case pb.WarriorStance_WARRIOR_STANCE_DEFENSIVE:
		return stanceDefensive
	default:
		return stanceBerserker
	}
}

func stanceDamageMul(stance string) float64 {
	if stance == stanceDefensive {
		return 0.90
	}
	return 1
}

func stanceCritBonus(stance string) float64 {
	if stance == stanceBerserker {
		return 0.03
	}
	return 0
}

func stanceLabel(stance string) string {
	switch stance {
	case stanceBattle:
		return "Battle Stance"
	case stanceBerserker:
		return "Berserker Stance"
	case stanceDefensive:
		return "Defensive Stance"
	default:
		return "Stance"
	}
}

func stanceIcon(stance string) string {
	switch stance {
	case stanceBattle:
		return "ability_warrior_offensivestance"
	case stanceBerserker:
		return "ability_racial_avatar"
	case stanceDefensive:
		return "ability_warrior_defensivestance"
	default:
		return "ability_warrior_offensivestance"
	}
}

func (f *fight) stanceRetain() float64 {
	return 3 * float64(f.named("Improved Tactical Mastery"))
}

func (f *fight) payableRage(ab clientdata.Ability) float64 {
	rage := f.resource
	need := ab.RequiresStance
	if need == "" || need == f.stance {
		return rage
	}
	keep := f.stanceRetain()
	if ab.Cost > keep {
		keep = ab.Cost
	}
	if rage > keep {
		return keep
	}
	return rage
}

func (f *fight) switchStance(to string, keepAtLeast float64) {
	if to == "" || to == f.stance {
		return
	}
	retain := f.stanceRetain()
	if keepAtLeast > retain {
		retain = keepAtLeast
	}
	if f.resource > retain {
		f.resource = retain
	}
	f.closeStanceAura()
	f.stance = to
	f.openStanceAura()
}

func (f *fight) ensureStance(ab clientdata.Ability) {
	need := ab.RequiresStance
	if need == "" || need == f.stance {
		return
	}
	f.switchStance(need, ab.Cost)
}

func (f *fight) restoreMainStance() {
	f.restoreMainStanceKeeping(0)
}

func (f *fight) restoreMainStanceKeeping(keep float64) {
	if f.mainStance == "" || f.stance == f.mainStance {
		return
	}
	f.switchStance(f.mainStance, keep)
}

func (f *fight) rageCap() float64 {
	if f.resourceKind == "energy" {
		return maxResource
	}
	if f.maxRage > 0 {
		return f.maxRage
	}
	return maxResource
}

func (f *fight) consumeFlurry() {
	if f.flurryLeft > 0 {
		f.flurryLeft--
	}
}

func (f *fight) procFlurry(crit bool) {
	if !crit {
		return
	}
	if f.named("Flurry") <= 0 {
		return
	}
	f.flurryLeft = 3
}

func (f *fight) procWeaponmasterExtra() {
	if f.swordProc <= 0 {
		return
	}
	if f.rng.Float64() >= f.swordProc {
		return
	}
	raw := f.mhSwing()
	dmg, crit, miss := f.roll(raw, false, false, 2)
	f.recordHit("Weaponmaster", "inv_sword_27", dmg, crit, miss)
}

func (f *fight) unbridledWrath() {
	if f.class != pb.Class_CLASS_WARRIOR {
		return
	}
	ranks := f.named("Unbridled Wrath")
	if ranks <= 0 {
		return
	}
	if f.rng.Float64() >= 0.12*float64(ranks) {
		return
	}
	gain := 1.0
	if f.mhTwoHand {
		gain = 2
	}
	f.addResource(gain)
}

func (f *fight) tickWarrior() {
	if f.class != pb.Class_CLASS_WARRIOR {
		return
	}
	if f.named("Anger Management") > 0 {
		for f.angerAt <= f.t+1e-9 && f.t < f.end {
			f.addResource(1)
			f.angerAt += 3
		}
	}
	if r := f.named("Enrage"); r > 0 {
		for f.enrageAt <= f.t+1e-9 && f.t < f.end {
			if f.rng.Float64() < 0.30 {
				f.refreshBuff(combatBuff{
					id:     "enrage",
					name:   "Enrage",
					icon:   "spell_shadow_unholyfrenzy",
					expire: f.t + 12,
					dmg:    0.02 * float64(r),
				})
			}
			f.enrageAt += bossSwingInterval
		}
	}
}

func (f *fight) nextWarriorEvent() float64 {
	next := f.end
	if f.class != pb.Class_CLASS_WARRIOR {
		return next
	}
	if f.named("Anger Management") > 0 && f.angerAt < next {
		next = f.angerAt
	}
	if f.named("Enrage") > 0 && f.enrageAt < next {
		next = f.enrageAt
	}
	return next
}

func (f *fight) ragingBlowsOH(ww clientdata.Ability) {
	if !f.hasOH || f.named("Raging Blows") <= 0 {
		return
	}
	raw := f.ohNormalizedSwing()
	if raw <= 0 {
		return
	}
	oh := ww
	oh.Name = "Whirlwind Off-Hand"
	oh.Icon = "ability_whirlwind"
	critMul := 2.0
	dmg, crit, miss := f.roll(raw, true, false, critMul)
	f.recordHit(oh.Name, oh.Icon, dmg, crit, miss)
	if !miss {
		f.onPhysicalHit(crit, true)
	}
	f.hitExtraTargets(oh, raw, false, critMul)
}
