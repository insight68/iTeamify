import { describe, it, expect } from "vitest";
import { hexToRowBackground, isValidHexColor } from "../color-utils";

describe("hexToRowBackground", () => {
  it("converts 6-digit hex to rgba with 0.1 opacity", () => {
    expect(hexToRowBackground("#3B82F6")).toBe("rgba(59, 130, 246, 0.1)");
  });

  it("converts 3-digit hex to rgba with 0.1 opacity", () => {
    expect(hexToRowBackground("#F00")).toBe("rgba(255, 0, 0, 0.1)");
  });

  it("handles lowercase hex", () => {
    expect(hexToRowBackground("#ff0000")).toBe("rgba(255, 0, 0, 0.1)");
  });

  it("handles hex without # prefix", () => {
    expect(hexToRowBackground("3B82F6")).toBe("rgba(59, 130, 246, 0.1)");
  });

  it("returns empty string for invalid input", () => {
    expect(hexToRowBackground("")).toBe("");
    expect(hexToRowBackground("invalid")).toBe("");
    expect(hexToRowBackground("#GGG")).toBe("");
  });
});

describe("isValidHexColor", () => {
  it("validates 6-digit hex with #", () => {
    expect(isValidHexColor("#3B82F6")).toBe(true);
  });

  it("validates 3-digit hex with #", () => {
    expect(isValidHexColor("#F00")).toBe(true);
  });

  it("validates hex without #", () => {
    expect(isValidHexColor("3B82F6")).toBe(true);
    expect(isValidHexColor("F00")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidHexColor("")).toBe(false);
    expect(isValidHexColor("#")).toBe(false);
    expect(isValidHexColor("#12")).toBe(false);
    expect(isValidHexColor("#1234")).toBe(false);
    expect(isValidHexColor("#12345")).toBe(false);
    expect(isValidHexColor("#1234567")).toBe(false);
    expect(isValidHexColor("#GGG")).toBe(false);
  });
});
