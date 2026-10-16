import { canInvokeAgent } from "../permissions/rules";
import type { Agent, MemberWithUser } from "../types";
import type { TeamActivity, TeamContact } from "./types";

type TeamMember = Pick<MemberWithUser, "user_id" | "name" | "avatar_url" | "role" | "profile_description">;
type TeamAgent = Pick<Agent,
  "id" | "name" | "description" | "avatar_url" | "archived_at" | "owner_id" |
  "permission_mode" | "invocation_targets"
>;

export function buildTeamContacts(
  members: readonly TeamMember[],
  agents: readonly TeamAgent[],
  activity: readonly TeamActivity[],
  userId: string | null,
): TeamContact[] {
  const currentMember = members.find((m) => m.user_id === userId);
  const recent = new Map(activity.map((a) => [`${a.target_type}:${a.target_id}`, a]));
  const contacts: TeamContact[] = [];
  const append = (type: TeamContact["type"], id: string, name: string, avatar_url: string | null, description: string | undefined) => {
    const a = recent.get(`${type}:${id}`);
    contacts.push({
      type, id, name, avatar_url, description: description?.trim() ?? "",
      last_contact_at: a?.last_contact_at ?? null,
      resume_session_id: a?.resume_session_id ?? null,
      has_unread: a?.has_unread === true,
    });
  };
  for (const m of members) if (m.user_id !== userId) append("member", m.user_id, m.name, m.avatar_url, m.profile_description);
  for (const a of agents) {
    if (!a.archived_at && canInvokeAgent(a, { userId, role: currentMember?.role ?? null }).allowed) {
      append("agent", a.id, a.name, a.avatar_url, a.description);
    }
  }
  return contacts.sort((a, b) => {
    const delta = (b.last_contact_at ? Date.parse(b.last_contact_at) : 0)
      - (a.last_contact_at ? Date.parse(a.last_contact_at) : 0);
    return delta || a.name.localeCompare(b.name) || `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
  });
}
