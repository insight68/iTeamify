import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { AppConfigSchema } from "./schemas";
import { createLogger } from "../logger";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("password auth API boundaries", () => {
  const client = () => new ApiClient("https://api.example.test");
  const proof = { email: "user@example.test", purpose: "reset" as const, challenge_id: "00000000-0000-4000-8000-000000000001", proof: "a".repeat(64), password: "a long password phrase" };
  const response = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));

  it.each([
    ["login", (c: ApiClient) => c.loginWithPassword(proof.email, proof.password), { token: "secret", user: null }],
    ["signup", (c: ApiClient) => c.signupWithPassword({ ...proof, purpose: "signup" }), { user: { id: "u" } }],
    ["challenge", (c: ApiClient) => c.createAuthChallenge(proof.email, "reset"), { challenge_id: "bad" }],
    ["verify", (c: ApiClient) => c.verifyAuthChallenge({ ...proof, code: "123456" }), { action: "reset", proof: "" }],
    ["status", (c: ApiClient) => c.getPasswordStatus(), { has_password: "false" }],
    ["reset", (c: ApiClient) => c.resetPassword(proof), { success: false }],
    ["change", (c: ApiClient) => c.changePassword(proof), { token: "secret", user: {} }],
  ])("rejects malformed %s responses", async (_name, request, body) => {
    response(body);
    await expect(request(client())).rejects.toThrow();
  });

  it("does not end an existing session when password login fails", async () => {
    response({ code: "credentials_invalid", error: "incorrect credentials" }, 401);
    const onUnauthorized = vi.fn();
    const c = new ApiClient("https://api.example.test", { onUnauthorized });
    c.setToken("existing-token");
    await expect(c.loginWithPassword(proof.email, "wrong")).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it.each([
    [400, "invalid_request"],
    [401, "credentials_invalid"],
    [429, "rate_limited"],
  ])("reports public auth rejection %s as a warning and preserves the API error", async (status, code) => {
    const body = { code, error: "authentication rejected" };
    response(body, status);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = new ApiClient("https://api.example.test", { logger: createLogger("api") });

    await expect(c.loginWithPassword(proof.email, proof.password)).rejects.toMatchObject({ status, body });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[2]).toBe(`← ${status} /auth/password/login`);
    expect(error).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(proof.password);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(proof.email);
  });

  it("still reports authentication server failures as errors", async () => {
    response({ code: "unavailable", error: "authentication unavailable" }, 503);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = new ApiClient("https://api.example.test", { logger: createLogger("api") });

    await expect(c.loginWithPassword(proof.email, proof.password)).rejects.toMatchObject({ status: 503 });

    expect(error).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it("still ends a session when an authenticated request returns 401", async () => {
    response({ error: "session expired" }, 401);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const onUnauthorized = vi.fn();
    const c = new ApiClient("https://api.example.test", { logger: createLogger("api"), onUnauthorized });
    c.setToken("expired-token");

    await expect(c.getMe()).rejects.toMatchObject({ status: 401 });

    expect(error).toHaveBeenCalledOnce();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("keeps password auth hidden for older backend configuration", () => {
    expect(AppConfigSchema.parse({}).password_auth_enabled).toBe(false);
    expect(AppConfigSchema.parse({ password_auth_enabled: true }).password_auth_enabled).toBe(true);
  });
});
