/**
 * Thin wrapper around expo-secure-store for the auth token.
 * Keyed identically to web/desktop ("iteamify_token") so logic stays aligned
 * with packages/core/auth/store.ts even though storage backends differ.
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "iteamify_token";
// Keep an old sign-out's delete from completing after a new sign-in's write.
let pendingWrite: Promise<void> = Promise.resolve();

export async function getToken(): Promise<string | null> {
  await pendingWrite.catch(() => {});
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  pendingWrite = pendingWrite.catch(() => {}).then(() => SecureStore.setItemAsync(TOKEN_KEY, token));
  await pendingWrite;
}

export async function clearToken(): Promise<void> {
  pendingWrite = pendingWrite.catch(() => {}).then(() => SecureStore.deleteItemAsync(TOKEN_KEY));
  await pendingWrite;
}
