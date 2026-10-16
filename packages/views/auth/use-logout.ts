"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@iteamify/core/auth";
import { defaultStorage } from "@iteamify/core/platform";
import { clearClientSessionData } from "@iteamify/core/platform";
import { paths } from "@iteamify/core/paths";
import { useNavigation } from "../navigation";

/**
 * Performs a complete logout: clears per-workspace client storage, legacy
 * cookies, the desktop tab state, the entire React Query cache, the
 * in-memory auth store, and finally navigates to /login. Wraps what was
 * previously duplicated in app-sidebar's logout handler so NoAccessPage's
 * "Sign in as a different user" and any future entry point can use the
 * same flow.
 *
 * Without a unified logout, callers that only do `navigate('/login')`
 * leave the auth cookie + React Query cache + local storage intact —
 * AuthInitializer then silently re-authenticates the user on the login
 * page and redirects them back where they came from.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const authLogout = useAuthStore((s) => s.logout);
  const { push } = useNavigation();

  return useCallback(() => {
    clearClientSessionData(queryClient, defaultStorage);
    authLogout();

    // Navigate to /login explicitly. authLogout() clears state but doesn't
    // move the URL — without this the caller might be on a workspace URL
    // which renders null (layout gates on user) and leaves the user
    // stuck on a blank page.
    push(paths.login());
  }, [queryClient, authLogout, push]);
}
