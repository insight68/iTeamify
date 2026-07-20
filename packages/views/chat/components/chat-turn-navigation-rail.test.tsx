import { cloneElement, createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@teamify/core/types";
import {
  buildChatTurnNavigationItems,
  ChatTurnNavigationRail,
  type ChatTurnNavigationLayout,
} from "./chat-turn-navigation-rail";

vi.mock("@teamify/ui/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    render: trigger,
  }: {
    children?: React.ReactNode;
    render: React.ReactElement<{ children?: React.ReactNode }>;
  }) => cloneElement(trigger, undefined, children),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("../../i18n", () => ({
  useT: () => ({
    t: (
      selector: (resources: {
        turn_navigation: Record<string, string>;
      }) => string,
      values?: Record<string, string | number>,
    ) => {
      const text = selector({
        turn_navigation: {
          aria_label: "Conversation turns",
          jump_to_turn: "Jump to turn {{position}}",
          turn_label: "Turn {{position}}",
          responding: "Responding…",
          no_response: "No response yet",
          shortcut_hint: "Alt + ↑/↓ to navigate",
        },
      });
      return Object.entries(values ?? {}).reduce(
        (result, [key, value]) => result.replace(`{{${key}}}`, String(value)),
        text,
      );
    },
  }),
}));

const now = "2026-07-16T00:00:00Z";

function message(
  id: string,
  role: ChatMessage["role"],
  content: string,
  taskId: string | null = null,
): ChatMessage {
  return {
    id,
    chat_session_id: "session-1",
    role,
    content,
    task_id: taskId,
    created_at: now,
  };
}

