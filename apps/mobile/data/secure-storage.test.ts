import { describe, expect, it, vi } from "vitest";
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
import * as SecureStore from "expo-secure-store";
import { clearToken, getToken, setToken } from "./secure-storage";

describe("serialized credential writes", () => {
  it("finishes an old logout deletion before a new login write and subsequent read", async () => {
    let finishDelete!: () => void;
    let stored: string | null = "old";
    vi.mocked(SecureStore.deleteItemAsync).mockImplementation(() => new Promise<void>((resolve) => {
      finishDelete = () => { stored = null; resolve(); };
    }));
    vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
    const deletion = clearToken();
    const write = setToken("new");
    const read = getToken();
    await vi.waitFor(() => expect(finishDelete).toBeDefined());
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    finishDelete();
    await Promise.all([deletion, write]);
    expect(await read).toBe("new");
  });
});
