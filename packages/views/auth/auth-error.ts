import { ApiError } from "@iteamify/core/api";
import { useT } from "../i18n";

export function retryAfterSeconds(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") return;
  if ("retry_after_seconds" in error.body && typeof error.body.retry_after_seconds === "number") {
    return Math.max(0, error.body.retry_after_seconds);
  }
  return undefined;
}

export function useAuthErrorMessage() {
  const { t } = useT("auth");
  return (error: unknown) => {
    if (error instanceof ApiError && error.status === 429) return t(($) => $.password_errors.rate_limited);
    if (error instanceof ApiError && error.body && typeof error.body === "object" && "code" in error.body) {
      switch (error.body.code) {
        case "credentials_invalid": return t(($) => $.password_errors.credentials_invalid);
        case "password_policy": return t(($) => $.password_errors.password_policy);
        case "current_password_invalid": return t(($) => $.password_errors.current_password_invalid);
        case "code_invalid": return t(($) => $.password_errors.code_invalid);
        case "proof_expired": return t(($) => $.password_errors.proof_expired);
        case "rate_limited": return t(($) => $.password_errors.rate_limited);
        case "send_failed": return t(($) => $.password_errors.send_failed);
        case "signup_disabled": return t(($) => $.password_errors.signup_disabled);
        case "account_exists": return t(($) => $.password_errors.account_exists);
        case "password_exists": return t(($) => $.password_errors.password_exists);
        case "invalid_request": return t(($) => $.password_errors.invalid_request);
        case "session_expired": return t(($) => $.password_errors.session_expired);
        default: return t(($) => $.password_errors.unavailable);
      }
    }
    return error instanceof Error ? error.message : t(($) => $.password_errors.unavailable);
  };
}
