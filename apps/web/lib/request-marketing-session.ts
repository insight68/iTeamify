import { cookies } from "next/headers";
import {
  resolveMarketingSession,
  type MarketingSession,
} from "./marketing-session";

export async function getRequestMarketingSession(): Promise<MarketingSession> {
  const cookieStore = await cookies();
  return resolveMarketingSession({
    hasSession: cookieStore.has("iteamify_logged_in"),
    lastWorkspaceSlug: cookieStore.get("last_workspace_slug")?.value,
  });
}
