package main

import (
	"fmt"
	"os"

	"google.golang.org/protobuf/encoding/prototext"
	"google.golang.org/protobuf/proto"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/sim"
)

func main() {
	req := &pb.SimRequest{
		Player: &pb.Player{
			Name:  "Stub",
			Class: pb.Class_CLASS_WARRIOR,
			Race:  pb.Race_RACE_ORC,
			Level: 60,
		},
		Encounter: &pb.Encounter{DurationSeconds: 60},
		Options:   &pb.SimOptions{Iterations: 1000, RngSeed: 1},
	}

	if len(os.Args) > 1 {
		raw, err := os.ReadFile(os.Args[1])
		if err != nil {
			fatal(err)
		}
		req = &pb.SimRequest{}
		if err := prototext.Unmarshal(raw, req); err != nil {
			if err := proto.Unmarshal(raw, req); err != nil {
				fatal(err)
			}
		}
	}

	res := sim.Run(req)
	fmt.Printf("DPS  %.1f ± %.1f  (n=%d)\n", res.DpsMean, res.DpsStdev, res.Iterations)
	for _, a := range res.Actions {
		fmt.Printf("  %-16s  %.1f dps  %d casts/iter\n", a.Name, a.Dps, a.Casts)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
