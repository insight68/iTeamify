# Native Gmail connection setup

iTeamify's Gmail connection is user-owned and does not depend on Composio. An
administrator configures one Google OAuth application for the deployment; each
user then clicks **Connect Gmail**, chooses an account, and grants read-only
access. No user needs an email password, IMAP host, or app password.

The minimum setup uses incremental Gmail History synchronization every five
minutes. Google Cloud Pub/Sub is an optional low-latency accelerator. The
periodic history sync remains enabled when Pub/Sub is configured because Gmail
notifications can be delayed or dropped.

## 1. Minimum setup: OAuth and polling

1. Create or select a Google Cloud project and enable **Gmail API**.
2. Configure the OAuth consent screen. During development, add every tester as
   a test user. Add this exact scope:

   ```text
   https://www.googleapis.com/auth/gmail.readonly
   ```

3. Create an OAuth client of type **Web application**.
4. Add this exact authorized redirect URI, using the public HTTPS API origin:

   ```text
   https://YOUR_PUBLIC_ORIGIN/api/integrations/gmail/callback
   ```

5. Configure the server:

   ```bash
   GOOGLE_GMAIL_CLIENT_ID=YOUR_WEB_CLIENT_ID
   GOOGLE_GMAIL_CLIENT_SECRET=YOUR_WEB_CLIENT_SECRET
   ITEAMIFY_GMAIL_CALLBACK_BASE_URL=https://YOUR_PUBLIC_ORIGIN
   ITEAMIFY_GMAIL_SECRET_KEY=BASE64_ENCODED_32_BYTE_KEY
   ```

   Generate a dedicated encryption key with `openssl rand -base64 32`. If this
   variable is omitted, iTeamify derives a Gmail-specific key from `JWT_SECRET`;
   the dedicated key is preferable in production. Do not rotate either value
   without a credential re-encryption plan.

6. Configure a lightweight model for automatic analysis:

   ```bash
   ITEAMIFY_LLM_API_KEY=YOUR_MODEL_API_KEY
   ITEAMIFY_LLM_BASE_URL=
   ITEAMIFY_LLM_DEFAULT_MODEL=
   ```

   `ITEAMIFY_LLM_BASE_URL` may target an OpenAI-compatible gateway. If no model is
   configured, Gmail still connects and receives mail; analysis stays queued
   until a model becomes available.

7. Run the database migrations, restart the backend, open `/connections`, and
   click **Connect Gmail**. The Google consent screen is the only configuration
   an end user sees.

`GOOGLE_GMAIL_CLIENT_ID` and `GOOGLE_GMAIL_CLIENT_SECRET` may be omitted to
reuse the normal `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. A separate OAuth
client is recommended so login and restricted Gmail access have independent
consent and verification lifecycles.

## 2. Optional: low-latency Pub/Sub push

Set shell variables before using the commands below:

```bash
PROJECT_ID=your-google-project-id
PROJECT_NUMBER=your-google-project-number
TOPIC_ID=iteamify-gmail
SUBSCRIPTION_ID=iteamify-gmail-push
PUSH_SERVICE_ACCOUNT=iteamify-gmail-push@${PROJECT_ID}.iam.gserviceaccount.com
PUSH_ENDPOINT=https://YOUR_PUBLIC_ORIGIN/api/webhooks/google/gmail
```

Enable Pub/Sub and create the topic:

```bash
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project="${PROJECT_ID}"
gcloud pubsub topics create "${TOPIC_ID}" --project="${PROJECT_ID}"
gcloud pubsub topics add-iam-policy-binding "${TOPIC_ID}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

Create the identity used by authenticated push delivery and let the Pub/Sub
service agent mint its OIDC token:

```bash
gcloud iam service-accounts create iteamify-gmail-push --project="${PROJECT_ID}"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

Create the push subscription. Keep payload unwrapping disabled: iTeamify expects
the standard Pub/Sub JSON envelope.

```bash
gcloud pubsub subscriptions create "${SUBSCRIPTION_ID}" \
  --project="${PROJECT_ID}" \
  --topic="${TOPIC_ID}" \
  --push-endpoint="${PUSH_ENDPOINT}" \
  --push-auth-service-account="${PUSH_SERVICE_ACCOUNT}" \
  --push-auth-token-audience="${PUSH_ENDPOINT}"
```

Configure iTeamify with values that exactly match the subscription:

```bash
ITEAMIFY_GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/iteamify-gmail
ITEAMIFY_GMAIL_PUSH_AUDIENCE=https://YOUR_PUBLIC_ORIGIN/api/webhooks/google/gmail
ITEAMIFY_GMAIL_PUSH_SERVICE_ACCOUNT=iteamify-gmail-push@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

iTeamify validates the Google signature, issuer, expiration, audience, verified
email claim, and service-account email before accepting a push. It persists a
coalesced sync job before returning HTTP 204; Gmail API calls and model analysis
never run inside the webhook request.

For a local-only test, `ITEAMIFY_GMAIL_PUSH_TOKEN` can instead protect a push URL
ending in `?token=...`. OIDC is the production recommendation because query
tokens can appear in proxy logs. Do not configure both authentication modes.

## 3. Production launch checklist

- Use HTTPS for the callback and push endpoint.
- Complete Google's OAuth verification before a public launch. The
  `gmail.readonly` scope is restricted; because iTeamify stores or transmits its
  data on a server, Google can require a recurring third-party security
  assessment.
- Publish a privacy policy, terms, deletion instructions, and use-case video
  that match the consent screen and requested scope.
- Back up the encryption key separately from the database. A database snapshot
  alone cannot decrypt refresh tokens.
- Monitor connection attention status, sync job age, analysis backlog, Gmail
  quota errors, Pub/Sub delivery failures, and watch-renewal failures.
- Disconnecting an account atomically removes its stored credential, copied
  messages, analysis bindings, sync job, and Gmail-derived inbox items, then
  makes a best-effort Google authorization revocation.

## 4. Runtime behavior

- One refresh token belongs to one iTeamify user and Gmail account.
- Workspace bindings decide where analysis notifications are delivered; they
  never own or duplicate the OAuth credential.
- New notifications increment a per-mailbox generation. One worker processes a
  mailbox at a time, while different mailboxes synchronize in parallel.
- Pub/Sub watches are renewed on a daily cadence; the five-minute history poll
  remains the correctness fallback if a notification is delayed or dropped.
- Messages are idempotent on `(connection_id, gmail_message_id)`.
- Only bounded message text is copied (64,000 characters); attachments are not
  copied. Analysis reads at most 16,000 characters. The copied body is cleared
  after successful analysis; any still-unprocessed body is scrubbed after 30
  days in bounded cleanup batches.
- A stale Gmail History cursor triggers a bounded recovery from the last
  successful sync, capped at 30 days, rather than a full-mailbox import.
