import { describe, expect, it } from "vitest";
import { normalizeAIPipeFrontendConfig } from "./aipipe-sdk";

describe("normalizeAIPipeFrontendConfig", () => {
  it("returns null when config is absent", () => {
    expect(normalizeAIPipeFrontendConfig({})).toBeNull();
    expect(normalizeAIPipeFrontendConfig({ aipipe_frontend: null })).toBeNull();
  });

  it("normalizes valid config", () => {
    expect(
      normalizeAIPipeFrontendConfig({
        aipipe_frontend: {
          script_url: "https://pub.niuwoai.com/aipipe-sdk.js",
          api_key: "public-key",
          endpoint: "https://pub.niuwoai.com/api/v1",
          topic: "browser",
          batch_size: 10,
          batch_timeout: 5000,
          capture_errors: true,
          capture_api_errors: true,
          capture_api_requests: false,
          sample_rate: 0.5,
        },
      }),
    ).toEqual({
      scriptUrl: "https://pub.niuwoai.com/aipipe-sdk.js",
      apiKey: "public-key",
      endpoint: "https://pub.niuwoai.com/api/v1",
      topic: "browser",
      batchSize: 10,
      batchTimeout: 5000,
      captureErrors: true,
      captureApiErrors: true,
      captureApiRequests: false,
      sampleRate: 0.5,
    });
  });

  it("rejects non-http script and endpoint URLs", () => {
    expect(
      normalizeAIPipeFrontendConfig({
        aipipe_frontend: {
          script_url: "javascript:alert(1)",
          api_key: "public-key",
          endpoint: "https://pub.niuwoai.com/api/v1",
          topic: "browser",
        },
      }),
    ).toBeNull();

    expect(
      normalizeAIPipeFrontendConfig({
        aipipe_frontend: {
          script_url: "https://pub.niuwoai.com/aipipe-sdk.js",
          api_key: "public-key",
          endpoint: "file:///tmp/aipipe",
          topic: "browser",
        },
      }),
    ).toBeNull();
  });
});
