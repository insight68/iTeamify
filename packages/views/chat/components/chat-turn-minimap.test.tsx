import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { renderWithI18n } from "../../test/i18n";
import { ChatTurnMinimap, type ChatTurnMinimapTurn } from "./chat-turn-minimap";

const turns: ChatTurnMinimapTurn[] = [
  {
    id: "user-1",
    content: "## First question\n\nPlease inspect the failing test.",
    attachmentCount: 0,
    renderIndex: 0,
  },
  {
    id: "user-2",
    content: "Try the smaller fix",
    attachmentCount: 0,
    renderIndex: 2,
  },
  {
    id: "user-3",
    content: "",
    attachmentCount: 2,
    renderIndex: 4,
  },
];

function renderRail(
  overrides: Partial<ComponentProps<typeof ChatTurnMinimap>> = {},
) {
  const props: ComponentProps<typeof ChatTurnMinimap> = {
    turns,
    activeTurnId: "user-2",
    onJump: vi.fn(),
    hasOlderMessages: false,
    isFetchingOlderMessages: false,
    ...overrides,
  };
  return { ...renderWithI18n(<ChatTurnMinimap {...props} />), props };
}

describe("ChatTurnMinimap", () => {
  it("stays hidden until the conversation has enough loaded turns to navigate", () => {
    const { container } = renderRail({ turns: turns.slice(0, 1) });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders bounded user-turn previews and marks the current reading turn", () => {
    renderRail();

    expect(
      screen.getByRole("navigation", { name: "Jump between your messages" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "First question" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try the smaller fix" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 attachments" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try the smaller fix" }).firstElementChild,
    ).toHaveClass("bg-foreground/70");
  });

  it("maps a clicked turn id back to its Virtuoso data index", () => {
    const onJump = vi.fn();
    renderRail({ onJump });

    fireEvent.click(screen.getByRole("button", { name: "Try the smaller fix" }));
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it("shows a leading pagination marker and loads older messages", () => {
    const onLoadOlderMessages = vi.fn();
    renderRail({ hasOlderMessages: true, onLoadOlderMessages });

    fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    expect(onLoadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it("disables the pagination marker while an older page is loading", () => {
    renderRail({
      hasOlderMessages: true,
      isFetchingOlderMessages: true,
      onLoadOlderMessages: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "Loading older messages…" })).toBeDisabled();
  });
});
