package sim

import (
	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

const (
	// bossArmor is a level-63 raid dummy in plate (same default Classic sims use).
	// Sunder / Faerie Fire / Curse of Recklessness subtract from this, then
	// physical damage is scaled by taken(remaining) / taken(full).
	bossArmor      = 3731.0
	iconWindfury   = "spell_nature_windfury"
	windfuryChance = 0.20
)

type raidBuffState struct {
	str, agi, intel, ap, spellPower float64
	meleeCrit, spellCrit            float64
	hit, spellHit                   float64
	statMul, apMul, damageMul       float64
	armorLost                       float64
	fireMul, frostMul, shadowMul    float64
	natureMul, holyMul              float64
	windfury                        bool
	wfAP                            float64
}

func collectRaidBuffs(player *pb.Player) raidBuffState {
	st := raidBuffState{
		statMul: 1, apMul: 1, damageMul: 1,
		fireMul: 1, frostMul: 1, shadowMul: 1, natureMul: 1, holyMul: 1,
	}
	class := int32(player.GetClass())
	for _, id := range player.GetRaidBuffs() {
		b, ok := clientdata.RaidBuffByID(id)
		if !ok || !b.AppliesTo(class) {
			continue
		}
		st.str += b.Strength
		st.agi += b.Agility
		st.intel += b.Intellect
		st.ap += b.AttackPower
		st.spellPower += b.SpellPower
		st.meleeCrit += b.MeleeCrit
		st.spellCrit += b.SpellCrit
		st.hit += b.HitChance
		st.spellHit += b.SpellHit
		st.statMul *= 1 + b.StatMul
		st.apMul *= 1 + b.APMul
		st.damageMul *= 1 + b.DamageMul
		st.armorLost += b.Armor
		st.fireMul *= 1 + b.FireMul
		st.frostMul *= 1 + b.FrostMul
		st.shadowMul *= 1 + b.ShadowMul
		st.natureMul *= 1 + b.NatureMul
		st.holyMul *= 1 + b.HolyMul
		if b.Windfury {
			st.windfury = true
			if b.WindfuryAP > st.wfAP {
				st.wfAP = b.WindfuryAP
			}
		}
	}
	return st
}

func physicalTaken(armor float64) float64 {
	if armor < 0 {
		armor = 0
	}
	mit := armor / (armor + 400 + 85*playerLevel)
	return 1 - mit
}

func spellSchool(id string) string {
	switch id {
	case "shadow-bolt", "corruption", "curse-of-agony", "siphon-life", "shadowburn",
		"shadow-word-pain", "mind-blast", "mind-flay", "vampiric-embrace":
		return "shadow"
	case "fireball", "fire-blast", "scorch", "pyroblast", "immolate", "conflagrate",
		"searing-pain", "soul-fire", "flame-shock":
		return "fire"
	case "frostbolt", "frost-shock":
		return "frost"
	case "lightning-bolt", "chain-lightning", "earth-shock", "wrath", "starfire", "moonfire", "insect-swarm":
		return "nature"
	case "holy-strike", "judgement", "consecration", "exorcism", "hammer-of-wrath":
		return "holy"
	default:
		return ""
	}
}
