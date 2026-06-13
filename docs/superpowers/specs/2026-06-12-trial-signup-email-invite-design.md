# Free Trial Email Invitation — Design Spec

**Date:** 2026-06-12
**Status:** Draft
**Author:** Claude Code

---

## Context

The suanpan landing page has a "免费试用" (Start free trial) CTA button in the header nav, hero section, pricing section, and bottom CTA section. Currently all these buttons link to `/signup`, which redirects to the login page — a generic auth flow not optimized for trial conversion.

The goal is to **replace the nav's "免费试用" button** with a dialog that collects the visitor's email and sends them a workspace invitation link. This reuses the existing invitation infrastructure (backend creates invitation record, sends email, user clicks link, registers, joins workspace) — no new backend endpoints needed, only a Next.js API route that authenticates as the caigou workspace owner.

**Why this approach:** The caigou workspace already has agents, workflows, and data configured. Inviting users directly into this workspace (as members) gives them an immediate, rich trial experience — they land in a real workspace with AI agents ready to help, rather than an empty workspace they need to set up themselves.

---

## Architecture

```
Visitor clicks "免费试用" in nav
  → TrialSignupDialog opens (Dialog component)
  → Visitor enters email, clicks submit
  → POST /api/trial-signup (Next.js Route Handler)
  → Route handler calls backend with service token:
      POST {REMOTE_API_URL}/api/workspaces/{TRIAL_WORKSPACE_ID}/members
      Body: { email, role: "member" }
  → Backend creates Invitation record, sends invitation email
  → Dialog shows success message

// Downstream (existing flow, unchanged):
Visitor receives email → clicks /invite/{id} link
  → If new user: InviteSignupPage (register + accept in one step)
  → If existing user: LoginPage → accept invitation
  → User joins caigou workspace with full AI agent access
```

---

## Components & Files

### New Files

| File | Purpose |
|------|---------|
| `packages/views/marketing/trial-signup-dialog.tsx` | Dialog with email input, submit, and success/error states |
| `apps/web/app/api/trial-signup/route.ts` | Next.js Route Handler — validates email, proxies to backend with service token |

### Modified Files

| File | Change |
|------|--------|
| `packages/views/marketing/nav.tsx` | Replace `<AppLink href="/signup">` with button that opens TrialSignupDialog |
| `packages/views/locales/en/marketing.json` | Add `trial_dialog.*` i18n keys |
| `packages/views/locales/zh-Hans/marketing.json` | Add `trial_dialog.*` i18n keys (Chinese) |
| `.env.example` | Document `TRIAL_WORKSPACE_ID` and `TRIAL_INVITER_TOKEN` |

---

## Component Design: TrialSignupDialog

**Location:** `packages/views/marketing/trial-signup-dialog.tsx`

**Props:**
```typescript
interface TrialSignupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Three UI states:**

1. **Input state** (default): Email input field + "Send Invitation Link" button
2. **Success state**: Confirmation message "Invitation sent! Check your inbox." + Close button
3. **Error state**: Error message below the input field (stays in input state)

**Uses existing components:**
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@teamify/ui`
- `Input` from `@teamify/ui`
- `Button` from `@teamify/ui`

**Behavior:**
- On mount: reset to input state, clear email field
- On submit: normalize email (trim whitespace, lowercase), validate format client-side, then POST to `/api/trial-signup`
- While submitting: disable both the input and submit button, change button text to "Sending..."
- On success: transition to success state (includes DialogDescription for accessibility)
- On error: show error message below input, stay in input state
- On close: reset state (so reopening starts fresh)
- Both input and success states include `DialogTitle` and `DialogDescription` for screen reader accessibility

---

## API Route Design: /api/trial-signup

**Location:** `apps/web/app/api/trial-signup/route.ts`

