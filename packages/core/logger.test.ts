import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLogging, createLogger } from "./logger";

afterEach(() => { vi.restoreAllMocks(); configureLogging("warn"); });
describe("platform logging threshold", () => {
  it("suppresses detailed production events while retaining warnings and errors", () => {
    const debug = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createLogger("test");
    logger.debug("message delta"); logger.info("request"); logger.warn("retry"); logger.error("failed");
    expect(debug).not.toHaveBeenCalled(); expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1); expect(error).toHaveBeenCalledTimes(1);
  });
  it("configures existing loggers without rebuilding services", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("test");
    configureLogging("debug"); logger.debug("enabled");
    configureLogging("error"); logger.debug("disabled");
    expect(output).toHaveBeenCalledTimes(1);
  });
});
