package execenv

import (
	"crypto/sha256"
	"encoding/hex"
)

// profileStoreNamespace maps a daemon's profile to the directory segment that
// isolates its persistent session stores from another profile-daemon's when
// several run on the same machine sharing one user home (profiles get separate
// daemon state but the same HOME). Each daemon writes under, and only ever
// reclaims, its own namespace, so a staging daemon's GC can never delete a
// production task's live store and vice versa.
//
// The map MUST be collision-free (distinct profiles are distinct daemons and
// must never share a namespace) AND fixed-length (a profile can be as long as a
// filesystem segment allows, ~255 bytes, so any length-expanding encoding would
// overflow the 255-byte limit and fail to create the store dir). A lossy "drop
// unsafe characters" scheme collides ("" vs "default", "staging.prod" vs
// "stagingprod"); a full hex encoding doubles the length and overflows. So the
// empty (default) profile gets a reserved bare literal, and every named profile
// is the hex of its SHA-256 — a constant 64 hex chars, filesystem-safe and
// collision-resistant — under a "p_" prefix the bare literal can never collide
// with (MUL-4424).
//
// Codex session stores hang off a user-home path reachable by every daemon
// profile on the machine, so each profile needs its own namespace.
func profileStoreNamespace(profile string) string {
	if profile == "" {
		return "default"
	}
	sum := sha256.Sum256([]byte(profile))
	return "p_" + hex.EncodeToString(sum[:])
}
