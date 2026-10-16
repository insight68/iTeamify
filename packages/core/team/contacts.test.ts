import { describe, expect, it } from "vitest";
import { buildTeamContacts } from "./contacts";

const members = [{ user_id: "me", name: "Me", avatar_url: null, role: "owner" as const }, { user_id: "alice", name: "Alice", avatar_url: null, role: "member" as const }, { user_id: "bob", name: "Bob", avatar_url: null, role: "member" as const }];
const agent = { id: "ai", name: "Assistant", description: "", avatar_url: null, owner_id: "me", permission_mode: "private" as const, invocation_targets: [], archived_at: null };

describe("team contact ordering", () => {
  it("mixes members and AI by actual message time and keeps unused contacts last", () => {
    const contacts = buildTeamContacts(members, [agent], [
      { target_type: "member", target_id: "alice", last_contact_at: "2026-10-09T01:00:00.100Z", resume_session_id: null, has_unread: true },
      { target_type: "agent", target_id: "ai", last_contact_at: "2026-10-09T01:00:00.200Z", resume_session_id: "recent", has_unread: false },
    ], "me");
    expect(contacts.map((c) => c.id)).toEqual(["ai", "alice", "bob"]);
    expect(contacts[0]?.resume_session_id).toBe("recent");
    expect(contacts[1]?.has_unread).toBe(true);
  });
  it("excludes self, archived agents, and agents the user can view but cannot invoke", () => {
    expect(buildTeamContacts(members, [{ ...agent, owner_id: "someone" }, { ...agent, id: "archived", archived_at: "2026-10-08T00:00:00Z" }], [], "me").map((c) => c.id)).toEqual(["alice", "bob"]);
  });
  it("keeps a deterministic tie order and does not mutate cached arrays", () => {
    const original = [...members].reverse();
    const order = original.map((m) => m.user_id);
    expect(buildTeamContacts(original, [agent], [], "me").map((c) => c.name)).toEqual(["Alice", "Assistant", "Bob"]);
    expect(original.map((m) => m.user_id)).toEqual(order);
  });
});
