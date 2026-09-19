package sim

import (
	"math"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

const (
	iconDeepWounds    = "ability_backstab"
	iconInstantPoison = "ability_poisons"
	iconDeadlyPoison  = "ability_rogue_dualweild"
)

type combatDot struct {
	id, name, icon string
	next, expire   float64
	period, tick   float64
	stacks         int
	spell          bool
}

type dotSpec struct {
	period        float64
	directFlat    float64
	directPortion float64
	dotCoeff      float64
	spell         bool
}

var abilityDots = map[string]dotSpec{
	"rend":             {period: 3, spell: false},
	"garrote":          {period: 3, spell: false},
	"rupture":          {period: 2, spell: false},
	"shadow-word-pain": {period: 3, spell: true, dotCoeff: 18.0 / 15},
	"corruption":       {period: 3, spell: true, dotCoeff: 18.0 / 15},
	"curse-of-agony":   {period: 2, spell: true, dotCoeff: 1.2},
	"siphon-life":      {period: 3, spell: true, dotCoeff: 1.0},
	"immolate":         {period: 3, spell: true, directFlat: 297.5, dotCoeff: 1},
	"serpent-sting":    {period: 3, spell: false},
	"insect-swarm":     {period: 2, spell: true, dotCoeff: 12.0 / 15},
	"moonfire":         {period: 3, spell: true, directPortion: 0.355, dotCoeff: 0.52},
	"flame-shock":      {period: 3, spell: true, directPortion: 0.5, dotCoeff: 0.5},
	"consecration":     {period: 1, spell: true, dotCoeff: 8.0 / 15},
	"deadly-poison":    {period: 2, spell: false},
	"deep-wounds":      {period: 3, spell: false},
}

func talentHandledLocally(id int32) bool {
	t, ok := clientdata.TalentByID(id)
	if !ok {
		return false
	}
	switch clientdata.TalentNameKey(t.Name) {
	case "improvedrend", "deepwounds", "impale",
		"improvedpoisons", "malice", "lethality", "opportunity", "serratedblades", "improvedambush",
		"improvedshadowwordpain", "spirittap", "shadowweaving",
		"improvedcorruption", "emberstorm", "shadowmastery", "improvedshadowbolt", "ruin", "darkness",
		"improvedmoonfire", "moonfury":
		return true
	default:
		return false
	}
}

func isChannel(id string) bool {
	return id == "mind-flay" || id == "arcane-missiles"
}

func isDotAbility(ab clientdata.Ability) bool {
	if isChannel(ab.ID) {
		return false
	}
	_, ok := abilityDots[ab.ID]
	return ok
}

func (f *fight) dotActive(id string) bool {
	for _, d := range f.dots {
		if d.id == id && f.t < d.expire-1e-9 {
			return true
		}
	}
	return false
}

func (f *fight) nextDotEvent() float64 {
	next := f.end
	for _, d := range f.dots {
		if d.next < next && d.next <= d.expire+1e-9 {
			next = d.next
		}
	}
	return next
}

func (f *fight) tickDots() {
	for i := 0; i < len(f.dots); {
		d := &f.dots[i]
		if d.next > f.t+1e-9 {
			i++
			continue
		}
		if d.next > d.expire+1e-9 {
			f.dots = append(f.dots[:i], f.dots[i+1:]...)
			continue
		}
		stacks := d.stacks
		if stacks < 1 {
			stacks = 1
		}
		dmg := d.tick * float64(stacks) * f.dmgMul() * f.talentMul(d.id)
		if d.spell {
			if f.spellMul > 0 {
				dmg *= f.spellMul
			}
			dmg *= f.schoolTaken(d.id)
		} else if f.physMul > 0 {
			dmg *= f.physMul
		}
		if dmg > 0 {
			f.recordTick(d.name, d.icon, dmg)
		}
		d.next += d.period
		if d.next > d.expire+1e-9 {
			f.dots = append(f.dots[:i], f.dots[i+1:]...)
			continue
		}
		i++
	}
}

func (f *fight) applyDot(id, name, icon string, total, duration, period float64, spell bool, stacks int) {
	if duration <= 0 || period <= 0 || total <= 0 {
		return
	}
	ticks := math.Floor(duration/period + 1e-9)
	if ticks < 1 {
		ticks = 1
	}
	if stacks < 1 {
		stacks = 1
	}
	per := total / ticks
	expire := f.t + duration
	for i := range f.dots {
		if f.dots[i].id != id {
			continue
		}
		next := f.dots[i].next
		if next <= f.t+1e-9 {
			next = f.t + period
		}
		f.dots[i] = combatDot{
			id: id, name: name, icon: icon,
			next: next, expire: expire, period: period, tick: per,
			stacks: stacks, spell: spell,
		}
		f.emitAura("dot", name, icon, duration)
		f.addAuraUptime(name, expire)
		return
	}
	f.dots = append(f.dots, combatDot{
		id: id, name: name, icon: icon,
		next: f.t + period, expire: expire, period: period, tick: per,
		stacks: stacks, spell: spell,
	})
	f.emitAura("dot", name, icon, duration)
	f.addAuraUptime(name, expire)
}

func (f *fight) applyAbilityDot(ab clientdata.Ability, combo int) (direct float64, applied bool) {
	spec, ok := abilityDots[ab.ID]
	if !ok {
		return 0, false
	}
	dur := ab.Duration
	if ab.ComboDurationPer > 0 {
		dur = ab.ComboDurationBase + ab.ComboDurationPer*float64(combo)
	}
	if ab.ID == "shadow-word-pain" {
		dur += 3 * float64(f.named("Improved Shadow Word Pain"))
	}
	period := spec.period
	if period <= 0 {
		period = 3
	}
	dotDmg := ab.DamageFlat
	if ab.ID == "rupture" {
		dotDmg = ruptureDamage(combo) + f.currentAP()*0.04*float64(combo)
	}
	if spec.directFlat > 0 {
		direct = spec.directFlat + f.spellPower*0.2
		if spec.dotCoeff > 0 {
			dotDmg = ab.DamageFlat + f.spellPower*spec.dotCoeff
		}
	} else if spec.directPortion > 0 {
		total := ab.DamageFlat
		if spec.spell {
			total += f.spellPower * spellCoefficient(ab)
		}
		direct = total * spec.directPortion
		dotDmg = total - direct
	} else if spec.spell {
		if spec.dotCoeff > 0 {
			dotDmg += f.spellPower * spec.dotCoeff
		} else {
			dotDmg += f.spellPower * math.Min(1, dur/15)
		}
	}
	f.applyDot(ab.ID, ab.Name, ab.Icon, dotDmg, dur, period, spec.spell, 1)
	return direct, true
}

func ruptureDamage(combo int) float64 {
	switch {
	case combo >= 5:
		return 786
	case combo == 4:
		return 594
	case combo == 3:
		return 426
	case combo == 2:
		return 282
	default:
		return 162
	}
}

func (f *fight) talentMul(id string) float64 {
	m := 1.0
	switch id {
	case "rend":
		switch f.named("Improved Rend") {
		case 1:
			m *= 1.15
		case 2:
			m *= 1.25
		case 3:
			m *= 1.35
		}
	case "shadow-word-pain", "mind-blast", "mind-flay", "vampiric-embrace":
		m *= 1 + 0.02*float64(f.named("Darkness"))
		if f.named("Shadow Weaving") > 0 {
			m *= 1 + 0.03*float64(f.named("Shadow Weaving"))
		}
	case "corruption", "curse-of-agony", "siphon-life", "shadow-bolt", "shadowburn":
		m *= 1 + 0.02*float64(f.named("Shadow Mastery"))
		if f.t < f.isbUntil {
			m *= 1 + 0.04*float64(f.named("Improved Shadow Bolt"))
		}
	case "immolate", "conflagrate":
		if id == "immolate" {
			m *= 1 + 0.05*float64(f.named("Emberstorm"))
		}
	case "serpent-sting":
		m *= 1 + 0.02*float64(f.named("Improved Stings"))
	case "moonfire", "starfire", "wrath":
		m *= 1 + 0.02*float64(f.named("Moonfury"))
		if id == "moonfire" {
			m *= 1 + 0.02*float64(f.named("Improved Moonfire"))
		}
	case "rupture":
		m *= 1 + 0.10*float64(f.named("Serrated Blades"))
	case "instant-poison", "deadly-poison":
		m *= 1 + 0.04*float64(f.named("Improved Poisons"))
	}
	if extra := f.abilityMul[id]; extra > 0 {
		m *= extra
	}
	return m
}

func (f *fight) critMultiplier(ab clientdata.Ability, spell, yellow bool) float64 {
	m := 2.0
	if spell {
		switch ab.ID {
		case "shadow-bolt", "immolate", "conflagrate", "shadowburn", "searing-pain", "soul-fire":
			if f.named("Ruin") > 0 {
				return 2.5
			}
		}
		return m
	}
	if yellow {
		m += 0.10 * float64(f.named("Impale"))
	}
	switch ab.ID {
	case "sinister-strike", "hemorrhage", "ghostly-strike", "mutilate", "backstab", "gouge":
		m += 0.06 * float64(f.named("Lethality"))
	}
	return m
}

func (f *fight) onPhysicalHit(crit, offHand bool) {
	if !offHand {
		f.procItems()
	}
	if crit {
		f.procFlurry(true)
	}
	if f.class == pb.Class_CLASS_WARRIOR {
		if crit {
			if r := f.named("Deep Wounds"); r > 0 {
				pct := 0.20 * float64(r)
				f.applyDot("deep-wounds", "Deep Wounds", iconDeepWounds, f.mhSwing()*pct, 12, 3, false, 1)
			}
		}
		f.unbridledWrath()
		if !offHand {
			f.procWeaponmasterExtra()
		}
	}
	if f.class != pb.Class_CLASS_ROGUE {
		return
	}
	chanceBonus := 0.02 * float64(f.named("Improved Poisons"))
	if offHand {
		if f.rng.Float64() < 0.30+chanceBonus {
			stacks := 1
			for i := range f.dots {
				if f.dots[i].id == "deadly-poison" {
					stacks = f.dots[i].stacks + 1
					if stacks > 5 {
						stacks = 5
					}
					break
				}
			}
			f.applyDot("deadly-poison", "Deadly Poison", iconDeadlyPoison, 136, 12, 2, false, stacks)
		}
		return
	}
	if f.rng.Float64() < 0.20+chanceBonus {
		raw := 58.0 * f.talentMul("instant-poison") * f.dmgMul()
		f.recordHit("Instant Poison", iconInstantPoison, raw, false, false)
	}
}

func (f *fight) maybeImprovedShadowBolt(ab clientdata.Ability, crit bool) {
	if !crit || ab.ID != "shadow-bolt" {
		return
	}
	ranks := f.named("Improved Shadow Bolt")
	if ranks <= 0 {
		return
	}
	if f.rng.Float64() < 0.20*float64(ranks) {
		f.isbUntil = f.t + 12
	}
}
