# Vikunja PWA

Unofficial third-party Vikunja client.

This project is a free, independent PWA client for the Vikunja API. It is not
affiliated with, endorsed by, or maintained by the official Vikunja project or
its maintainers.

Vikunja PWA is a mobile-first, installable client for self-hosted Vikunja
instances. It keeps the real Vikunja API and data model, but wraps them in a
faster touch-friendly shell with better task-tree handling, stronger
cross-device ergonomics, and a same-origin backend for sessions and optional
admin tooling.

## Why This Client

- drag-and-drop friendly task handling across supported project views
- real project and task tree browsing instead of flattening everything into a single list
- mobile-first interaction model that still scales up to tablet and desktop layouts
- installable PWA shell with offline reopen support and browser notification setup
- same-origin backend for safer session handling, share flows, and optional CLI-backed admin actions

## Current product state

The current public release is `0.2.1`. It is a small hotfix release on top of
the `0.2.0-alpha` prototype snapshot: feature-rich enough to use and evaluate,
but not yet presented as a production-ready client.

- Today-first shell with Inbox, Upcoming, Projects, Search, Labels, and Settings
- nested sub-project browsing with inline parent/child task trees and continuous add flows
- list, Kanban, Table, and Gantt project views backed by the real Vikunja API
- responsive desktop and tablet shell with sidebar and inspector behavior
- collaboration flows for users, teams, project sharing, link shares, and shared-project access
- backend-managed account sessions, onboarding flows, avatar management, and notification preferences
- installable PWA runtime with offline reopen support, service-worker shell caching, and notification setup
- optional admin control-plane features for user management, SMTP diagnostics, and deployment-aware apply/restart

Recent work has focused on stability and release readiness rather than flashy
scope growth: structural cleanup, security hardening, open-source packaging,
Docker/deploy polish, avatar parity, onboarding/auth flows, and the first pass
of the admin control plane are all included in this alpha.

## What's New In 0.2.1

- Expired or invalid persisted password sessions are now cleared cleanly instead of leaving the app stuck in a refresh-token failure loop.
- The stale-session path now drops back to sign-in after the first failed refresh attempt, which also avoids the follow-on `Too many requests` noise that could appear during bootstrap.

## 0.2 alpha scope

The first public alpha is intentionally narrower than the full roadmap. The aim
is to ship a coherent, open-source-shareable snapshot with strong core task
handling, collaboration coverage, and a realistic deployment story.

## What's New In 0.2.0-alpha

- Full avatar management was added, including provider switching (`Default avatar`, `Initials`, `Gravatar`, `Marble`, `Upload`) and uploaded-avatar support.
- Account onboarding now includes registration, forgot-password, reset-password, and reset-link handoff for single-instance deployments.
- Email delivery can now be configured from the PWA through SMTP settings, test mail diagnostics, and apply/restart support instead of requiring manual server-side edits only.
- Admin bridge access is now explicitly operator-gated, and the email/SMTP settings UI now reflects whether the current deployment is writable or read-only.
- Mail diagnostics were tightened so email test failures are reported correctly even when the Vikunja CLI exits with status `0`.
- The Docker release target was updated to Node 22, and the image now includes the Compose support needed for admin apply/restart flows.
- The post-0.1 stabilization work also includes task-move and completion-refresh fixes across list, Kanban, Today, and cross-project drag/drop flows.
- Smoke coverage was expanded for avatars, onboarding/auth, drag-and-drop, task detail, email admin flows, operator auth, compose apply, and mail diagnostics.

Included in `0.2.0-alpha`:

- mobile-first shell with Today, Inbox, Upcoming, Projects, Search, Labels, and Settings
- nested project and task hierarchy handling
- task/project detail overlays and responsive desktop/tablet shell
- list, Kanban, Table, and Gantt project views
- collaboration suite: users, teams, sharing, link shares, and shared-project shell
- read-only offline restore and cached browsing
- browser notification capability setup plus notification-center preferences
- first-pass bulk task editing on list/tree task surfaces
- first-pass onboarding and auth flows: registration, forgot password, reset password, and reset-link handoff
- SMTP administration with operator-only bridge access, testmail diagnostics, and deploy-aware apply/restart

Explicitly not in `0.2.0-alpha`:

