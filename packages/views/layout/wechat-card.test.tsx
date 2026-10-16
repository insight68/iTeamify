import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WechatCard } from "./wechat-card";

// react-i18next isn't initialised in the views test env, so resolve the
// selector against the real en/layout.json to assert on actual copy.
vi.mock("../i18n", () => ({
  useT: () => ({
    t: (sel: (r: { sidebar: { wechat_card: Record<string, string> } }) => string) =>
      sel({
        sidebar: {
          wechat_card: {
            title: "Follow our WeChat",
            description: "Scan to follow for updates and help.",
            dismiss: "Dismiss",
          },
        },
      }),
  }),
}));

// The shared dialog is a Base UI portal that's awkward to test in isolation;
// reduce it to a simple open-gated render. The card's open-state wiring is
// what matters here, not the portal.
vi.mock("./wechat-qr-dialog", () => ({
  WechatQrDialog: ({
    open,
    title,
  }: {
    open: boolean;
    title: string;
  }) => (open ? <div data-testid="wechat-qr-dialog">{title}</div> : null),
}));

const userId = { current: "user-1" as string | undefined };
vi.mock("@iteamify/core/auth", () => ({
  useAuthStore: (selector: (s: { user?: { id?: string } }) => unknown) =>
    selector({ user: userId.current ? { id: userId.current } : undefined }),
}));

afterEach(() => {
  localStorage.clear();
  userId.current = "user-1";
});

describe("WechatCard", () => {
  it("opens the QR dialog when clicked", async () => {
    const user = userEvent.setup();
    render(<WechatCard />);

    expect(screen.queryByTestId("wechat-qr-dialog")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /follow our wechat/i }),
    );
    expect(screen.getByTestId("wechat-qr-dialog")).toHaveTextContent(
      "Follow our WeChat",
    );
  });

  it("hides and stays hidden after dismiss, persisting per user", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WechatCard />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Follow our WeChat")).not.toBeInTheDocument();

    // A fresh mount for the same user keeps the card hidden.
    unmount();
    render(<WechatCard />);
    expect(screen.queryByText("Follow our WeChat")).not.toBeInTheDocument();
  });

  it("keeps the card visible for a different user", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WechatCard />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    unmount();

    userId.current = "user-2";
    render(<WechatCard />);
    expect(screen.getByText("Follow our WeChat")).toBeInTheDocument();
  });
});
