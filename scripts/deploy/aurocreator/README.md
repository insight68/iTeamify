# Web release compatibility

`deploy-aurocreator.sh web` builds an independent standalone artifact and sets
`NEXT_DEPLOYMENT_ID` to the artifact identity: a fingerprint of the sources plus
the values baked into the bundle (app version, upstream API URL, Node.js
version), computed on the build host before the build. The same sources always
produce the same identity, so the Turbo task hash, the `dpl` asset archives, the
Nginx identity whitelist, and the smoke/verify checks all agree on it. Never
relabel a different artifact with an existing identity, and never key the
identity on the per-run `RELEASE_ID` again: a unique identity per deployment
makes every Turbo task a cache miss and forces a cold compile on the deployment
host, while `RELEASE_ID` keeps naming the release directory, lock, and log.

The smoke helper chooses a free loopback port by default. An explicit occupied
test port is rejected. It starts its own candidate and
checks both its process lifetime and the HTTP deployment identity. It reaps the
candidate on success, failure, timeout, and cancellation. After activation, the
systemd PID, actual working directory, and served identity must match the
candidate. A plain HTTP 200 is insufficient.

Before activation, the helper archives public `_next/static` assets from the new
artifact and retained runtimes. Nginx serves known `dpl` identities from their
own archive, with a shared immutable fallback for older hashed URLs. Fixed
BUILD_ID metadata stays in separate archives; it must never be overwritten in a
shared directory. Reusing an asset path with different bytes fails deployment.
Only static files are exposed, never the standalone server or source tree.

The generated Nginx map is an identity whitelist. Configuration changes run
`nginx -t` and restore the previous files on validation failure. The public
static verification checks sampled JS, CSS, and build metadata against archive
SHA-256 digests before runtime activation is accepted. A runtime rollback keeps
the newly published assets available for tabs that already loaded that version.

Public checks send the identifiable `aurocreator-deployment/1.0` User-Agent.
The default Python urllib client can receive Cloudflare 403/1010 even when the
same asset is available to browsers. HTTP errors still fail deployment and name
the URL and responding server; resource hashes and HTML identity remain required.

`WEB_ASSET_KEEP=3` and `WEB_ASSET_DAYS=14` default to retaining at least the latest
three static artifacts and all artifacts published within fourteen days.
Current and retained runtime rollback targets are always protected. Static
retention is independent of `RELEASE_KEEP`; run normal `prune` to collect only
unreferenced immutable files. These windows do not promise indefinite old-tab
support. Go API and WebSocket compatibility still need their own acceptance.

At the CDN, preserve the `dpl` query in the cache key for deployment metadata.
Hash assets remain immutable. Keep authenticated HTML/API caching policies
unchanged. The origin checks cannot establish the CDN cache-key configuration.

For each production rollout, keep an A-version tab open without opening search,
modals, or floating chat. Activate B, open those features in A, navigate from A,
then test B-to-A rollback. Check old JS/CSS responses, current HTML identity,
draft restoration, and API/WebSocket behavior. Include typing followed by an
immediate full-page navigation, IME input, pending uploads, and successful-send
draft clearing. Local draft flush cannot preserve a browser File object's bytes
or complete an interrupted network upload.

Run local deployment checks with `bash scripts/deploy-aurocreator.test.sh`.
For an isolated production verification build, use a top-level output directory
such as `NEXT_DIST_DIR=.next-performance-final` with the direct web build command.
Production deployment continues to use `.next`. A custom validation directory
is not a Turbo cached build output and must not be used with `turbo build`.

The web install/build/activation phase runs as a transient systemd service with
a one-hour limit. Every streamed build line carries a UTC arrival timestamp and
each stage logs its own duration, so a compile that prints nothing is still
visible as elapsed time rather than a hang. SSH observes incremental logs and
reports the current stage, the total wait, and the time since the last new line
while the job stays quiet; disconnecting or cancelling the observer leaves the
server job running. Cancellation exits with 130/143, never success. The server
job keeps the deployment lock through activation and records its real exit code
before completion is reported. A full deployment reacquires the lock before
deploying the daemon. A disconnected full deployment does not resume that later
phase automatically. `deploy-status` and `web-status` report each component's
active release and service state. A full deployment stays pending until server,
Web and daemon all have the requested activated release; an absent scope record
is reported as unknown, never inferred to be complete.

