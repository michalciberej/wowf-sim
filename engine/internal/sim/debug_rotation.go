package sim

import (
	"fmt"
	"io"
)

// rotationLog is CLI debug only. The WASM product build never sets this.
var rotationLog io.Writer

func SetRotationLog(w io.Writer) {
	rotationLog = w
}

func logRotation(t float64, name, resource string, amount float64) {
	if rotationLog == nil {
		return
	}
	if resource == "" {
		fmt.Fprintf(rotationLog, "%7.2f  %s\n", t, name)
		return
	}
	fmt.Fprintf(rotationLog, "%7.2f  %-24s  %s=%.0f\n", t, name, resource, amount)
}
