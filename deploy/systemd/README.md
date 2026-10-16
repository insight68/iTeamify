# Native services

Run backend, web and the optional OpenAgent daemon as separate systemd services. Build the backend and migration runner from `server/cmd/server` and `server/cmd/migrate`; build Web with `pnpm --filter @iteamify/web build`.

OpenAgent uses schema v5 in `config.yaml.example`. Run `iteamify-config init`, enable `openagent` and set its daemon UUID, then compile. Load `openagent-backend.env` into the backend and `openagent-daemon.env` into the daemon. Init generates an independent daemon service token and a stable 32-byte workspace-credential encryption key. Keep these private files and preserve the encryption key across upgrades.

Workspace owners configure their own OpenAgent endpoint, model and provider API key in Settings → OpenAgent. Keys are encrypted in the backend database. The shared daemon fetches only the workspace configuration of each task; it has no global provider binding. No template or admin workspace is required.

For local development, set matching `ITEAMIFY_MANAGED_DAEMON_ID` and `ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN` on backend and daemon; set base64 `ITEAMIFY_OPENAGENT_SECRET_KEY` only on the backend.