- offline sync, queued edits, or conflict handling
- real event-driven push delivery
- saved-filter authoring/builder UI
- richer post-v1 platform features like OIDC, share target, app-store packaging, or multi-account switching UX

## Changes Since The GitHub v0.1.0-alpha Snapshot

The last public GitHub snapshot is `v0.1.0-alpha` on `github/main`. Since that
release, this repo has gained:

- Full avatar management was added, including avatar-provider switching, uploaded avatars, live avatar-route compatibility, and regression coverage for that surface.
- Registration, forgot-password, reset-password, and reset-link handoff were added so the app now covers the first pass of user onboarding instead of sign-in only.
- Email delivery administration was added to the admin settings flow, including SMTP config inspection, save, apply/restart, and testmail diagnostics.
- Admin bridge authorization no longer assumes a built-in Vikunja admin role and now uses an explicit operator email allowlist on the PWA side.
- Writable admin config handling now supports real deployment sources instead of writing into the running container filesystem, and the email settings UI reflects writable versus read-only capability.
- Mail diagnostics were corrected so SMTP/email delivery failures are surfaced even when the Vikunja CLI prints an error but still exits `0`.
- The Docker/runtime path was updated to Node 22, the container now includes Compose support for apply/restart, and the build no longer emits the earlier engine warnings.
- Task-move and completion-refresh stability improved after `v0.1.0-alpha`, with follow-up fixes for cross-project moves, list completion, Kanban completion, and Today due-date preservation.
- The smoke suite broadened substantially after `v0.1.0-alpha`, adding coverage for avatars, onboarding/auth, drag-and-drop, project/task detail flows, email admin config, operator auth, compose apply, and mail diagnostics.

## Screenshots

### Demo

