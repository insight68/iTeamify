import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DynamicCreatorNoun } from "./dynamic-creator-noun";

afterEach(() => {
  vi.useRealTimers();
});

describe("DynamicCreatorNoun", () => {
  it("cycles through the fixed creator nouns without changing layout width", () => {
    vi.useFakeTimers();
    render(<DynamicCreatorNoun />);

    expect(screen.getByText("技能")).toHaveClass("opacity-100");
    expect(screen.getByText("品位")).toHaveClass("opacity-0");

    act(() => {
      vi.advanceTimersByTime(1800);
    });

    expect(screen.getByText("技能")).toHaveClass("opacity-0");
    expect(screen.getByText("品位")).toHaveClass("opacity-100");
    expect(screen.getByText("品位").parentElement).toHaveClass("w-[2em]");
  });
});
