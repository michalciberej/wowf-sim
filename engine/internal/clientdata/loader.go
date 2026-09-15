package clientdata

// Loader will ingest Forever client tables (DBC/DB2, Spell, Item, etc.)
// and expose them to the engine. The UI never talks to these files
// directly — the engine consumes extracted, versioned datasets.
type Loader struct {
	Root string
}

func (l *Loader) Load() error {
	if l.Root == "" {
		return nil
	}
	return nil
}