[![Watch the demo on YouTube](https://img.youtube.com/vi/NCnS1X4c3dg/maxresdefault.jpg)](https://youtu.be/NCnS1X4c3dg)

### Mobile

| Today | Inbox | Quick Add |
|:---:|:---:|:---:|
| ![Today screen](docs/media/Mobile%201.PNG) | ![Inbox screen](docs/media/Mobile%202.PNG) | ![Quick add](docs/media/Mobile%203.PNG) |

| Projects | Project Detail | Navigation |
|:---:|:---:|:---:|
| ![Projects screen](docs/media/Mobile%204.PNG) | ![Project detail with sub-projects](docs/media/Mobile%205.PNG) | ![Navigation menu](docs/media/Mobile%206.PNG) |

| Settings |
|:---:|
| ![Settings screen](docs/media/Mobile%207.PNG) |

### Desktop

| Today | Projects | Project Detail |
|:---:|:---:|:---:|
| ![Desktop today view](docs/media/Desktop%201.png) | ![Desktop projects with inspector](docs/media/Desktop%202.png) | ![Desktop project detail](docs/media/Desktop%203.png) |

## Prerequisites

- Node.js >= 20.0.0
- npm
- Optional: Docker / Docker Compose for the included container deployment example
- A reachable Vikunja instance
- Current development and CI validation run on Node 24.x
- For iPhone/iPad PWA validation: a trusted HTTPS origin and local/dev certificates
- For local UI smoke runs: Playwright Chromium installed via `npx playwright install chromium`

## Quick start

1. Copy `.env.example` to `.env`.
2. Set what you need:
   - optionally `VIKUNJA_DEFAULT_BASE_URL`
   - leave `VIKUNJA_DEFAULT_BASE_URL` blank if you want the server field to start empty
   - optionally `APP_PUBLIC_ORIGIN`
   - optionally `APP_TRUST_PROXY=true` when the app is behind a trusted reverse proxy that sets `X-Forwarded-For`
   - optionally `APP_SESSION_STORE_PATH`
   - optionally `APP_SESSION_KEY_PATH`
   - optionally `HOST`
   - optionally `PORT`
3. Optional HTTPS and bridge runtime files:
   - put runtime-only certs or SSH keys in `./deploy/`
   - these files are intentionally ignored by git and excluded from Docker image builds
4. If you want admin user management through the Vikunja CLI bridge:
   - same-host Docker deployment:
     - `VIKUNJA_BRIDGE_MODE=docker-exec`
     - `VIKUNJA_CONTAINER_NAME`
     - `VIKUNJA_CLI_PATH`
   - development from a Mac against a VM-hosted Vikunja Docker container:
     - `VIKUNJA_BRIDGE_MODE=ssh-docker-exec`
     - `VIKUNJA_SSH_DESTINATION`
     - optionally `VIKUNJA_SSH_KEY_PATH`
     - `VIKUNJA_CONTAINER_NAME`
     - `VIKUNJA_CLI_PATH`
5. Optional development fallback only:
   - `VIKUNJA_BASE_URL`
   - `VIKUNJA_API_TOKEN`
   - not recommended for production
6. For local development, use two terminals:

```bash
npm run dev
npm run dev:react
```

7. Open the React app:

```text
http://127.0.0.1:4300
```

For a first phone test on the same Wi-Fi/LAN, open:

```text
http://<your-mac-ip>:4300
```

If you keep the default `HOST=0.0.0.0`, the server will listen on the local network as well.

For iPhone offline-shell and browser-notification testing, use trusted HTTPS instead:

```env
APP_PUBLIC_ORIGIN=https://<your-mac-ip>:4300
APP_HTTPS_KEY_PATH=/app/deploy/key.pem
APP_HTTPS_CERT_PATH=/app/deploy/cert.pem
COOKIE_SECURE=true
APP_TRUST_PROXY=false
```

Then place those files in `./deploy/`, open the HTTPS origin in Safari, and add that HTTPS app to the Home Screen.

For a production-style local run:

```bash
npm run build
npm start
```

## Docker

The included `docker-compose.yml` now defaults to the simplest public path:

- plain HTTP
- no HTTPS cert requirement
- no admin bridge requirement

Minimal Docker Desktop test:

1. Copy `.env.example` to `.env`
2. Optionally set `VIKUNJA_DEFAULT_BASE_URL`
3. Leave it blank if you want a clean public/shareable benchmark with no prefilled server URL
4. Run `docker compose up --build`
5. Open `http://localhost:4300`

Optional advanced Docker features stay in the same compose file and are enabled by environment variables:

- HTTPS: set `APP_HTTPS_CERT_PATH`, `APP_HTTPS_KEY_PATH`, and `APP_PUBLIC_ORIGIN`, then place the cert files in `./deploy/`
- same-host admin bridge: set `VIKUNJA_BRIDGE_MODE=docker-exec`
- remote admin bridge: set `VIKUNJA_BRIDGE_MODE=ssh-docker-exec` and the SSH vars, then place the SSH key in `./deploy/`
- operator authorization: set `ADMIN_BRIDGE_ALLOWED_EMAILS=you@example.com`
- writable SMTP/admin config:
  - for local `docker-exec` deployments where this PWA also runs in Docker, set `VIKUNJA_ADMIN_SOURCE_HOST_PATH` to the authoritative upstream Vikunja deployment directory on the host
  - then point `VIKUNJA_HOST_CONFIG_PATH` or `VIKUNJA_COMPOSE_PATH` at the mounted in-container path under `/app/admin-source`
  - set `VIKUNJA_HOST_CONFIG_PATH` to a persistent Vikunja config file, or
  - set `VIKUNJA_COMPOSE_PATH` to the authoritative upstream Vikunja `docker-compose.yml`

### Writable SMTP Setup

If you want the SMTP form in the PWA to be editable and to support `Apply & Restart`,
the PWA must be able to reach the real Vikunja deployment config source.

The PWA does not write into the running Vikunja container filesystem.
It writes to one of these authoritative sources instead:

- a persistent Vikunja config file via `VIKUNJA_HOST_CONFIG_PATH`
- the upstream Vikunja `docker-compose.yml` via `VIKUNJA_COMPOSE_PATH`

#### Same-host Docker example

Use this when:

- the PWA runs in Docker
- Vikunja runs in Docker on the same host
- the PWA bridge mode is `docker-exec`

Add these to the PWA `.env`:

```env
VIKUNJA_BRIDGE_MODE=docker-exec
VIKUNJA_CONTAINER_NAME=vikunja-vikunja-1
ADMIN_BRIDGE_ALLOWED_EMAILS=you@example.com
VIKUNJA_ADMIN_SOURCE_HOST_PATH=/home/admin/docker/vikunja
VIKUNJA_ADMIN_SOURCE_CONTAINER_PATH=/home/admin/docker/vikunja
VIKUNJA_COMPOSE_PATH=/home/admin/docker/vikunja/docker-compose.yml
```

What this does:

- `VIKUNJA_ADMIN_SOURCE_HOST_PATH` bind-mounts the real upstream Vikunja deployment directory into the PWA container
- `VIKUNJA_ADMIN_SOURCE_CONTAINER_PATH` makes that directory available at the same absolute path inside the PWA container
- `VIKUNJA_COMPOSE_PATH` points the PWA at that mounted in-container compose file

Using the same absolute path matters when the upstream `docker-compose.yml` uses relative bind mounts like `./files` and `./db`.
That lets `Apply & Restart` recreate Vikunja with the correct bind-source paths.

Do not point `VIKUNJA_COMPOSE_PATH` at a raw host path like `/home/admin/docker/vikunja/docker-compose.yml` when the PWA itself runs in Docker unless that same host directory is also mounted into the PWA container at the same absolute path.

#### SSH bridge example

Use this when:

- the PWA runs on a workstation or separate host
- Vikunja runs on a remote Docker host
- the PWA bridge mode is `ssh-docker-exec`

Add these to the PWA `.env`:

```env
VIKUNJA_BRIDGE_MODE=ssh-docker-exec
VIKUNJA_SSH_DESTINATION=admin@vikunja-host
VIKUNJA_SSH_PORT=22
VIKUNJA_SSH_KEY_PATH=/app/deploy/id_ed25519
ADMIN_BRIDGE_ALLOWED_EMAILS=you@example.com
VIKUNJA_COMPOSE_PATH=/home/admin/docker/vikunja/docker-compose.yml
```

In SSH mode, `VIKUNJA_COMPOSE_PATH` is a remote absolute path on the Vikunja host.
You do not need `/app/admin-source` in this mode.

#### After changing `.env`

Rebuild and restart the PWA container:

```bash
docker compose build --no-cache
docker compose up -d
```

Then verify:

```bash
curl -s http://127.0.0.1:4300/health
curl -i -s http://127.0.0.1:4300/api/admin/config/mailer
```

The second command should return `401 Unauthorized` when not logged in, which confirms the route exists.

#### Troubleshooting

- SMTP form is read-only:
  - `VIKUNJA_HOST_CONFIG_PATH` and `VIKUNJA_COMPOSE_PATH` are both unset, or the configured path is not reachable from the PWA runtime
- Flashes `No services were found in the configured Docker Compose file`:
  - the compose file path exists in config but the file is not actually readable from the PWA process, commonly because a Docker host path was used inside a container without a bind mount
- Save works but `Apply & Restart` fails:
  - in same-host `docker-exec` mode, the upstream Vikunja directory is mounted into the PWA container at a different path than the host path, so relative bind mounts in the upstream compose file cannot be recreated correctly
  - set `VIKUNJA_ADMIN_SOURCE_CONTAINER_PATH` to the same absolute path as `VIKUNJA_ADMIN_SOURCE_HOST_PATH`, and point `VIKUNJA_COMPOSE_PATH` at that same absolute path
- User administration says only authorized operator accounts may manage users:
  - `ADMIN_BRIDGE_ALLOWED_EMAILS` is unset, or the signed-in Vikunja account email is not in that allowlist
- Bridge features are unavailable:
  - `VIKUNJA_BRIDGE_MODE`, container name, SSH destination, Docker socket access, or SSH key config is missing or unreachable

The checked-in Dockerfile now builds on Node 22, which matches the current frontend toolchain requirements and keeps container builds free of Node engine warnings.

Deployment safety note:

- keep `.env` as a real file on the deployment host
- do not symlink `.env` to another machine or workstation path
- keep runtime-only certs and SSH keys local to the deployment host under `./deploy/`
- if you sync the repo to another machine, exclude `.env`, `deploy/*.pem`, and other local runtime files from the sync

## CLI Bridge (Optional)

The Vikunja CLI bridge is optional. You only need it if you want to create,
edit, disable, or delete Vikunja users from inside this app, run `testmail`,
run `doctor`, or apply writable SMTP/admin-config changes. Core task, project,
sharing, offline, and notification flows all work without it.

- Why it exists: Vikunja does not expose instance user CRUD through its REST API, so this app uses the Vikunja CLI from the server side.
- Supported modes:
  - `docker-exec` for same-host deployments where the app server can reach the Vikunja container runtime
  - `ssh-docker-exec` for a local workstation or separate app host reaching a remote Docker host over SSH
- Authorization:
  - set `ADMIN_BRIDGE_ALLOWED_EMAILS` to the signed-in Vikunja account emails that may use bridge/admin routes
  - without that allowlist, the PWA treats bridge/admin features as unauthorized
- SMTP/admin-config source modes:
  - if `VIKUNJA_HOST_CONFIG_PATH` is set, SMTP becomes `file-backed` and the PWA can save config there
  - if `VIKUNJA_COMPOSE_PATH` is set, SMTP becomes `compose-env` and the PWA manages the upstream Vikunja compose env for mailer settings
  - if both are unset, SMTP stays `read-only`
  - in local `docker-exec` mode the path must be readable from the app process/container, which usually means mounting the authoritative host directory into `/app/admin-source`
  - in SSH mode the path is a remote absolute path on the Vikunja host
- Trust implications:
  - `docker-exec` implies Docker/socket-level access on the host running the app server
  - `ssh-docker-exec` implies SSH key-based access to the remote Docker host
- Without the bridge:
  - user-management, `testmail`, and `doctor` stay unavailable
  - SMTP stays read-only unless `VIKUNJA_HOST_CONFIG_PATH` or `VIKUNJA_COMPOSE_PATH` is configured locally
  - everything else in the app remains usable

Detailed operational, deployment, audit, and planning notes are intentionally
kept outside this public repo.

## How it works

- The browser never receives your Vikunja API token.
- The browser now talks to a same-origin Node backend that owns the Vikunja credentials/session.
- For self-hosted Vikunja, the intended path is `Settings > Accounts` with username/password login.
- API token mode still exists, but the token is submitted to the backend and kept out of browser storage.
- Account sessions are now stored server-side in an encrypted local file, so ordinary backend restarts keep interactive sessions.
- Admin user lifecycle actions and bridge-only admin operations run through a backend-only Vikunja CLI bridge; the browser never gets Docker or CLI access.
- Deployment-level SMTP/admin config is only written to an explicit host config path. The running Vikunja container filesystem is never treated as the source of truth.
- Shared project links authenticate into a dedicated public/shared shell instead of the normal signed-in app shell.
- The app can also run directly over HTTPS with local certs for secure mobile PWA testing, including iPhone installed-app notification checks.
- `VIKUNJA_DEFAULT_BASE_URL` or `VIKUNJA_BASE_URL` may be either:
  - `https://vikunja.example.com`
  - `http://vikunja.local:3456`
  - or the full API URL ending in `/api/v1`

## Browser support

The app targets modern browsers with native ES2022 support. No polyfills are shipped.

Supported baseline targets:

- Chrome 100+
- Edge 100+
- Safari 16+
- Firefox 100+
- iPhone Safari in installed HTTPS PWA mode

Not supported:

- Internet Explorer
- legacy browsers without modern ES2022, service worker, or installed-PWA support

## Repo layout

```text
.
├── src/
│   ├── components/
│   ├── hooks/
│   ├── store/
│   ├── utils/
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── public/
│   ├── icons/
│   ├── manifest.webmanifest
│   └── vendor/
├── tests/
│   ├── helpers/
│   └── smoke/
├── deploy/
│   └── .gitkeep
├── server/
│   ├── admin-bridge.mjs
│   ├── config.mjs
│   ├── cookies.mjs
│   ├── http.mjs
│   ├── rate-limit.mjs
│   ├── session-store.mjs
│   ├── static.mjs
│   └── vikunja-client.mjs
├── .env.example
├── .dockerignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── README.md
└── server.mjs
```

- `server.mjs`: server entrypoint and route wiring. In production it serves `dist/`.
- `server/`: extracted Node-side helpers for config, admin bridge execution, rate limiting, static serving, HTTP utilities, and Vikunja API access.
- `src/`: React application code, store slices, utilities, and migrated screens/components.
- `public/`: static assets copied by Vite into `dist/`, including icons, manifest, and the kept Sortable runtime.
- `deploy/`: optional runtime-only bind-mount directory for local certs or SSH keys. Contents are git-ignored and excluded from image builds.
- `tests/helpers/app-under-test.mjs`: unified smoke harness that builds `dist/` and boots the app server against it.
- Internal planning, audit, and deployment documents are intentionally kept outside the public repo.

## Implemented

- project tree browser with nested sub-projects
- project contents screen with both sub-projects and tasks
- task tree with inline expand/collapse
- today, projects, labels, and account settings screens
- inbox and upcoming screens
- inline global search across project and task pages
- quick-add flow that stays active after `Enter`
- inline subtask creation
- task and project detail overlays
- global top-header back behavior for detail overlays
- task and project favorite toggles in detail overlays
- task completion and label assignment
- task labels surfaced directly on task cards
- label detail editing
- global task query support for cross-project search and upcoming filters
- saved filter browsing and task loading through Vikunja pseudo-projects
- backend-managed account sessions with `HttpOnly` app cookies and encrypted file-backed persistence
- remote Vikunja session listing/revocation for password-based connections
- project-view-aware task loading through Vikunja list views
- task position endpoint wiring and in-app reorder prototype
- first-pass bulk task editing across list/tree task surfaces
- admin user CRUD through the backend Vikunja CLI bridge
- collaboration/privacy settings for the signed-in user
- team CRUD plus team member/admin management
- project user sharing, project team sharing, and link sharing
- dedicated shared-project shell and password-protected link-share auth flow
- per-category notification-center preferences stored in Vikunja `frontend_settings`
- zero-date normalization so unset Vikunja dates do not render as fake `1 Jan` values

## Known constraints

- This is still a prototype, not a production client.
- Vikunja supports labels on tasks, but not project labels through the upstream API route set currently used here.
- Saved filters are intentionally browse/open only in the client right now.
- Bridge/admin routes depend on an explicit operator email allowlist configured in the deployment environment.
- The smoke suite now covers collaboration, shared-link, notification-preference, and bulk-edit flows. Continue maintaining selectors as the shell evolves.
- Offline support now covers read-only cached browsing after one successful online load: the app shell, last signed-in state, and cached project/task views can reopen without a live connection, but edits remain disabled offline.
- Browser notification setup and test alerts now work on supported desktop browsers and installed HTTPS iPhone web apps. Notification-center preferences are also shipped, but event-driven push delivery is still not built yet.
- The server now exposes `/health`, request/error logs, trusted-origin checks, and rate limiting on auth/session routes.
- All app responses now carry baseline security headers, JSON request bodies are capped at 1 MB, and `X-Forwarded-For` is only trusted when `APP_TRUST_PROXY=true`.

## Testing

Install dependencies and run the local verification suite:

```bash
npm install
npm run lint
npm run build
npm run test:smoke:api
```

For the browser smoke pass, install Playwright Chromium once and run:

```bash
npx playwright install chromium
npm run test:smoke:ui
```

The full local verification command is:

```bash
npm run ci
```

For alpha release signoff, the manual mobile PWA regression gate is treated as covered by the normal Mac + iPhone PWA testing workflow. Run a separate iPad-specific pass only if tablet behavior becomes a hard release target.

CI is wired for both GitHub Actions and Forgejo Actions in:

- `.github/workflows/ci.yml`
- `.forgejo/workflows/ci.yml`

## Troubleshooting

- If the app is behind a trusted reverse proxy or Cloudflare Tunnel, set `APP_TRUST_PROXY=true` so same-origin mutation checks use the forwarded host and protocol.
- If iPhone offline shell or browser notifications do not work, use a trusted HTTPS origin and add the app to the Home Screen from Safari.
- If admin user management is unavailable, verify the optional CLI bridge environment variables on the server. The rest of the app should still work without it.
- If UI smoke tests fail locally before the browser starts, run `npx playwright install chromium`.
- If the shell looks stale after a rebuild/deploy, use `Settings > App Data > Refresh app data`.

## Next recommended passes

1. Decide whether saved filters should stay browse-only or get a structured builder UI instead of raw CRUD.
2. Decide how far post-v1 offline work should go beyond the current read-only cache milestone.
