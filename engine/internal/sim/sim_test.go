package sim

import "testing"

func TestRunProducesDps(t *testing.T) {
	res := Run(nil)
	if res.Iterations != 1000 {
		t.Fatalf("iterations = %d", res.Iterations)
	}
	if res.DpsMean <= 0 {
		t.Fatalf("expected positive dps, got %f", res.DpsMean)
	}
}
