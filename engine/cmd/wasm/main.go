//go:build js && wasm

package main

import (
	"syscall/js"

	"google.golang.org/protobuf/proto"

	pb "wowf-sim/engine/gen/wowfsim"
	"wowf-sim/engine/internal/sim"
)

func runSim(_ js.Value, args []js.Value) any {
	if len(args) != 1 {
		return jsError("wowfSimRun expects a Uint8Array")
	}

	in := make([]byte, args[0].Get("byteLength").Int())
	js.CopyBytesToGo(in, args[0])

	req := &pb.SimRequest{}
	if err := proto.Unmarshal(in, req); err != nil {
		return jsError(err.Error())
	}

	out, err := proto.Marshal(sim.Run(req))
	if err != nil {
		return jsError(err.Error())
	}

	dst := js.Global().Get("Uint8Array").New(len(out))
	js.CopyBytesToJS(dst, out)
	return dst
}

func jsError(msg string) js.Value {
	return js.Global().Get("Error").New(msg)
}

func main() {
	js.Global().Set("wowfSimRun", js.FuncOf(runSim))
	if ready := js.Global().Get("wowfSimReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}
	select {}
}
