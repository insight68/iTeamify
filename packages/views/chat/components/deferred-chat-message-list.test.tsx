import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/i18n";
import { DeferredChatMessageList } from "./deferred-chat-message-list";

const gate = vi.hoisted(() => ({ resolve: () => {}, started: vi.fn(), mounted: vi.fn() }));

vi.mock("./chat-message-list", async () => {
  gate.started();
  await new Promise<void>((resolve) => { gate.resolve = resolve; });
  const { useEffect } = await import("react");
  return {
    ChatMessageList: ({ messages, onLoadOlderMessages }: { messages: { content: string }[]; onLoadOlderMessages?: () => void }) => {
      useEffect(() => { gate.mounted(); }, []);
      return <div>{messages.map((message) => message.content).join(" ")}<button onClick={onLoadOlderMessages}>Older</button></div>;
    },
  };
});

it("renders the latest messages when a cold renderer arrives and keeps its pagination callback", async () => {
  expect(gate.started).not.toHaveBeenCalled();
  const onOlder = vi.fn();
  const message = { id: "message", chat_session_id: "session", task_id: null, role: "user" as const, content: "Earlier", created_at: "2026-10-09T00:00:00Z" };
  const view = renderWithI18n(<DeferredChatMessageList messages={[message]} pendingTask={null} availability={undefined} onLoadOlderMessages={onOlder} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  view.rerender(<DeferredChatMessageList messages={[{ ...message, content: "Latest" }]} pendingTask={null} availability={undefined} onLoadOlderMessages={onOlder} />);
  await waitFor(() => expect(gate.started).toHaveBeenCalledTimes(1));
  await act(async () => { gate.resolve(); });
  await screen.findByText("Latest");
  expect(screen.queryByText("Earlier")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Older" }));
  expect(onOlder).toHaveBeenCalledTimes(1);
  expect(gate.mounted).toHaveBeenCalledTimes(1);
});
