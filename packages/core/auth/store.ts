import { create } from "zustand";
import type { User, StorageAdapter } from "../types";
import { identify as identifyAnalytics, resetAnalytics } from "../analytics";
import type { ApiClient } from "../api/client";
import type { LoginResponse } from "../api/client";
import type { AuthProof, AuthPurpose, AuthVerification } from "./schemas";
import { setCurrentWorkspace } from "../platform/workspace-storage";
import { publishCurrentUser } from "../profile/cache";

export interface AuthStoreOptions {
  api: ApiClient;
  storage: StorageAdapter;
  onLogin?: () => void;
  onLogout?: () => void;
  /**
   * Cleanup for a session the server ended, as opposed to one the user did.
   * Defaults to `onLogout` — a shell only needs its own handler when some of
   * its logout teardown is too destructive for an expiry it did not ask for.
   */
  onSessionExpired?: () => void;
  /** When true, rely on HttpOnly cookies instead of localStorage for auth tokens. */
  cookieAuth?: boolean;
}

export type AuthStatus =
  | "authenticating"
  | "authenticated"
  | "unauthenticated"
  | "recovering";

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  status: AuthStatus;
  retryGeneration: number;
  /**
   * The last transition to `unauthenticated` was the server rejecting our
   * credential, not the user asking to leave. Purely presentational — the
   * login page uses it to say why the session ended. Cleared by any
   * successful login and by an explicit logout.
   */
  expired: boolean;

  retryAuthentication: () => void;
  sessionGeneration: number;
  sendCode: (email: string, language?: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<User>;
  loginWithPassword: (email: string, password: string) => Promise<User>;
  signupWithPassword: (input: AuthProof & { password: string }) => Promise<User>;
  verifyAuthChallenge: (input: { email: string; purpose: AuthPurpose; challenge_id: string; code: string }) => Promise<AuthVerification>;
  changePassword: (input: { password: string; current_password?: string; language?: string } & Partial<AuthProof>) => Promise<User>;
  loginWithGoogle: (code: string, redirectUri: string) => Promise<User>;
  loginWithToken: (token: string) => Promise<User>;
  logout: () => void;
  sessionExpired: () => void;
  setUser: (user: User) => void;
  refreshMe: () => Promise<void>;
}