function items(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${index + 1}`,
    prompt: `Prompt ${index + 1}`,
    response: `Response ${index + 1}`,
    isPending: false,
  }));
}

function Harness({
  count = 4,
  onLayoutChange,
}: {
  count?: number;
  onLayoutChange?: (layout: ChatTurnNavigationLayout) => void;
}) {
  const scrollRef = createRef<HTMLDivElement>();

  return (
    <div ref={scrollRef} data-testid="scroll-root">
      <div data-chat-turn-content>
        {items(count).map((item) => (
          <div key={item.id} data-chat-turn-id={item.id}>
            <div data-chat-turn-prompt>{item.prompt}</div>
          </div>
        ))}
      </div>
      <ChatTurnNavigationRail
        items={items(count)}
        scrollContainerRef={scrollRef}
        onLayoutChange={onLayoutChange}
      />
    </div>
  );
}

describe("buildChatTurnNavigationItems", () => {
  it("groups messages by user prompt and prepares compact previews", () => {
    const result = buildChatTurnNavigationItems(
      [
        message("orphan", "assistant", "Ignored orphan reply"),
        message(
          "user-1",
          "user",
          "Context: issue TEAM-42\n\n**Review** [this spec](https://example.com)",
        ),
        message("assistant-1", "assistant", "First reply", "task-1"),
        message("assistant-2", "assistant", "Follow-up detail", "task-1"),
        message("user-2", "user", "Run the tests"),
      ],
      true,
    );

    expect(result).toEqual([
      {
        id: "user-1",
        prompt: "Review this spec",
        response: "First reply Follow-up detail",
        isPending: false,
      },
      {
        id: "user-2",
        prompt: "Run the tests",
        response: "",
        isPending: true,
      },
    ]);
  });
});

describe("ChatTurnNavigationRail", () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const scrollIntoView = vi.fn();
  const animate = vi.fn();
  let contentLeft = 80;

  beforeEach(() => {
    contentLeft = 80;
    scrollIntoView.mockReset();
    animate.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
    Element.prototype.animate = animate;

    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.dataset.testid === "scroll-root") {
        return rect({ left: 0, top: 0, width: 640, height: 480 });
      }
      if (this.hasAttribute("data-chat-turn-content")) {
        return rect({ left: contentLeft, top: 0, width: 480, height: 800 });
      }
      const turnId = this.dataset.chatTurnId;
      if (turnId) {
        const index = Number(turnId.split("-")[1]) - 1;
        return rect({ left: 80, top: index * 180, width: 480, height: 80 });
      }
      const navIndex = this.dataset.chatTurnNavIndex;
      if (navIndex) {
        return rect({
          left: 12,
          top: Number(navIndex) * 18,
          width: 30,
          height: 18,
        });
      }
      return rect({ left: 12, top: 0, width: 30, height: 40 });
    };

    globalThis.ResizeObserver = class ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: target.getBoundingClientRect(),
            } as ResizeObserverEntry,
          ],
          this,
        );
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    globalThis.IntersectionObserver = class IntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "0px";
      thresholds = [0];
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  it("keeps the visual rail hidden for a single-turn conversation", () => {
    render(<Harness count={1} />);

    expect(
      screen.queryByRole("navigation", { name: "Conversation turns" }),
    ).not.toBeInTheDocument();
  });

  it("shows the visual rail from the second turn", () => {
    render(<Harness count={2} />);

    expect(
      screen.getByRole("navigation", { name: "Conversation turns" }),
    ).toHaveAttribute("data-layout", "standard");
    expect(
      screen.getAllByRole("button", { name: /Jump to turn/ }),
    ).toHaveLength(2);
  });

  it("switches to a compact bottom-anchored rail when natural gutter is unavailable", () => {
    const onLayoutChange = vi.fn();
    contentLeft = 20;
    render(<Harness onLayoutChange={onLayoutChange} />);

    const rail = screen.getByRole("navigation", { name: "Conversation turns" });
    expect(rail).toHaveAttribute("data-layout", "compact");
    expect(rail).toHaveClass("inset-y-3", "items-end", "left-1.5");
    expect(screen.getByRole("button", { name: "Jump to turn 1" })).toHaveClass(
      "w-5",
    );
    expect(rail.querySelector("[data-chat-turn-rail-list]")).toHaveClass(
      "max-h-[min(100%,34rem)]",
    );
    expect(onLayoutChange).toHaveBeenLastCalledWith("compact");
  });

  it("jumps to a turn and flashes its prompt", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Jump to turn 2" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(animate).toHaveBeenCalledWith(expect.any(Array), {
      duration: 900,
      easing: "ease-out",
    });
  });

  it("uses compact spacing and expands only the hovered marker neighborhood", () => {
    render(<Harness />);

    const buttons = screen.getAllByRole("button", { name: /Jump to turn/ });
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveClass("h-[18px]", "w-[30px]");
    expect(
      screen.getByRole("navigation", { name: "Conversation turns" }),
    ).toHaveAttribute("data-layout", "standard");

    fireEvent.pointerMove(buttons[2]!, { clientY: 45, pointerId: 1 });

    const scales = buttons.map(
      (button) => button.querySelector("span")?.style.transform,
    );
    expect(scales).toEqual([
      "scaleX(0.42)",
      "scaleX(0.63)",
      "scaleX(1)",
      "scaleX(0.63)",
    ]);
  });

  it("supports Alt + Arrow navigation without hijacking text inputs", () => {
    render(
      <>
        <Harness />
        <input aria-label="Composer" />
      </>,
    );

    fireEvent.keyDown(document.body, { altKey: true, key: "ArrowDown" });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    scrollIntoView.mockClear();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Composer" }), {
      altKey: true,
      key: "ArrowDown",
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrubs directly between turns while dragging the rail", () => {
    render(<Harness />);

    const rail = screen.getByRole("navigation", { name: "Conversation turns" });
    const first = screen.getByRole("button", { name: "Jump to turn 1" });
    fireEvent.pointerDown(first, { button: 0, clientY: 9, pointerId: 7 });
    fireEvent.pointerMove(rail, { clientY: 63, pointerId: 7 });
    fireEvent.pointerUp(rail, { clientY: 63, pointerId: 7 });

    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "auto",
      block: "start",
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});

function rect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}
