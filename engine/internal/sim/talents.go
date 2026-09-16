package sim

import "wowf-sim/engine/internal/clientdata"

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
