import { useEffect, useRef } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/data/workspace-store";
import { inboxListOptions } from "@/data/queries/inbox";
import { useMarkInboxRead } from "@/data/mutations/inbox";
import { getInboxDisplayTitle } from "@/lib/inbox-display";
import { inboxNoticeDetails, inboxNoticeLabel } from "@/lib/inbox-notice";

export default function InboxNotice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((state) => state.currentWorkspaceSlug);
  const { data, isLoading, error, refetch } = useQuery(inboxListOptions(wsId));
  // Select the raw notification by identity, not the deduplicated issue row.
  const item = data?.find((entry) => entry.id === id && entry.workspace_id === wsId);
  const markRead = useMarkInboxRead();
  const attempted = useRef<string | null>(null);
  useEffect(() => {
    if (!item || item.read || attempted.current === item.id) return;
    attempted.current = item.id;
    markRead.mutate(item.id);
  }, [item, markRead]);

  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator /></View>;
  if (!item) return <View className="flex-1 items-center justify-center bg-background p-6 gap-3">
    <Text>{error ? "Could not load this notification." : "This notification is no longer available."}</Text>
    <Button variant="outline" onPress={() => { void refetch(); }}><Text>Retry</Text></Button>
    <Button variant="ghost" onPress={() => { if (wsSlug) router.replace(`/${wsSlug}/inbox`); }}><Text>Back to inbox</Text></Button>
  </View>;
  return <ScrollView className="flex-1 bg-background" contentContainerClassName="p-5 gap-4">
    <Text className="text-sm text-muted-foreground">{inboxNoticeLabel(item)}</Text>
    <Text className="text-xl font-semibold" selectable>{getInboxDisplayTitle(item)}</Text>
    {item.created_at ? <Text className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</Text> : null}
    {inboxNoticeDetails(item).map((detail) => <Text key={detail} className="text-base" selectable>{detail}</Text>)}
    {item.details?.original_prompt && item.details.original_prompt !== getInboxDisplayTitle(item) ? <View className="rounded-lg bg-secondary p-4 gap-2"><Text className="text-sm text-muted-foreground">Original request</Text><Text selectable>{item.details.original_prompt}</Text></View> : null}
    {item.issue_id && wsSlug ? <Button variant="outline" onPress={() => router.push(`/${wsSlug}/issue/${item.issue_id}`)}><Text>Open issue</Text></Button> : null}
  </ScrollView>;
}
