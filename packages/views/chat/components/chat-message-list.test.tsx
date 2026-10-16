import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { chatKeys } from "@iteamify/core/chat/queries";
import type { TaskMessagePayload } from "@iteamify/core/types";
import type { ReactElement } from "react";
import enChat from "../../locales/en/chat.json";
import enConnections from "../../locales/en/connections.json";
import { outboundEmailsOptions } from "@iteamify/core/gmail";

const mockScrollToIndex = vi.hoisted(() => vi.fn());

interface MockVirtuosoProps {
  data: unknown[];
  firstItemIndex?: number;
  itemContent: (i: number, item: unknown) => ReactElement;
  computeItemKey: (i: number, item: unknown) => string;
  components?: { Footer?: (p: { context?: unknown }) => ReactElement | null };
  context?: unknown;
  rangeChanged?: (range: { startIndex: number; endIndex: number }) => void;
}

// The live timeline is a real list row rather than Virtuoso chrome (MUL-4922),
// so it shares one identity with the persisted assistant row and keeps its
// Mermaid/HTML blocks mounted across task completion. Real react-virtuoso
// renders its Footer but NO data rows under jsdom's zero-height viewport, so
// these tests must stub it to see rows at all. computeItemKey is still applied
// here — it is what expresses the live -> persisted identity.
vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  const Virtuoso = React.forwardRef<
    { scrollToIndex: (location: unknown) => void },
    MockVirtuosoProps
  >(function MockVirtuoso(
    {
      data,
      firstItemIndex = 0,
      itemContent,
      computeItemKey,
      components,
      context,
      rangeChanged,
    },
    ref,
  ) {
    React.useImperativeHandle(ref, () => ({ scrollToIndex: mockScrollToIndex }));
    React.useEffect(() => {
      if (!rangeChanged || data.length === 0) return;
      const localStart = Math.min(2, data.length - 1);
      rangeChanged({
        startIndex: firstItemIndex + localStart,
        endIndex: firstItemIndex + data.length - 1,
      });
    }, [data.length, firstItemIndex, rangeChanged]);

    const Footer = components?.Footer;
    return (
      <div>
        {data.map((item, i) => (
          <div key={computeItemKey(i, item)} data-row-key={computeItemKey(i, item)}>
            {itemContent(i, item)}
          </div>
        ))}
        {Footer ? <Footer context={context} /> : null}
      </div>
    );
  });
  return { Virtuoso };
});

import { ChatMessageList } from "./chat-message-list";

const TEST_RESOURCES = { en: { chat: enChat, connections: enConnections } };
const TASK_ID = "6af44cbe-80ab-4dfe-b07d-bd3cfd588f4d";

function taskMsg(
  seq: number,
  type: TaskMessagePayload["type"],
  extra: Partial<TaskMessagePayload> = {},
): TaskMessagePayload {
  return { task_id: TASK_ID, seq, type, ...extra } as TaskMessagePayload;
}

// A streaming timeline whose middle (tool steps) is non-empty, so the live
// footer renders the "N steps" outer fold.
const INITIAL_MESSAGES: TaskMessagePayload[] = [
  taskMsg(0, "text", { content: "Looking into it. " }),
  taskMsg(1, "tool_use", { tool: "Bash", input: { command: "go test ./..." } }),
  taskMsg(2, "tool_result", { tool: "Bash", output: "ok" }),
];

