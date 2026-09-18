//go:build !wasm

package clientdata

import _ "embed"

//go:embed catalog.json
var catalogJSON []byte
