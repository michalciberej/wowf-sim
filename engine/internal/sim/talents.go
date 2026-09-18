package sim

import (
	"regexp"
	"strconv"
	"strings"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

func talentRank(ranks map[int32]int32, name string) int32 {
	if ranks == nil {
		return 0
	}
	key := clientdata.TalentNameKey(name)
	for id, rank := range ranks {
		t, ok := clientdata.TalentByID(id)
		if !ok {
			continue
		}
		if clientdata.TalentNameKey(t.Name) == key {
			return rank
		}
	}
	return 0
}

func talentAny(ranks map[int32]int32, names ...string) bool {
	for _, name := range names {
		if talentRank(ranks, name) > 0 {
			return true
		}
	}
	return false
}

func (f *fight) named(name string) int32 {
	return talentRank(f.ranks, name)
}

type genericTalents struct {
	damageMul  float64
	hasteMul   float64
	strMul     float64
	agiMul     float64
	intMul     float64
	meleeCrit  float64
	spellCrit  float64
	hit        float64
	spellHit   float64
	ohDmg      float64
	oneHandMul float64
	twoHandMul float64
	fireMul    float64
	frostMul   float64
	shadowMul  float64
	natureMul  float64
	holyMul    float64
	arcaneMul  float64
	abilityMul map[string]float64
}

func newGenericTalents() genericTalents {
	return genericTalents{
		damageMul:  1,
		hasteMul:   1,
		strMul:     1,
		agiMul:     1,
		intMul:     1,
		oneHandMul: 1,
		twoHandMul: 1,
		fireMul:    1,
		frostMul:   1,
		shadowMul:  1,
		natureMul:  1,
		holyMul:    1,
		arcaneMul:  1,
		abilityMul: map[string]float64{},
	}
}

var (
	pctRe            = regexp.MustCompile(`(?i)(\d+(?:\.\d+)?)%`)
	abilityDamageRe  = regexp.MustCompile(`(?i)increases the damage(?: and critical strike chance)?(?: done| dealt| caused)?(?: by| of)? your (.+?) (abilities|ability|spells|spell)\b`)
	schoolDamageRe   = regexp.MustCompile(`(?i)increases the damage done by your (.+?) spells\b`)
	allSpellsDmgRe   = regexp.MustCompile(`(?i)damage done by all your spells by (\d+(?:\.\d+)?)%`)
	statPctRe        = regexp.MustCompile(`(?i)(strength|agility|intellect) by (\d+(?:\.\d+)?)%`)
	attackSpeedRe    = regexp.MustCompile(`(?i)(?:attack speed|melee haste|ranged haste) by (\d+(?:\.\d+)?)%`)
)

func talentRankText(t clientdata.Talent, rank int32) string {
	if len(t.Ranks) == 0 || rank <= 0 {
		return ""
	}
	i := int(rank - 1)
	if i >= len(t.Ranks) {
		i = len(t.Ranks) - 1
	}
	return t.Ranks[i]
}

func firstPct(text string) float64 {
	m := pctRe.FindStringSubmatch(text)
	if m == nil {
		return 0
	}
	v, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return 0
	}
	return v / 100
}

func collectGenericTalents(class pb.Class, picks []*pb.TalentPick) genericTalents {
	out := newGenericTalents()
	if class == pb.Class_CLASS_WARRIOR {
		return out
	}
	for _, pick := range picks {
		if pick.GetRank() <= 0 {
			continue
		}
		talent, ok := clientdata.TalentByID(pick.GetId())
		if !ok {
			continue
		}
		if class != pb.Class_CLASS_UNSPECIFIED && talent.Class != int32(class) {
			continue
		}
		applyRankPassives(&out, talentRankText(talent, pick.GetRank()))
	}
	return out
}

func applyRankPassives(out *genericTalents, raw string) {
	if raw == "" {
		return
	}
	t := strings.ToLower(strings.ReplaceAll(raw, "\n", " "))
	if strings.Contains(t, "when activated") || strings.Contains(t, "your next ") {
		return
	}
	if strings.Contains(t, "after being the victim") || strings.Contains(t, "after blocking") {
		return
	}
	if strings.Contains(t, "your pet") || strings.Contains(t, "your pets") || strings.Contains(t, "summoned") {
		return
	}

	applyStatPcts(out, t)
	applyHaste(out, t)
	applyAbilityAndSchoolMuls(out, raw, t)

	if p := offHandDamagePct(t); p > 0 {
		out.ohDmg += p
	}
	if p := weaponHandPct(t, "one-handed"); p > 0 {
		out.oneHandMul *= 1 + p
	}
	if p := weaponHandPct(t, "two-handed"); p > 0 {
		out.twoHandMul *= 1 + p
	}

	if strings.Contains(t, "chance to hit") && !strings.Contains(t, "their chance to hit") {
		p := firstPct(t)
		if p > 0 && !strings.Contains(t, "trap") && !strings.Contains(t, "feign death") {
			spellOnly := strings.Contains(t, "spell") && !strings.Contains(t, "attack")
			if spellOnly {
				out.spellHit += p
			} else {
				out.hit += p
				if strings.Contains(t, "spell") {
					out.spellHit += p
				}
			}
		}
	}

	if !strings.Contains(t, "critical strike damage bonus") &&
		(strings.Contains(t, "critical strike chance") || strings.Contains(t, "chance to get a critical strike")) {
		if !narrowAbilityCrit(t) {
			p := firstPct(t)
			if p > 0 {
				melee := strings.Contains(t, "melee") || strings.Contains(t, "all attacks") || strings.Contains(t, "poisons") ||
					strings.Contains(t, "cat form") || strings.Contains(t, "bear form")
				spell := strings.Contains(t, "spell")
				if melee && !spell {
					out.meleeCrit += p
				} else if spell && !melee && !strings.Contains(t, "all attacks") {
					out.spellCrit += p
				} else {
					out.meleeCrit += p
					if spell || strings.Contains(t, "all attacks") {
						out.spellCrit += p
					}
				}
			}
		}
	}

	if allDamagePct(t) {
		if p := firstPct(t); p > 0 {
			out.damageMul *= 1 + p
		}
	}
}