export function createAuthStore(options: AuthStoreOptions) {
  const { api, storage, onLogin, onLogout, onSessionExpired, cookieAuth } =
    options;

  let generation = 0;
  const begin = () => ++generation;
  const check = (attempt: number) => {
    if (attempt !== generation) throw new DOMException("Session changed", "AbortError");
  };

  return create<AuthState>((set, get) => {
    const acceptLogin = (attempt: number, { token, user }: LoginResponse) => {
      check(attempt);
      if (!cookieAuth) {
        storage.setItem("iteamify_token", token);
        api.setToken(token);
      } else {
        // The response rotated the cookie; cancel work that used its predecessor.
        api.advanceAuthSession();
      }
      onLogin?.();
      identifyAnalytics(user.id, { email: user.email, name: user.name });
      set({ user: publishCurrentUser(user), isLoading: false, status: "authenticated", expired: false });
      return user;
    };
    const authenticate = async (request: () => Promise<LoginResponse>) => {
      const attempt = begin();
      api.advanceAuthSession();
      set({ sessionGeneration: attempt });
      return acceptLogin(attempt, await request());
    };
    return {
      user: null,
      isLoading: true,
      status: "authenticating",
      retryGeneration: 0,
      sessionGeneration: 0,
      expired: false,

      retryAuthentication: () => {
        set((state) => ({
          isLoading: true,
          status: "authenticating",
          retryGeneration: state.retryGeneration + 1,
        }));
      },

      sendCode: async (email: string, language?: string) => {
        await api.sendCode(email, language);
      },

      verifyCode: async (email: string, code: string) => {
        return authenticate(() => api.verifyCode(email, code));
      },

      loginWithPassword: (email, password) => authenticate(() => api.loginWithPassword(email, password)),
      signupWithPassword: (input) => authenticate(() => api.signupWithPassword(input)),
      changePassword: (input) => authenticate(() => api.changePassword(input)),
      verifyAuthChallenge: async (input) => {
        const attempt = begin();
        api.advanceAuthSession();
        set({ sessionGeneration: attempt });
        const result = await api.verifyAuthChallenge(input);
        check(attempt);
        if (result.action === "authenticated") acceptLogin(attempt, result);
        return result;
      },

      loginWithGoogle: async (code: string, redirectUri: string) => {
        return authenticate(() => api.googleLogin(code, redirectUri));
      },

      loginWithToken: async (token: string) => {
        const attempt = begin();
        api.advanceAuthSession();
        set({ sessionGeneration: attempt });
        storage.setItem("iteamify_token", token);
        api.setToken(token);
        const attemptVersion = generation;
        const user = await api.getMe();
        check(attemptVersion);
        onLogin?.();
        identifyAnalytics(user.id, { email: user.email, name: user.name });
        set({ user: publishCurrentUser(user), isLoading: false, status: "authenticated", expired: false });
        return user;
      },

      logout: () => {
        const sessionGeneration = begin();
        api.advanceAuthSession();
        if (cookieAuth) {
          // Clear server-side HttpOnly cookie.
          api.logout().catch(() => {});
        }
        storage.removeItem("iteamify_token");
        api.setToken(null);
        setCurrentWorkspace(null, null);
        resetAnalytics();
        onLogout?.();
        set({
          user: null,
          isLoading: false,
          status: "unauthenticated",
          expired: false,
          sessionGeneration,
        });
      },

      /**
       * The server rejected our credential (401). Tears the session down to
       * exactly the state a cold boot with a dead token lands in, so the shell
       * unmounts and the app shows the login page instead of staying up while
       * every request fails with an auth error the user cannot act on
       * (MUL-7028).
       *
       * No server round-trip: the credential is already dead, and `/auth/logout`
       * would be one more request to answer a 401 with. Idempotent, because a
       * session dies once but a screen full of in-flight requests all learn
       * about it separately.
       */
      sessionExpired: () => {
        // "Expired" is a claim about the user's own history, so only make it
        // when this client really did present a credential the server then
        // rejected: a live session, or a stored token left by an earlier one.
        // A first visit to /login 401s on the identity probe too, and telling
        // that person their session expired would be a lie. Read before the
        // teardown below removes the evidence.
        const hadCredential =
          get().status === "authenticated" ||
          storage.getItem("iteamify_token") !== null;

        // Dropping the rejected credential happens before the idempotence
        // guard, and unconditionally. A login attempt that 401s never leaves
        // `unauthenticated` — Desktop's deep link writes the token, calls
        // getMe, and gets rejected — so a guard placed first would return with
        // that invalid token still sitting in storage, to be replayed at the
        // next launch. Nothing below this point is safe to repeat; this is.
        storage.removeItem("iteamify_token");
        api.setToken(null);

        // Past here we are ending a session, which happens once no matter how
        // many in-flight requests learn the credential is dead — and does not
        // happen at all when there was no session to end.
        if (get().status === "unauthenticated") return;

        const sessionGeneration = begin();
        api.advanceAuthSession();

        // Cookie mode leaves the workspace singleton alone: there the URL owns
        // workspace identity and the login route overwrites it on the next
        // entry. Mirrors AuthInitializer's boot-time rejection.
        if (!cookieAuth) setCurrentWorkspace(null, null);
        resetAnalytics();
        (onSessionExpired ?? onLogout)?.();
        set({
          user: null,
          isLoading: false,
          status: "unauthenticated",
          expired: hadCredential,
          sessionGeneration,
        });
      },

      setUser: (user: User) => {
        const state = get();
        if (state.status === "unauthenticated" || (state.user && state.user.id !== user.id)) return;
        set({ user: publishCurrentUser(user), isLoading: false, status: "authenticated", expired: false });
      },

      refreshMe: async () => {
        const attemptVersion = generation;
        const user = await api.getMe();
        check(attemptVersion);
        get().setUser(user);
      },
    };
  });
}
