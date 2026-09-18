package sim

import (
	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/clientdata"
)

// TypicalOrcWarrior is the UI starting setup: T2-ish raid gear, default raid
// buffs, no talents. Used to bake default stat weights.
func TypicalOrcWarrior() *pb.SimRequest {
	gearIDs := []struct {
		id   int32
		slot pb.ItemSlot
	}{
		{16963, pb.ItemSlot_ITEM_SLOT_HEAD},
		{18404, pb.ItemSlot_ITEM_SLOT_NECK},
		{16961, pb.ItemSlot_ITEM_SLOT_SHOULDER},
		{18541, pb.ItemSlot_ITEM_SLOT_BACK},
		{16966, pb.ItemSlot_ITEM_SLOT_CHEST},
		{19146, pb.ItemSlot_ITEM_SLOT_WRIST},
		{16964, pb.ItemSlot_ITEM_SLOT_HANDS},
		{19137, pb.ItemSlot_ITEM_SLOT_WAIST},
		{16962, pb.ItemSlot_ITEM_SLOT_LEGS},
		{19387, pb.ItemSlot_ITEM_SLOT_FEET},
		{18821, pb.ItemSlot_ITEM_SLOT_FINGER_1},
		{17063, pb.ItemSlot_ITEM_SLOT_FINGER_2},
		{11815, pb.ItemSlot_ITEM_SLOT_TRINKET_1},
		{19406, pb.ItemSlot_ITEM_SLOT_TRINKET_2},
		{19019, pb.ItemSlot_ITEM_SLOT_MAIN_HAND},
		{18805, pb.ItemSlot_ITEM_SLOT_OFF_HAND},
		{17069, pb.ItemSlot_ITEM_SLOT_RANGED},
	}
	items := make([]*pb.EquippedItem, 0, len(gearIDs))
	for _, row := range gearIDs {
		item, ok := clientdata.ItemByID(row.id)
		if !ok {
			continue
		}
		items = append(items, &pb.EquippedItem{
			Id:              item.ID,
			Name:            item.Name,
			Slot:            row.slot,
			WeaponDps:       item.WeaponDps,
			AttackSpeedMs:   item.AttackSpeedMs,
			Strength:        item.Strength,
			Agility:         item.Agility,
			AttackPower:     item.AttackPower,
			CritChance:      item.CritChance,
			HitChance:       item.HitChance,
			ItemSubclass:    item.ItemSubclass,
			Hand:            item.Hand,
			Intellect:       item.Intellect,
			SpellPower:      item.SpellPower,
			SpellCritChance: item.SpellCritChance,
			SpellHitChance:  item.SpellHitChance,
		})
	}
	return &pb.SimRequest{
		Player: &pb.Player{
			Name:   "Warrior",
			Class:  pb.Class_CLASS_WARRIOR,
			Race:   pb.Race_RACE_ORC,
			Level:  60,
			Stance: pb.WarriorStance_WARRIOR_STANCE_BERSERKER,
			Gear:   &pb.Gear{Items: items},
			RaidBuffs: []string{
				"blessing-of-kings",
				"blessing-of-might",
				"gift-of-the-wild",
				"arcane-intellect",
				"battle-shout",
				"strength-of-earth",
				"grace-of-air",
				"windfury-totem",
				"sunder-armor",
				"faerie-fire",
				"curse-of-recklessness",
				"curse-of-elements",
				"curse-of-shadow",
			},
		},
		Encounter: &pb.Encounter{DurationSeconds: 60},
		Options:   &pb.SimOptions{Iterations: 800, RngSeed: 1},
	}
}