func applyStatPcts(out *genericTalents, t string) {
	for _, m := range statPctRe.FindAllStringSubmatch(t, -1) {
		v, err := strconv.ParseFloat(m[2], 64)
		if err != nil || v <= 0 {
			continue
		}
		mul := 1 + v/100
		switch m[1] {
		case "strength":
			out.strMul *= mul
		case "agility":
			out.agiMul *= mul
		case "intellect":
			out.intMul *= mul
		}
	}
}

func applyHaste(out *genericTalents, t string) {
	if strings.Contains(t, " sec") {
		return
	}
	m := attackSpeedRe.FindStringSubmatch(t)
	if m == nil {
		return
	}
	v, err := strconv.ParseFloat(m[1], 64)
	if err != nil || v <= 0 {
		return
	}
	out.hasteMul *= 1 - v/100
}

func applyAbilityAndSchoolMuls(out *genericTalents, raw, t string) {
	if m := allSpellsDmgRe.FindStringSubmatch(t); m != nil {
		v, err := strconv.ParseFloat(m[1], 64)
		if err == nil && v > 0 {
			out.damageMul *= 1 + v/100
		}
	}
	if m := schoolDamageRe.FindStringSubmatch(t); m != nil {
		applySchoolList(out, m[1], firstPct(t))
		return
	}
	if m := abilityDamageRe.FindStringSubmatch(raw); m != nil {
		list := m[1]
		if applySchoolList(out, list, firstPct(t)) {
			return
		}
		p := firstPct(t)
		if p <= 0 {
			return
		}
		for _, name := range splitAbilityNames(list) {
			if id := abilityIDForName(name); id != "" {
				if cur := out.abilityMul[id]; cur == 0 {
					out.abilityMul[id] = 1 + p
				} else {
					out.abilityMul[id] = cur * (1 + p)
				}
			}
		}
	}
}

func applySchoolList(out *genericTalents, list string, p float64) bool {
	if p <= 0 {
		return false
	}
	key := strings.ToLower(list)
	applied := false
	if strings.Contains(key, "fire") {
		out.fireMul *= 1 + p
		applied = true
	}
	if strings.Contains(key, "frost") {
		out.frostMul *= 1 + p
		applied = true
	}
	if strings.Contains(key, "shadow") {
		out.shadowMul *= 1 + p
		applied = true
	}
	if strings.Contains(key, "nature") {
		out.natureMul *= 1 + p
		applied = true
	}
	if strings.Contains(key, "holy") && !strings.Contains(key, "unholy") {
		out.holyMul *= 1 + p
		applied = true
	}
	if strings.Contains(key, "arcane") {
		out.arcaneMul *= 1 + p
		applied = true
	}
	return applied && schoolOnlyList(key)
}

func schoolOnlyList(key string) bool {
	stripped := key
	for _, word := range []string{"fire", "frost", "shadow", "nature", "holy", "arcane", "and", "or", ",", " "} {
		stripped = strings.ReplaceAll(stripped, word, "")
	}
	return strings.TrimSpace(stripped) == ""
}

func splitAbilityNames(list string) []string {
	list = strings.ReplaceAll(list, ", and ", ",")
	list = strings.ReplaceAll(list, " and ", ",")
	parts := strings.Split(list, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		p = strings.TrimPrefix(p, "your ")
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func abilityIDForName(name string) string {
	key := clientdata.TalentNameKey(name)
	if key == "" {
		return ""
	}
	for _, ab := range clientdata.Abilities() {
		if clientdata.TalentNameKey(ab.Name) == key {
			return ab.ID
		}
	}
	return ""
}

func offHandDamagePct(t string) float64 {
	if !strings.Contains(t, "off-hand") && !strings.Contains(t, "offhand") {
		return 0
	}
	if !strings.Contains(t, "damage") {
		return 0
	}
	return firstPct(t)
}

func weaponHandPct(t, hand string) float64 {
	if !strings.Contains(t, hand) || !strings.Contains(t, "damage you deal") {
		return 0
	}
	return firstPct(t)
}

func narrowAbilityCrit(t string) bool {
	if strings.Contains(t, "all attacks") || strings.Contains(t, "all spells") || strings.Contains(t, "melee attacks") {
		return false
	}
	if strings.Contains(t, "fire spells") || strings.Contains(t, "frost spells") || strings.Contains(t, "arcane spells") || strings.Contains(t, "holy spells") || strings.Contains(t, "shadow spells") {
		return false
	}
	if strings.Contains(t, "spells and melee") || strings.Contains(t, "spells and attacks") {
		return false
	}
	if strings.Contains(t, "your critical") || strings.Contains(t, "your chance to get a critical") {
		return false
	}
	return strings.Contains(t, "your ")
}

func allDamagePct(t string) bool {
	if strings.Contains(t, "all damage you deal") || strings.Contains(t, "all damage dealt") {
		return true
	}
	return false
}

func (g genericTalents) weaponMul(twoHand bool) float64 {
	if twoHand {
		return g.twoHandMul
	}
	return g.oneHandMul
}