> **Architectural note:** `next.config.ts` has a rewrite rule `source: "/api/:path*" → ${remoteApiUrl}/api/:path*` that proxies all `/api/*` requests to the backend. In Next.js, **filesystem routes (Route Handlers) take precedence over rewrites** — when a Route Handler exists at `app/api/trial-signup/route.ts`, Next.js serves it directly without applying the rewrite. This is the first Route Handler in this project. Future Route Handlers at any `/api/*` path will similarly bypass the proxy, so use sparingly and add a comment in `next.config.ts` noting this behavior.

**Method:** POST

**Request body:**
```json
{ "email": "user@example.com" }
```

**Response (success):**
```json
{ "ok": true }
```

**Response (error):**
```json
{ "error": "error_already_member" | "error_invalid_email" | "error_rate_limit" | "error_generic" }
```

**Environment variables used:**
- `REMOTE_API_URL` — backend base URL (already present in `.env`)
- `TRIAL_WORKSPACE_ID` — UUID of the caigou workspace
- `TRIAL_INVITER_TOKEN` — JWT token for workspace owner authentication

**Implementation steps:**
1. Parse email from request body
2. Normalize email: trim whitespace, lowercase
3. Validate email format server-side (regex)
4. Check rate limit (by IP from `x-forwarded-for` or `x-real-ip` header)
5. Read `TRIAL_WORKSPACE_ID`, `TRIAL_INVITER_TOKEN`, and `REMOTE_API_URL` from `process.env`
6. If workspace ID or token is missing, return 500 with `error_generic`
7. Call backend: `POST ${REMOTE_API_URL}/api/workspaces/${wsId}/members` with `Authorization: Bearer ${token}` and body `{ email, role: "member" }`
8. If backend returns 409 (already member): return 409 with `{ error: "error_already_member" }`
9. If backend returns other error: return 500 with `{ error: "error_generic" }`
10. On success: return 200 with `{ ok: true }`

**Rate limiting:** In-memory rate limiter — max 5 requests per IP per minute. Uses a simple `Map<string, { count, resetAt }>` with periodic cleanup. Returns 429 with `{ error: "error_rate_limit" }` when exceeded. Suitable for single-instance deployment; for multi-instance (e.g., Vercel), upgrade to Redis-based rate limiting.

**Security:**
- Service token (`TRIAL_INVITER_TOKEN`) is never exposed to the client — it lives only in server-side env vars and is used exclusively in this Route Handler
- **Token lifecycle:** The JWT may expire. If it does, the backend returns 401 and the dialog shows `error_generic`. Operations should monitor for this and rotate the token before expiry. For production, consider requesting a dedicated service-to-service API key from the backend that does not expire
- Email validated and normalized server-side
- Rate limiting prevents abuse
- No CORS headers needed (same-origin request)

---

## Nav Modification

**File:** `packages/views/marketing/nav.tsx`

**Current behavior:** The "免费试用" button is an `<AppLink href="/signup">`.

