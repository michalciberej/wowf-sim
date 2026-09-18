package main

import (
	"encoding/json"
	"fmt"
	"os"

	"google.golang.org/protobuf/encoding/prototext"
	"google.golang.org/protobuf/proto"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/sim"
)

func main() {
	debugRotation := false
	statWeights := false
	var path string
	for _, arg := range os.Args[1:] {
		if arg == "--debug-rotation" {
			debugRotation = true
			continue
		}
		if arg == "--stat-weights" {
			statWeights = true
			continue
		}
		path = arg
	}

	req := sim.TypicalOrcWarrior()

	if path != "" {
		raw, err := os.ReadFile(path)
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

	if statWeights {
		out := sim.RunStatWeights(req)
		weights := map[string]float64{}
		for _, w := range out.Weights {
			weights[w.Id] = w.Ep
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(weights); err != nil {
			fatal(err)
		}
		fmt.Fprintf(os.Stderr, "baseline %.1f DPS  n=%d  ref=%s\n", out.BaselineDps, out.Iterations, out.ReferenceId)
		return
	}

	if debugRotation {
		if req.Options == nil {
			req.Options = &pb.SimOptions{RngSeed: 1}
		}
		req.Options.Iterations = 1
		sim.SetRotationLog(os.Stdout)
		fmt.Fprintln(os.Stdout, "time     ability                   resource")
		defer sim.SetRotationLog(nil)
	}

	res := sim.Run(req)
	if debugRotation {
		fmt.Fprintf(os.Stderr, "DPS  %.1f  (debug rotation, n=1)\n", res.DpsMean)
		return
	}
	fmt.Printf("DPS  %.1f ± %.1f  (n=%d)\n", res.DpsMean, res.DpsStdev, res.Iterations)
	for _, a := range res.Actions {
		fmt.Printf("  %-16s  %.1f dps  %.0f casts/iter\n", a.Name, a.Dps, a.Casts)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
