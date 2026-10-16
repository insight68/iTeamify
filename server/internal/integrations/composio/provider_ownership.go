package composio

import "strings"

// nativeOwnedToolkits is the single source of truth for providers iTeamify owns
// end-to-end. Composio remains the long-tail catalog, but cannot start a second
// official connection path for these slugs. Existing legacy rows remain
// listable/disconnectable so this policy change never strands a user grant.
var nativeOwnedToolkits = map[string]struct{}{
	"feishu": {},
	"github": {},
	"gitlab": {},
	"gmail":  {},
	"lark":   {},
	"slack":  {},
}

func IsNativeOwnedToolkit(slug string) bool {
	_, owned := nativeOwnedToolkits[strings.ToLower(strings.TrimSpace(slug))]
	return owned
}
