"use client";

import { deferredFeature } from "../../common/deferred-feature";
import type { ChatMessageListProps } from "./chat-message-list";

const MessageList = deferredFeature(() =>
  import("./chat-message-list").then((module) => ({ default: module.ChatMessageList })),
);

/** Only conversations with messages need the rich transcript renderer. */
export function DeferredChatMessageList(props: ChatMessageListProps) {
  return <MessageList {...props} presentation="inline" />;
}
