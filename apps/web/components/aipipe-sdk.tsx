"use client";

import { useEffect } from "react";

type AIPipeFrontendConfig = {
  scriptUrl: string;
  apiKey: string;
  endpoint: string;
  topic: string;
  batchSize?: number;
  batchTimeout?: number;
  captureErrors?: boolean;
  captureApiErrors?: boolean;
  captureApiRequests?: boolean;
  sampleRate?: number;
};

type RawAIPipeFrontendConfig = {
  script_url?: unknown;
  api_key?: unknown;
  endpoint?: unknown;
  topic?: unknown;
  batch_size?: unknown;
  batch_timeout?: unknown;
  capture_errors?: unknown;
  capture_api_errors?: unknown;
  capture_api_requests?: unknown;
  sample_rate?: unknown;
};

type AIPipeInitConfig = {
  apiKey: string;
  endpoint: string;
  topic: string;
  batchSize?: number;
  batchTimeout?: number;
  captureErrors?: boolean;
  captureApiErrors?: boolean;
  captureApiRequests?: boolean;
  sampleRate?: number;
};

const UNOBSERVED_FETCH_KEY = "__TEAMIFY_UNOBSERVED_FETCH__";

declare global {
  interface Window {
    AIPipe?: {
      init: (config: AIPipeInitConfig) => void;
    };
    [UNOBSERVED_FETCH_KEY]?: typeof fetch;
  }
}

let scriptPromise: Promise<void> | null = null;
let initializedSignature = "";

export function normalizeAIPipeFrontendConfig(
  payload: unknown,
): AIPipeFrontendConfig | null {
  if (!payload || typeof payload !== "object") return null;
  const cfg = (payload as { aipipe_frontend?: unknown }).aipipe_frontend;
  if (!cfg || typeof cfg !== "object") return null;

  const raw = cfg as RawAIPipeFrontendConfig;
  if (
    typeof raw.script_url !== "string" ||
    typeof raw.api_key !== "string" ||
    typeof raw.endpoint !== "string" ||
    typeof raw.topic !== "string"
  ) {
    return null;
  }
  if (
    raw.script_url.trim() === "" ||
    raw.api_key.trim() === "" ||
    raw.endpoint.trim() === "" ||
    raw.topic.trim() === ""
  ) {
    return null;
  }

  if (!isHTTPURL(raw.script_url) || !isHTTPURL(raw.endpoint)) {
    return null;
  }

  const normalized: AIPipeFrontendConfig = {
    scriptUrl: raw.script_url,
    apiKey: raw.api_key,
    endpoint: raw.endpoint,
    topic: raw.topic,
  };
  assignPositiveNumber(normalized, "batchSize", raw.batch_size);
  assignPositiveNumber(normalized, "batchTimeout", raw.batch_timeout);
  assignBoolean(normalized, "captureErrors", raw.capture_errors);
  assignBoolean(normalized, "captureApiErrors", raw.capture_api_errors);
  assignBoolean(normalized, "captureApiRequests", raw.capture_api_requests);
  assignSampleRate(normalized, raw.sample_rate);
  return normalized;
}

export function AIPipeSdk() {
  useEffect(() => {
    let cancelled = false;
    if (typeof window !== "undefined" && !window[UNOBSERVED_FETCH_KEY]) {
      window[UNOBSERVED_FETCH_KEY] = window.fetch.bind(window);
    }

    fetch("/api/config", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const cfg = normalizeAIPipeFrontendConfig(payload);
        if (!cfg) return;
        const signature = [
          cfg.scriptUrl,
          cfg.apiKey,
          cfg.endpoint,
          cfg.topic,
          cfg.batchSize ?? "",
          cfg.batchTimeout ?? "",
          cfg.captureErrors ?? "",
          cfg.captureApiErrors ?? "",
          cfg.captureApiRequests ?? "",
          cfg.sampleRate ?? "",
        ].join("|");
        if (initializedSignature === signature) return;
        ensureScript(cfg.scriptUrl)
          .then(() => {
            if (cancelled || !window.AIPipe) return;
            window.AIPipe.init(toInitConfig(cfg));
            initializedSignature = signature;
          })
          .catch(() => {
            // Observability is optional; app startup must not depend on SDK load.
          });
      })
      .catch(() => {
        // Observability is optional; app startup must not depend on config fetch.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

function ensureScript(src: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.AIPipe) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.teamifyAipipeSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("AIPipe SDK load failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function toInitConfig(cfg: AIPipeFrontendConfig): AIPipeInitConfig {
  return {
    apiKey: cfg.apiKey,
    endpoint: cfg.endpoint,
    topic: cfg.topic,
    batchSize: cfg.batchSize,
    batchTimeout: cfg.batchTimeout,
    captureErrors: cfg.captureErrors,
    captureApiErrors: cfg.captureApiErrors,
    captureApiRequests: cfg.captureApiRequests,
    sampleRate: cfg.sampleRate,
  };
}

function isHTTPURL(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function assignPositiveNumber(
  target: AIPipeFrontendConfig,
  key: "batchSize" | "batchTimeout",
  value: unknown,
) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    target[key] = value;
  }
}

function assignBoolean(
  target: AIPipeFrontendConfig,
  key: "captureErrors" | "captureApiErrors" | "captureApiRequests",
  value: unknown,
) {
  if (typeof value === "boolean") {
    target[key] = value;
  }
}

function assignSampleRate(target: AIPipeFrontendConfig, value: unknown) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  ) {
    target.sampleRate = value;
  }
}
