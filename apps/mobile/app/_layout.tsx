import "../global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { api } from "@/data/api";
import { queryClient } from "@/data/query-client";
import { useAuthStore } from "@/data/auth-store";
import { ActionSheetProvider } from "@/lib/action-sheet";
import { LightboxProvider } from "@/lib/markdown/lightbox-provider";
import { NAV_THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  useEffect(() => {
    // Logout owns cache, draft and credential cleanup for every exit path.
    api.setOptions({ onUnauthorized: () => { void useAuthStore.getState().logout(); } });
    void initialize();
  }, [initialize]);

  return <>{children}</>;
}

export default function RootLayout() {
  const userId = useAuthStore((s) => s.user?.id ?? "signed-out");
  const { colorScheme, isDarkColorScheme } = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <AuthInitializer>
            <QueryClientProvider key={userId} client={queryClient}>
              <ThemeProvider value={NAV_THEME[colorScheme]}>
                <ActionSheetProvider>
                  <LightboxProvider>
                    <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(app)" />
                    </Stack>
                    <PortalHost />
                  </LightboxProvider>
                </ActionSheetProvider>
              </ThemeProvider>
            </QueryClientProvider>
          </AuthInitializer>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
