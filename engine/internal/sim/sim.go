package sim

import (
	"math"
	"math/rand"

	pb "wowf-sim/engine/gen/wowfsim"
)

// Run executes iterations of a placeholder combat model.
// Spell/item numbers will later come from extracted Forever client tables,
// not from hardcoded constants in this package.
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

	seed := req.GetOptions().GetRngSeed()
	rng := rand.New(rand.NewSource(seedOrDefault(seed)))

	baseDPS := classBaseline(req.GetPlayer().GetClass())
	if req.GetPlayer().GetRace() == pb.Race_RACE_ORC {
		baseDPS *= 1.02
	}

	samples := make([]float64, iterations)
	var autoHits, heroicCasts int64
	var sum, sumSq float64
	minDPS, maxDPS := math.Inf(1), math.Inf(-1)

	swingTimer := 2.4
	heroicShare := 0.22

	for i := 0; i < iterations; i++ {
		elapsed := 0.0
		damage := 0.0
		for elapsed < duration {
			swing := swingTimer * (0.95 + rng.Float64()*0.1)
			hit := baseDPS * swing
			if rng.Float64() < 0.18 {
				hit *= 2
			}
			damage += hit
			autoHits++
			if rng.Float64() < 0.35 {
				damage += hit * heroicShare
				heroicCasts++
			}
			elapsed += swing
		}
		dps := damage / duration
		samples[i] = dps
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

	return &pb.SimResult{
		DpsMean:    mean,
		DpsStdev:   math.Sqrt(variance),
		DpsMin:     minDPS,
		DpsMax:     maxDPS,
		Iterations: int32(iterations),
		Actions: []*pb.ActionMetric{
			{Name: "Auto Attack", Dps: mean * (1 - heroicShare), Casts: autoHits / int64(iterations)},
			{Name: "Heroic Strike", Dps: mean * heroicShare, Casts: heroicCasts / int64(iterations)},
		},
	}
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
		return 180
	case pb.Class_CLASS_ROGUE:
		return 175
	case pb.Class_CLASS_HUNTER:
		return 165
	case pb.Class_CLASS_MAGE:
		return 160
	default:
		return 150
	}
}
