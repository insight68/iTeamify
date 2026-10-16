import type { QueryClient } from "@tanstack/react-query";
import type { MemberWithUser, User } from "../types";

export const currentUserKey = (userId: string) => ["me", userId] as const;
let client: QueryClient | undefined;

/** Auth publishes verified session receipts into the shared server cache. */
export function registerCurrentUserCache(queryClient: QueryClient) {
  client = queryClient;
  return () => { if (client === queryClient) client = undefined; };
}

export function publishCurrentUser(user: User): User {
  if (!client || !user.id) return user;
  const saved = client.getQueryData<User>(currentUserKey(user.id));
  if (saved) {
    const oldTime = Date.parse(saved.updated_at);
    const newTime = Date.parse(user.updated_at);
    const fraction = (time: string) => Number((time.match(/\.(\d+)/)?.[1] ?? "").padEnd(9, "0").slice(0, 9));
    if (oldTime > newTime || (oldTime === newTime && fraction(saved.updated_at) > fraction(user.updated_at))) return saved;
  }
  client.setQueryData(currentUserKey(user.id), user);
  client.setQueriesData<MemberWithUser[]>({
    predicate: (query) => query.queryKey[0] === "workspaces" && query.queryKey[2] === "members",
  }, (members) => members?.map((member) => member.user_id === user.id ? {
    ...member, name: user.name, avatar_url: user.avatar_url, profile_description: user.profile_description,
  } : member));
  return user;
}
