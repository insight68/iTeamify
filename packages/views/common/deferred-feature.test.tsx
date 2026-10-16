import { act, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { deferredFeature } from "./deferred-feature";
import { renderWithI18n } from "../test/i18n";

afterEach(() => vi.restoreAllMocks());

it("retains a loaded feature's state while its entry is closed", async () => {
  function Counter() {
    const [value, setValue] = useState(0);
    return <button onClick={() => setValue(value + 1)}>Count {value}</button>;
  }
  const load = vi.fn(async () => ({ default: Counter }));
  const Feature = deferredFeature(load);
  const dismiss = vi.fn();
  const { rerender } = renderWithI18n(<Feature onDismiss={dismiss} presentation="inline" />);
  fireEvent.click(await screen.findByRole("button", { name: "Count 0" }));
  rerender(<Feature active={false} onDismiss={dismiss} presentation="inline" />);
  rerender(<Feature active onDismiss={dismiss} presentation="inline" />);
  expect(screen.getByRole("button", { name: "Count 1" })).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(1);
});

it("allows cancellation while a chunk is pending without reopening later", async () => {
  let resolve!: (module: { default: () => React.ReactNode }) => void;
  const load = vi.fn(() => new Promise<{ default: () => React.ReactNode }>((done) => { resolve = done; }));
  const Feature = deferredFeature(load);
  function Host() {
    const [open, setOpen] = useState(true);
    return open ? <Feature onDismiss={() => setOpen(false)} presentation="inline" /> : null;
  }
  renderWithI18n(<Host />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () => resolve({ default: () => <span>Late feature</span> }));
  expect(screen.queryByText("Late feature")).not.toBeInTheDocument();
});

it("retries the module loader after a rejection instead of replaying the cached error", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const load = vi.fn()
    .mockRejectedValueOnce(new Error("chunk unavailable"))
    .mockResolvedValueOnce({ default: () => <span>Recovered feature</span> });
  const Feature = deferredFeature(load);
  renderWithI18n(<Feature onDismiss={vi.fn()} presentation="inline" />);
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Recovered feature")).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
});
