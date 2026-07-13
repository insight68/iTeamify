import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserFullscreenFrame } from "./browser-fullscreen-frame";

const originalRequestFullscreen = HTMLElement.prototype.requestFullscreen;
const originalExitFullscreen = document.exitFullscreen;

describe("BrowserFullscreenFrame", () => {
  let fullscreenElement: Element | null;
  let requestFullscreen: ReturnType<typeof vi.fn>;
  let exitFullscreen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fullscreenElement = null;
    requestFullscreen = vi.fn(function request(this: Element) {
      fullscreenElement = this;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });
    exitFullscreen = vi.fn(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });

    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      writable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      writable: true,
      value: exitFullscreen,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
  });

  afterEach(() => {
    if (originalRequestFullscreen) {
      Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
        configurable: true,
        writable: true,
        value: originalRequestFullscreen,
      });
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
    }

    if (originalExitFullscreen) {
      Object.defineProperty(document, "exitFullscreen", {
        configurable: true,
        writable: true,
        value: originalExitFullscreen,
      });
    } else {
      Reflect.deleteProperty(document, "exitFullscreen");
    }

    Reflect.deleteProperty(document, "fullscreenElement");
  });

  it("requests browser fullscreen and restores when toggled", async () => {
    render(
      <BrowserFullscreenFrame
        enterLabel="Enter fullscreen"
        exitLabel="Restore"
      >
        {(fullscreenControl) => (
          <div>
            {fullscreenControl}
            <span>Panel content</span>
          </div>
        )}
      </BrowserFullscreenFrame>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument();
    });
  });
});