function renderList(qc: QueryClient) {
  qc.setQueryData(chatKeys.taskMessages(TASK_ID), INITIAL_MESSAGES);
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <QueryClientProvider client={qc}>
        <ChatMessageList
          messages={[]}
          pendingTask={{ task_id: TASK_ID, status: "running" }}
          availability={undefined}
        />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

function pushTaskMessage(qc: QueryClient, msg: TaskMessagePayload) {
  // Mirrors useRealtimeSync's task:message handler: a new array lands in the
  // shared task-messages cache on every streamed message.
  act(() => {
    qc.setQueryData<TaskMessagePayload[]>(
      chatKeys.taskMessages(TASK_ID),
      (old = []) => [...old, msg],
    );
  });
}

it("keeps the email card in the same task row when a live reply becomes persisted", () => {
  const wsId = "11111111-1111-4111-8111-111111111111";
  const sessionId = "22222222-2222-4222-8222-222222222222";
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(chatKeys.taskMessages(TASK_ID), INITIAL_MESSAGES);
  qc.setQueryData(outboundEmailsOptions(wsId, { chat_session_id: sessionId }).queryKey, [{
    id: "33333333-3333-4333-8333-333333333333", workspace_id: wsId, chat_session_id: sessionId,
    task_id: TASK_ID, connection_id: wsId, from_address: "seller@example.com",
    to_addresses: ["buyer@example.com"], cc_addresses: [], bcc_addresses: [], subject: "Review this quote",
    body: "The draft is ready.", attachments: [], version: 1, status: "draft", error_code: "",
    gmail_message_id: "", created_at: "2026-09-09T10:00:00Z", sent_at: null,
  }]);
  const userMessage = { id: "user-email", chat_session_id: sessionId, task_id: TASK_ID, role: "user" as const, content: "Prepare a quote email", created_at: "2026-09-09T09:59:00Z" };
  const tree = (settled: boolean) => <I18nProvider locale="en" resources={TEST_RESOURCES}><QueryClientProvider client={qc}>
    <ChatMessageList workspaceId={wsId} availability={undefined}
      messages={settled ? [userMessage, { ...userMessage, id: "assistant-email", role: "assistant", content: "Review the draft card." }] : [userMessage]}
      pendingTask={settled ? null : { task_id: TASK_ID, status: "running" }} />
  </QueryClientProvider></I18nProvider>;
  const result = render(tree(false));
  const card = screen.getByRole("region", { name: "Email" });
  expect(card.closest("[data-row-key]")).toHaveAttribute("data-row-key", `task:${TASK_ID}`);
  expect(document.querySelectorAll("[data-row-key]")).toHaveLength(2);
  result.rerender(tree(true));
  expect(screen.getByRole("region", { name: "Email" })).toBe(card);
  expect(document.querySelectorAll("[data-row-key]")).toHaveLength(2);
});

describe("ChatMessageList turn minimap", () => {
  it("indexes user turns only, tracks the reading turn, and jumps by data-relative index", async () => {
    mockScrollToIndex.mockClear();
    render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <QueryClientProvider client={new QueryClient()}>
          <ChatMessageList
            messages={[
              {
                id: "user-1",
                chat_session_id: "session-1",
                role: "user",
                content: "First request",
                task_id: null,
                created_at: "2026-08-08T01:00:00Z",
              },
              {
                id: "assistant-1",
                chat_session_id: "session-1",
                role: "assistant",
                content: "First answer",
                task_id: null,
                created_at: "2026-08-08T01:01:00Z",
              },
              {
                id: "user-2",
                chat_session_id: "session-1",
                role: "user",
                content: "Second request",
                task_id: null,
                created_at: "2026-08-08T01:02:00Z",
              },
              {
                id: "assistant-2",
                chat_session_id: "session-1",
                role: "assistant",
                content: "Second answer",
                task_id: null,
                created_at: "2026-08-08T01:03:00Z",
              },
              {
                id: "user-3",
                chat_session_id: "session-1",
                role: "user",
                content: "Third request",
                task_id: null,
                created_at: "2026-08-08T01:04:00Z",
              },
            ]}
            pendingTask={undefined}
            availability="online"
            firstItemIndex={999_995}
            showTurnMinimap
          />
        </QueryClientProvider>
      </I18nProvider>,
    );

    const navigation = await screen.findByRole("navigation", {
      name: "Jump between your messages",
    });
    expect(navigation.querySelectorAll("button[data-minimap-tick]")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "First answer" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Second request" }).firstElementChild,
    ).toHaveClass("bg-foreground/70");

    fireEvent.click(screen.getByRole("button", { name: "Second request" }));
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 2,
      align: "start",
      offset: -16,
      behavior: "auto",
    });
  });
});

