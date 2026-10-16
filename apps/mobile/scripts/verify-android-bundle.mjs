import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const apk = process.argv[2];
assert(apk, "APK path required");
const bundle = execFileSync("unzip", ["-p", apk, "assets/index.android.bundle"], { maxBuffer: 64 * 1024 * 1024 });
assert.equal(bundle.subarray(0, 8).toString("hex"), "c61fbc03c103191f", "Missing Hermes bytecode");
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
assert(apiUrl, "EXPO_PUBLIC_API_URL required");
assert(bundle.includes(Buffer.from(apiUrl)), "APK contains a stale API origin");
if (process.env.APP_ENV === "production") {
  assert.equal(apiUrl, "https://aurocreator.com", "Unexpected production API origin");
  for (const forbidden of ["https://api.aurocreator.com", "https://iteamify-api.copilothub.ai", "https://mobile-validation.invalid", "local-fixture-token", "http://10.0.2.2:"]) {
    assert(!bundle.includes(Buffer.from(forbidden)), `APK contains non-production configuration: ${forbidden}`);
  }
}
console.log("Verified APK Hermes bytecode and embedded service environment");