Production `build` explicitly uses webpack. `build:turbopack` is available for
isolated measurements; switch production only after cold/warm comparisons on
the target architecture, with successful smoke/activation checks. A bundler's
cache is independent of Turbo's cache of complete artifacts. Source sync
preserves workspace dependency directories and includes the root `.gitignore`.
Build and transitive `cache-inputs` tasks also explicitly exclude `.next*`,
`node_modules`, `.turbo`, TypeScript build info and Next's generated declaration
shim. This is necessary on the source-only deployment host, which has no Git
checkout and otherwise hashes generated artifacts as task inputs. Regression
checks change both generated files and shared source files with the real Turbo
binary: generated changes must keep the hash, shared sources must change it.

Logs record Turbo, webpack, Turbopack and total Next cache sizes separately,
before and after a build, even when compilation fails. `NEXT_CACHE_MAX_MB`
(default 4096) is a warning budget; deployment and `prune` preserve the compiler
caches instead of deleting the whole directory when different caches together
cross the budget. Review disk capacity and per-compiler usage before deliberate
cleanup. No fixed warm-build duration is promised.

Each job saves `stage-timings.tsv`, `started-at`, `finished-at` and `resources`
(systemd cgroup MemoryPeak/CPUUsageNSec captured before collection). The first
compiler output delay includes Turbo setup/input hashing; on a Turbo cache hit
the compiler output may be replayed and does not measure actual Next execution.

Inspect an existing job with `RELEASE_ID=<id> ./scripts/deploy-aurocreator.sh
web-status`. Its logs are `/var/log/aurocreator/web-deploy-<id>.log` and its exit
status is `/opt/aurocreator/build/deploy/jobs/<id>/exit-code`. `unlock` rejects
active server jobs, including activation after the build process has exited.
Use `RELEASE_ID=<id> ./scripts/deploy-aurocreator.sh web-wait` to reconnect and
wait for the real exit code without syncing, dispatching, or changing the lock.
The observer uses braced variables at Unicode boundaries and works on macOS
Bash 3.2 as well as the server's Bash 5.2.

After a full deployment's Web job succeeds, `RELEASE_ID=<id>
./scripts/deploy-aurocreator.sh deploy-resume` completes the pending daemon from
the **already uploaded archive**, using the original server manifest metadata.
It acquires the deployment lock and rejects a scope mismatch, failed job or
changed current server/Web release before activation, then runs full verify.
It never rebuilds the daemon from the current local source tree. Daemon
activation still requires the existing runtime to be healthy and idle.

To rebuild a failed, unactivated Web attempt, use `WEB_RETRY_BUILD=1
RELEASE_ID=<original-id> ./scripts/deploy-aurocreator.sh web`. This syncs the
current frontend sources, performs a new build with its actual fingerprint,
and preserves failed job/candidate records in quarantine. Review source
differences before retrying a full release. It refuses a running job or an
already activated release and cannot be combined with `WEB_REUSE_BUILD=1`.

To finish an interrupted deployment whose build already completed, run
`WEB_REUSE_BUILD=1 RELEASE_ID=<original-id> ./scripts/deploy-aurocreator.sh web`.
This skips source sync, install, and compilation. It recomputes the source
fingerprint and requires the existing build and standalone tree to carry exactly
that identity, then validates BUILD_ID, manifests, server entry, and static
chunks before copying the candidate and running normal smoke/activation checks.
A source tree that has changed since the build no longer matches and must be
built again. Unactivated failed release directories and failed job records are
quarantined for diagnosis. Current or previously activated releases cannot be
overwritten. Never relabel a different build to resume.
