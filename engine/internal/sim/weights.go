package sim

import (
	"sort"

	"google.golang.org/protobuf/proto"

	pb "wowf-sim/engine/gen/wowfsim"
)

type weighStat struct {
	id, name string
	mod      float64
	apply    func(b *pb.BonusStats, amount float64)
}

// RunStatWeights follows the WowSims method: one baseline fight, then ±mod of
// each class-relevant stat with the same RNG seed. DPS/stat is the central
// difference; EP is that value divided by the class reference (AP or SP).
func RunStatWeights(req *pb.SimRequest) *pb.StatWeightsResult {
	if req == nil {
		req = &pb.SimRequest{}
	}
	base := proto.Clone(req).(*pb.SimRequest)
	if base.Player == nil {
		base.Player = &pb.Player{}
	}
	base.Player.BonusStats = nil
	if base.Options == nil {
		base.Options = &pb.SimOptions{}
	}
	iters := int(base.Options.GetIterations())
	if iters <= 0 {
		iters = 400
	}
	if iters > 1 {
		iters = iters / 2
	}
	if iters < 80 {
		iters = 80
	}
	base.Options.Iterations = int32(iters)
	if base.Options.RngSeed == 0 {
		base.Options.RngSeed = 1
	}

	stats := statsToWeigh(base.Player)
	baseline := Run(base)
	out := &pb.StatWeightsResult{
		BaselineDps: baseline.DpsMean,
		Iterations:  int32(iters),
	}
	if len(stats) == 0 {
		return out
	}
	out.ReferenceId = stats[0].id
	out.ReferenceName = stats[0].name

	weights := make([]*pb.StatWeight, 0, len(stats))
	var refDPS float64
	for i, st := range stats {
		high := proto.Clone(base).(*pb.SimRequest)
		low := proto.Clone(base).(*pb.SimRequest)
		high.Player.BonusStats = &pb.BonusStats{}
		low.Player.BonusStats = &pb.BonusStats{}
		st.apply(high.Player.BonusStats, st.mod)
		st.apply(low.Player.BonusStats, -st.mod)
		dpsHigh := Run(high).DpsMean
		dpsLow := Run(low).DpsMean
		dpsPer := (dpsHigh - dpsLow) / (2 * st.mod)
		if i == 0 {
			refDPS = dpsPer
		}
		ep := 0.0
		if refDPS != 0 {
			ep = dpsPer / refDPS
		}
		weights = append(weights, &pb.StatWeight{
			Id:   st.id,
			Name: st.name,
			Dps:  dpsPer,
			Ep:   ep,
		})
	}
	sort.SliceStable(weights, func(i, j int) bool {
		if weights[i].Id == out.ReferenceId {
			return true
		}
		if weights[j].Id == out.ReferenceId {
			return false
		}
		return weights[i].Ep > weights[j].Ep
	})
	out.Weights = weights
	return out
}

func statsToWeigh(player *pb.Player) []weighStat {
	ranks := talentRankMap(player.GetTalents())
	melee := usesMeleeAutos(player.GetClass(), ranks)
	spell := !melee
	switch player.GetClass() {
	case pb.Class_CLASS_PALADIN, pb.Class_CLASS_SHAMAN, pb.Class_CLASS_DRUID:
		spell = true
	}
	out := make([]weighStat, 0, 10)
	if melee {
		out = append(out,
			weighStat{id: "attack-power", name: "Attack Power", mod: 20, apply: func(b *pb.BonusStats, n float64) { b.AttackPower = n }},
			weighStat{id: "strength", name: "Strength", mod: 20, apply: func(b *pb.BonusStats, n float64) { b.Strength = n }},
			weighStat{id: "agility", name: "Agility", mod: 20, apply: func(b *pb.BonusStats, n float64) { b.Agility = n }},
			weighStat{id: "melee-crit", name: "Melee Crit (1%)", mod: 2, apply: func(b *pb.BonusStats, n float64) { b.CritChance = n / 100 }},
			weighStat{id: "melee-hit", name: "Melee Hit (1%)", mod: 2, apply: func(b *pb.BonusStats, n float64) { b.HitChance = n / 100 }},
			weighStat{id: "weapon-dps", name: "Weapon DPS", mod: 5, apply: func(b *pb.BonusStats, n float64) { b.WeaponDps = n }},
		)
	} else {
		out = append(out, weighStat{
			id: "spell-power", name: "Spell Power", mod: 20,
			apply: func(b *pb.BonusStats, n float64) { b.SpellPower = n },
		})
	}
	if spell {
		if melee {
			out = append(out, weighStat{
				id: "spell-power", name: "Spell Power", mod: 20,
				apply: func(b *pb.BonusStats, n float64) { b.SpellPower = n },
			})
		}
		out = append(out,
			weighStat{id: "intellect", name: "Intellect", mod: 20, apply: func(b *pb.BonusStats, n float64) { b.Intellect = n }},
			weighStat{id: "spell-crit", name: "Spell Crit (1%)", mod: 2, apply: func(b *pb.BonusStats, n float64) { b.SpellCritChance = n / 100 }},
			weighStat{id: "spell-hit", name: "Spell Hit (1%)", mod: 2, apply: func(b *pb.BonusStats, n float64) { b.SpellHitChance = n / 100 }},
		)
	}
	return out
}
