import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { Capacitor } from "@capacitor/core";

const BIOMETRIC_SERVER = "world.teamify.mobile";

/**
 * Check if biometric authentication is available on this device.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

/**
 * Store auth token securely in Keychain (iOS) / Keystore (Android).
 */
export async function saveBiometricToken(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await NativeBiometric.setCredentials({
    username: "teamify-user",
    password: token,
    server: BIOMETRIC_SERVER,
  });
}

/**
 * Retrieve auth token after biometric verification.
 * Returns null if biometric fails or no token stored.
 */
export async function getBiometricToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const available = await isBiometricAvailable();
    if (!available) return null;

    // Prompt for biometric
    await NativeBiometric.verifyIdentity({
      reason: "Unlock Teamify",
      title: "Teamify",
    });

    const creds = await NativeBiometric.getCredentials({
      server: BIOMETRIC_SERVER,
    });
    return creds.password;
  } catch {
    return null;
  }
}

/**
 * Remove stored biometric token (on logout).
 */
export async function deleteBiometricToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeBiometric.deleteCredentials({
      server: BIOMETRIC_SERVER,
    });
  } catch {
    // Best-effort
  }
}