**New behavior:** The button becomes a `<button>` that opens `TrialSignupDialog`. Add `useState<boolean>` to track dialog open state. The `TrialSignupDialog` component renders after the closing `</header>` tag (not inside the header's flex container) — the Dialog uses a portal to render the overlay at the body level, so DOM placement of the JSX trigger doesn't affect visual layout, but placing it outside the header avoids unnecessary nesting.

```tsx
// Before:
<AppLink href="/signup" className="...">
  {t(($) => $.nav.sign_up)}
</AppLink>

// After (inside the header's button group):
<button onClick={() => setTrialDialogOpen(true)} className="...">
  {t(($) => $.nav.sign_up)}
</button>

// After the closing </header> tag, as a sibling:
<TrialSignupDialog open={trialDialogOpen} onOpenChange={setTrialDialogOpen} />
```

The button styling remains identical — only the element type changes from `<a>` to `<button>`.

---

## Environment Variables

```env
# Required for trial signup invitation feature
# The UUID of the workspace to invite trial users into
TRIAL_WORKSPACE_ID=

# JWT token of a user who is owner of the trial workspace
# Used by the API route to authenticate with the backend
TRIAL_INVITER_TOKEN=
```

These must be set in `.env` (local dev) and deployment environment. If unset, the API route returns a 500 error and the dialog shows the generic error message.

---

## i18n Keys

Added under `marketing.json` → `trial_dialog`:

| Key | EN | ZH |
|-----|----|----|
| `title` | Start Your Free Trial | 开始免费试用 |
| `description` | Enter your email to receive an invitation link. | 输入邮箱，获取邀请链接 |
| `email_placeholder` | you@company.com | you@company.com |
| `submit` | Send Invitation Link | 发送邀请链接 |
| `submitting` | Sending... | 发送中... |
| `success_title` | Invitation Sent! | 邀请已发送！ |
| `success_description` | Check your inbox for the invitation link. Click it to create your account and start your free trial. | 请查看邮箱，点击邀请链接即可创建账户并开始试用。 |
| `error_invalid_email` | Please enter a valid email address. | 请输入有效的邮箱地址 |
| `error_generic` | Something went wrong. Please try again. | 出错了，请重试。 |
| `error_already_member` | This email is already a workspace member. | 该邮箱已是工作区成员。 |
| `error_rate_limit` | Too many requests. Please wait and try again. | 请求过于频繁，请稍后再试。 |

---

## User Flow (End to End)

1. Visitor lands on suanpan landing page
2. Clicks "免费试用" in the nav header
3. Dialog opens with email input
4. Enters email, clicks "发送邀请链接"
5. Dialog shows "邀请已发送！" confirmation
6. Visitor closes dialog, continues browsing
7. Backend sends invitation email to the provided address
8. Visitor opens email, clicks invitation link → `/invite/{id}`
9. If new user: sees InviteSignupPage → sets password → account created + invitation accepted → lands in caigou workspace
10. If existing user: sees LoginPage → logs in → accepts invitation → lands in caigou workspace

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Email already has pending invitation | Backend handles idempotently — returns success, existing invitation is re-sent or returned |
| Email is already a workspace member | API route detects 409 from backend → dialog shows `error_already_member` |
| Invalid email format | Client-side validation prevents submit + server-side validation returns `error_invalid_email` |
| Missing env vars | API route returns 500 → dialog shows `error_generic` |
| Rate limit exceeded | API route returns 429 → dialog shows `error_rate_limit` |
| Network error | Fetch throws → dialog shows `error_generic` |

---

## Scope Exclusions

- **Other CTA buttons** (hero, pricing, bottom CTA) remain as `<AppLink href="/signup">` for now. Can be migrated to the dialog in a follow-up.
- **Desktop app**: This feature is web-only (landing page). Desktop does not have a landing page.
- **Backend changes**: No backend modifications needed. The existing `POST /api/workspaces/{id}/members` endpoint handles everything.
- **Captcha/bot protection**: Not included in V1. The rate limiter provides basic protection. If spam becomes an issue, add reCAPTCHA/turnstile in a follow-up.

---

## Verification Plan

1. **Unit tests** (`pnpm test`):
   - `trial-signup-dialog.test.tsx` — renders dialog, validates email, handles submit, shows success/error states
   - Mock `fetch` for API call tests
   - Update existing `landing-page.test.tsx` — the nav "Start free trial" element changes from `<a href="/signup">` to `<button>`, existing tests that assert link targets need updating; add test that clicking the button opens the dialog

2. **API route test**:
   - `apps/web/app/api/trial-signup/route.test.ts` — validates email, handles missing env vars, proxies to backend correctly, rate limiting

3. **Manual end-to-end test**:
   - Start dev server (`make dev`)
   - Open landing page
   - Click "免费试用" in nav
   - Enter a test email
   - Verify dialog shows success
   - Check backend for invitation record
   - Click invitation link in email (or manually navigate to `/invite/{id}`)
   - Complete signup and verify user joins caigou workspace

4. **Type check**: `pnpm typecheck` passes
5. **Lint**: `pnpm lint` passes
