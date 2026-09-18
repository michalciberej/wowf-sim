//go:build wasm

package clientdata

import _ "embed"

//go:embed catalog.slim.json
var catalogJSON []byte
