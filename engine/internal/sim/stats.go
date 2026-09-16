package sim

import (
	"math"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

const (
	baseSpellMiss = 0.17
)

func classBaseStats(class pb.Class) (str, agi, intel float64) {
	s, a, i, _, _, _ := playerBaseStats(class, pb.Race_RACE_HUMAN)
	return s, a, i
}

// playerBaseStats is the WowSims Classic level-60 table: class base + race offsets.
func playerBaseStats(class pb.Class, race pb.Race) (str, agi, intel, sta, spi, classAP float64) {
	switch class {
	case pb.Class_CLASS_WARRIOR:
		str, agi, intel, sta, spi, classAP = 120, 80, 30, 110, 45, 160
	case pb.Class_CLASS_PALADIN:
		str, agi, intel, sta, spi, classAP = 105, 65, 70, 100, 75, 160
	case pb.Class_CLASS_HUNTER:
		str, agi, intel, sta, spi, classAP = 55, 125, 65, 90, 70, 100
	case pb.Class_CLASS_ROGUE:
		str, agi, intel, sta, spi, classAP = 80, 130, 35, 75, 50, 100
	case pb.Class_CLASS_PRIEST:
		str, agi, intel, sta, spi, classAP = 35, 40, 120, 50, 125, -10
	case pb.Class_CLASS_SHAMAN:
		str, agi, intel, sta, spi, classAP = 85, 55, 90, 95, 100, 100
	case pb.Class_CLASS_MAGE:
		str, agi, intel, sta, spi, classAP = 30, 35, 125, 45, 120, -10
	case pb.Class_CLASS_WARLOCK:
		str, agi, intel, sta, spi, classAP = 45, 50, 110, 65, 115, -10
	case pb.Class_CLASS_DRUID:
		str, agi, intel, sta, spi, classAP = 65, 60, 100, 70, 110, -20
	default:
		str, agi, intel, sta, spi, classAP = 80, 80, 80, 80, 80, 0
	}
	switch race {
	case pb.Race_RACE_ORC:
		str, agi, intel, sta, spi = str+3, agi-3, intel-3, sta+2, spi+3
	case pb.Race_RACE_DWARF:
		str, agi, intel, sta, spi = str+2, agi-4, intel-1, sta+3, spi-1
	case pb.Race_RACE_NIGHT_ELF:
		str, agi, sta = str-3, agi+5, sta-1
	case pb.Race_RACE_UNDEAD:
		str, agi, intel, sta, spi = str-1, agi-2, intel-2, sta+1, spi+5
	case pb.Race_RACE_TAUREN:
		str, agi, intel, sta, spi = str+5, agi-5, intel-5, sta+2, spi+2
	case pb.Race_RACE_GNOME:
		str, agi, intel, sta = str-5, agi+3, intel+3, sta-1
	case pb.Race_RACE_TROLL:
		str, agi, intel, sta, spi = str+1, agi+2, intel-4, sta+1, spi+1
	}
	return
}

func usesMeleeAutos(class pb.Class, ranks map[int32]int32) bool {
	switch class {
	case pb.Class_CLASS_MAGE, pb.Class_CLASS_PRIEST, pb.Class_CLASS_WARLOCK:
		return false
	case pb.Class_CLASS_DRUID:
		return talentAny(ranks, "Feral Instinct", "Predatory Strikes", "Savage Fury", "Feral Charge", "Leader of the Pack")
	case pb.Class_CLASS_SHAMAN:
		return talentAny(ranks, "Stormstrike", "Dual Wield Specialization", "Flurry", "Elemental Weapons", "Unleashed Rage")
	default:
		return true
	}
}

func meleeAPFromStats(class pb.Class, str, agi float64) float64 {
	switch class {
	case pb.Class_CLASS_ROGUE:
		return str + agi
	case pb.Class_CLASS_HUNTER:
		return str
	case pb.Class_CLASS_DRUID:
		return str*2 + agi
	case pb.Class_CLASS_WARRIOR, pb.Class_CLASS_PALADIN, pb.Class_CLASS_SHAMAN:
		return str * 2
	default:
		return str
	}
}

// rangedAPFromStats is WowSims RAP conversion. Hunters get 2 RAP per agility
// (class RAP bonus is already in classAP). Other classes do not use RAP here.
func rangedAPFromStats(class pb.Class, agi float64) float64 {
	if class == pb.Class_CLASS_HUNTER {
		return agi * 2
	}
	return 0
}

func attackPowerFromStats(class pb.Class, str, agi float64) float64 {
	if class == pb.Class_CLASS_HUNTER {
		return rangedAPFromStats(class, agi)
	}
	return meleeAPFromStats(class, str, agi)
}

const battleShoutAP = 232.0

func hasBuffID(ids []string, want string) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

// selfClassAP is buffs the player maintains themselves (WowSims character sheet).
// A naked orc warrior is 160 + 123*2 + 232 Battle Shout = 638 when raid BS is off.
func selfClassAP(class pb.Class, ranks map[int32]int32, raidBuffs []string) float64 {
	switch class {
	case pb.Class_CLASS_WARRIOR:
		if hasBuffID(raidBuffs, "battle-shout") {
			return 0
		}
		ap := battleShoutAP
		ap *= 1 + 0.05*float64(talentRank(ranks, "Improved Battle Shout"))
		return ap
	default:
		return 0
	}
}

// classBaseMeleeCrit is WowSims ClassBaseCrit at level 60. Warriors are 0;
// agility conversion is the whole naked melee crit (orc warrior 77 agi → 3.85%).
func classBaseMeleeCrit(class pb.Class) float64 {
	switch class {
	case pb.Class_CLASS_PALADIN:
		return 0.007
	case pb.Class_CLASS_PRIEST:
		return 0.03
	case pb.Class_CLASS_SHAMAN:
		return 0.017
	case pb.Class_CLASS_MAGE:
		return 0.032
	case pb.Class_CLASS_WARLOCK:
		return 0.02
	case pb.Class_CLASS_DRUID:
		return 0.009
	default:
		return 0
	}
}

func meleeCritFromAgi(class pb.Class, agi float64) float64 {
	pctPerAgi := 0.05
	switch class {
	case pb.Class_CLASS_PALADIN:
		pctPerAgi = 0.0506
	case pb.Class_CLASS_HUNTER:
		pctPerAgi = 0.0189
	case pb.Class_CLASS_ROGUE:
		pctPerAgi = 0.0345
	case pb.Class_CLASS_SHAMAN:
		pctPerAgi = 0.0508
	case pb.Class_CLASS_MAGE:
		pctPerAgi = 0.0514
	}
	return agi * pctPerAgi / 100
}

func meleeCritChance(class pb.Class, agi, gearCrit float64) float64 {
	return classBaseMeleeCrit(class) + meleeCritFromAgi(class, agi) + gearCrit
}

func spellCritFromInt(class pb.Class, intel float64) float64 {
	switch class {
	case pb.Class_CLASS_WARRIOR, pb.Class_CLASS_ROGUE, pb.Class_CLASS_HUNTER:
		return 0
	case pb.Class_CLASS_PALADIN, pb.Class_CLASS_DRUID:
		return intel * 0.0167 / 100
	case pb.Class_CLASS_WARLOCK:
		return intel * 0.0165 / 100
	case pb.Class_CLASS_SHAMAN:
		return intel * 0.0169 / 100
	default:
		return intel * 0.0168 / 100
	}
}

func baseSpellCrit(class pb.Class) float64 {
	switch class {
	case pb.Class_CLASS_PALADIN:
		return 0.035
	case pb.Class_CLASS_HUNTER:
		return 0.036
	case pb.Class_CLASS_PRIEST:
		return 0.008
	case pb.Class_CLASS_SHAMAN:
		return 0.023
	case pb.Class_CLASS_MAGE:
		return 0.002
	case pb.Class_CLASS_WARLOCK:
		return 0.017
	case pb.Class_CLASS_DRUID:
		return 0.018
	default:
		return 0
	}
}

func defaultCastTime(ab clientdata.Ability) float64 {
	if ab.CastTime > 0 {
		return ab.CastTime
	}
	switch ab.ID {
	case "fireball", "starfire", "holy-fire":
		return 3.5
	case "frostbolt", "shadow-bolt", "lightning-bolt":
		return 3
	case "pyroblast", "soul-fire":
		return 6
	case "wrath":
		return 2
	case "mind-blast", "searing-pain":
		return 1.5
	case "immolate":
		return 2
	case "chain-lightning":
		return 2.5
	case "arcane-missiles":
		return 5
	default:
		return 0
	}
}

func isSpellAbility(ab clientdata.Ability) bool {
	if ab.DamageSP > 0 || ab.CastTime > 0 {
		return true
	}
	if ab.DamageWeapon > 0 || ab.DamageAP > 0 || ab.DumpRagePer > 0 {
		return false
	}
	if ab.Resource == "rage" || ab.Resource == "energy" {
		return false
	}
	if ab.Kind != "strike" || ab.DamageFlat <= 0 {
		return false
	}
	return true
}

func spellCoefficient(ab clientdata.Ability) float64 {
	if spec, ok := abilityDots[ab.ID]; ok && spec.directPortion == 0 && spec.directFlat == 0 {
		if spec.dotCoeff > 0 {
			return spec.dotCoeff
		}
		if ab.Duration > 0 {
			return math.Min(1.2, ab.Duration/15)
		}
	}
	if ab.DamageSP > 0 {
		return ab.DamageSP
	}
	if !isSpellAbility(ab) {
		return 0
	}
	cast := defaultCastTime(ab)
	if cast > 0 {
		return math.Min(1, cast/3.5)
	}
	return 1.5 / 3.5
}