describe("ChatMessageList live timeline (MUL-3960 regression)", () => {
  // The live footer is passed to Virtuoso through `components`. If that prop
  // is rebuilt inline on render, every streamed task:message unmounts and
  // remounts the whole footer subtree — re-parsing all Markdown and rebuilding
  // thousands of DOM rows, which froze the renderer during long agent runs.
  it("does not remount the live timeline when a streamed message arrives", async () => {
    const qc = new QueryClient();
    renderList(qc);

    const foldTrigger = await screen.findByText("2 steps");
    const footerBefore = foldTrigger.closest("div");

    pushTaskMessage(
      qc,
      taskMsg(3, "tool_use", { tool: "Read", input: { file_path: "/tmp/x" } }),
    );

    // The fold re-renders in place: same DOM node, updated count.
    const updatedTrigger = await screen.findByText("3 steps");
    expect(updatedTrigger.closest("div")).toBe(footerBefore);
    expect(document.contains(foldTrigger)).toBe(true);
  });

  it("keeps the process fold closed by the user across streamed messages", async () => {
    const qc = new QueryClient();
    renderList(qc);

    // Streaming defaults the fold open; the user closes it.
    const foldTrigger = await screen.findByText("2 steps");
    expect(screen.getByText("Bash")).toBeInTheDocument();
    act(() => {
      foldTrigger.click();
    });
    expect(screen.queryByText("Bash")).not.toBeInTheDocument();

    pushTaskMessage(
      qc,
      taskMsg(3, "tool_use", { tool: "Read", input: { file_path: "/tmp/x" } }),
    );

    // Before the fix the footer remounted, useState re-seeded defaultOpen and
    // the fold sprang back open on every streamed message.
    await screen.findByText("3 steps");
    expect(screen.queryByText("Bash")).not.toBeInTheDocument();
  });

  it("applies an embedded surface content transform to streamed text", async () => {
    const qc = new QueryClient();
    qc.setQueryData(chatKeys.taskMessages(TASK_ID), [
      taskMsg(0, "text", {
        content:
          "Draft ready.\n<agent_draft>{\"name\":\"Hidden protocol\"}</agent_draft>",
      }),
    ]);

    render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <QueryClientProvider client={qc}>
          <ChatMessageList
            messages={[]}
            pendingTask={{ task_id: TASK_ID, status: "running" }}
            availability="online"
            transformContent={(content) =>
              content.replace(
                /<agent_draft>[\s\S]*?<\/agent_draft>/g,
                "",
              )
            }
          />
        </QueryClientProvider>
      </I18nProvider>,
    );

    expect(await screen.findByText("Draft ready.")).toBeInTheDocument();
    expect(screen.queryByText(/Hidden protocol/)).not.toBeInTheDocument();
  });
});

describe("ChatMessageList failure copy (MUL-5370 regression)", () => {
  // The backend moved to the refined taxonomy (agent_error.*) in MUL-2946 but
  // the copy map stayed on the six coarse values, so an exact-key lookup
  // missed every refined reason and fell through to the generic fallback.
  // A user whose skill bundle download stalled was told only "Something went
  // wrong", and the maintainer debugging it had nothing better to go on.
  function renderFailure(reason: string) {
    return render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <QueryClientProvider client={new QueryClient()}>
          <ChatMessageList
            messages={[
              {
                id: "m1",
                chat_session_id: "s1",
                role: "assistant",
                content: "skill bundle unavailable: skill \"x\"",
                task_id: null,
                created_at: new Date(0).toISOString(),
                failure_reason: reason,
              },
            ]}
            pendingTask={undefined}
            availability="online"
          />
        </QueryClientProvider>
      </I18nProvider>,
    );
  }

  const FALLBACK = enChat.message_list.failure.fallback;

  it("renders dedicated copy for a stalled skill bundle download", async () => {
    renderFailure("skill_bundle_unavailable");
    expect(
      await screen.findByText(enChat.message_list.failure.skill_bundle_unavailable),
    ).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument();
  });

  it("renders dedicated copy for a refined reason the map names", async () => {
    renderFailure("agent_error.provider_network");
    expect(
      await screen.findByText(enChat.message_list.failure.provider_network),
    ).toBeInTheDocument();
  });

  it("degrades an unnamed refined reason to its agent_error family", async () => {
    renderFailure("agent_error.unknown");
    expect(
      await screen.findByText(enChat.message_list.failure.agent_error),
    ).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument();
  });

  it("degrades a reason newer than this build to its agent_error family", async () => {
    renderFailure("agent_error.some_future_bucket");
    expect(
      await screen.findByText(enChat.message_list.failure.agent_error),
    ).toBeInTheDocument();
  });

  it("still falls back when neither the reason nor its family is known", async () => {
    renderFailure("something_entirely_new");
    expect(await screen.findByText(FALLBACK)).toBeInTheDocument();
  });
});
