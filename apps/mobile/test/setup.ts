import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const localStorageIsUsable =
  typeof globalThis.localStorage?.getItem === "function" &&
  typeof globalThis.localStorage?.setItem === "function" &&
  typeof globalThis.localStorage?.removeItem === "function" &&
  typeof globalThis.localStorage?.clear === "function";

if (!localStorageIsUsable) {
  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

// Mock Capacitor plugins
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "web",
    isNativePlatform: () => false,
    isPluginAvailable: () => false,
  },
  registerPlugin: vi.fn(),
}));

vi.mock("@capacitor/browser", () => ({
  Browser: { open: vi.fn() },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

vi.mock("@capacitor/device", () => ({
  Device: { getLanguageCode: vi.fn(() => Promise.resolve({ value: "en" })) },
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: vi.fn(() => Promise.resolve({ receive: "granted" })),
    requestPermissions: vi.fn(),
    register: vi.fn(),
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: vi.fn() },
  Style: { Light: "LIGHT", Dark: "DARK" },
}));

vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: { hide: vi.fn() },
}));

vi.mock("@capacitor/keyboard", () => ({
  Keyboard: { addEventListener: vi.fn() },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}));

vi.mock("@capgo/capacitor-native-biometric", () => ({
  NativeBiometric: {
    isAvailable: vi.fn(() => Promise.resolve({ isAvailable: false })),
    verifyIdentity: vi.fn(),
    setCredentials: vi.fn(),
    getCredentials: vi.fn(),
    deleteCredentials: vi.fn(),
  },
}));
