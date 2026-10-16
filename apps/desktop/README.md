# Desktop builds and distribution

Node 22 and the Go version declared in `server/go.mod` are the CI toolchains.
Run `pnpm install --frozen-lockfile` at the repository root after changing dependencies.

```sh
pnpm -C apps/desktop build                         # Cached main/preload/renderer; no Go needed
pnpm -C apps/desktop bundle-cli                    # Strict host CLI build
pnpm -C apps/desktop package --mac --arm64 --dir --publish never
pnpm -C apps/desktop smoke                         # Launch the packaged host application
pnpm -C apps/desktop package --mac --arm64 --publish never
pnpm -C apps/desktop exec node scripts/stage-artifacts.mjs
```

Replace `--mac --arm64` with the desired platform/architecture. Packaging uses
Turbo for Electron bundles, then compiles each CLI outside Turbo and verifies
its GOOS/GOARCH. The renderer cache restores only `out/`, never CLI binaries or
installers. A Go-only edit therefore needs no renderer rebuild but is always
compiled into the next package. CLI build dates come from `SOURCE_DATE_EPOCH`
or the commit timestamp; production binaries use `-trimpath -s -w` as CLI
releases already do. Development retains debug symbols.

Renderer dependencies belong in `devDependencies` because Vite bundles them.
Only external main/preload dependencies belong in `dependencies`. Every package
must contain the real external modules, the compiled renderer and a matching
unpacked CLI, and its ASAR must stay within the 60 MiB budget. Checks run both
before and after signing. Icons and macOS entitlements are tracked in `build/`.

The native smoke uses a temporary HOME/USERPROFILE/userData, a loopback API,
and blocked external renderer requests. It exercises the actual packaged
main/preload/renderer, daemon IPC, native CLI version/architecture, and PDF
generation. It never logs into a real account or starts an agent. Failures,
missing binaries and timeouts fail the job.

## CI

- `ci.yml` is the sole main/PR validation workflow. The required `frontend`
  gate includes Desktop results. Backend-only CLI changes also trigger Desktop.
- Relevant PRs package and smoke Linux x64, Windows x64 and macOS arm64.
- Main builds installers and runs native smoke on all six OS/CPU combinations.
- `desktop-smoke.yml` offers the same six-target installer build manually.
- Tag releases build Desktop independently of the upstream Homebrew job.
- Uploaded artifacts contain installers, blockmaps, integrity reports and
  SHA256 lists. Unpacked applications are excluded. Retention is seven days.

## Public releases

Unconfigured builds produce CI artifacts and have automatic updates and CLI
downloads disabled. They do not inherit the upstream project's release feed.

For public GitHub distribution, configure these repository variables:

| Variable | Value |
| --- | --- |
| `DESKTOP_RELEASE_REPOSITORY` | `OWNER/PUBLIC-RELEASE-REPO` |
| `DESKTOP_DOWNLOAD_URL` | `https://github.com/OWNER/PUBLIC-RELEASE-REPO/releases/latest/download` |

The source repository can remain private. The download URL is public and
compiled into main; it must never contain credentials. Generic HTTPS download
sites can use `DESKTOP_DOWNLOAD_URL` for installer metadata, but automated
publication currently targets a public GitHub release repository.

Configure these Actions secrets before enabling public tag publication:

| Secret | Purpose |
| --- | --- |
| `DESKTOP_RELEASE_TOKEN` | Contents write permission on the public distribution repository |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | Developer ID certificate (P12 URL/base64) and password |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Apple notarization |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Optional Windows certificate and password |

Public macOS builds fail if signing/notarization credentials are missing.
Windows builds remain unsigned until Windows signing secrets are configured.
PR/main artifacts are unsigned verification builds; signing and notarization
are release checks, distinct from native startup checks.

The release pipeline verifies all six native reports, installer feed SHA512
and file sizes, Desktop SHA256 lists, and CLI archive checksums before opening
a draft in the public repository. It uploads all assets and publishes the
draft only after upload succeeds. Retries can resume drafts; published
releases cannot be overwritten. CLI archive build settings come from the root
GoReleaser config, with upstream Homebrew exports removed for this pipeline.

Changes are ready for remote validation only after they are committed/pushed.
Local macOS validation does not establish Linux/Windows success, Apple
notarization, Windows signing, or production auto-update acceptance.
