# Vikunja PWA

Unofficial third-party Vikunja client.

This project is a free, independent PWA client for the Vikunja API. It is not
affiliated with, endorsed by, or maintained by the official Vikunja project or
its maintainers.

React-based mobile-first external Vikunja client prototype focused on faster
task capture, nested project browsing, and Todoist-like continuous entry while
staying on top of the real Vikunja API.

## Current product state

- mobile-first project browser with nested sub-projects
- project screen that shows both child projects and task contents
- continuous black-shell layout with global header pills and floating footer pill navigation
- inline parent/child task tree with continuous add flows
- Today is the default landing screen
- dedicated Inbox and Upcoming screens plus inline global search on project-facing pages
- account settings with backend-managed Vikunja sessions
- admin user management backed by the Vikunja CLI bridge
- collaboration settings, team management, and project sharing
- project link shares plus a dedicated shared-project auth/shell flow
- responsive desktop/tablet shell with retractable sidebar and inspector
- installable PWA shell with validated Safari/iPhone install icons, service worker shell caching, and runtime status reporting
- browser notification permission/setup and test alerts on supported desktop browsers, Safari desktop web apps, and installed HTTPS iPhone web apps
- HTTPS-capable local/prototype server mode for secure mobile PWA testing
- view-backed project task loading that prefers the real Vikunja list view
- unrestricted server URL entry for any reachable Vikunja instance
- March 21 structural cleanup completed across the task store, detail/settings screens, AppShell overlays, and CSS hygiene
- March 21 security hardening pass completed for headers, JSON body sizing, trusted-proxy rate limiting, password-change coverage, and legacy-token warnings
- March 21 open-source packaging pass completed for the code of conduct, package metadata, Docker examples, README onboarding, and admin bridge diagnostics
- March 22 release-hygiene pass completed for `npm audit`, the final `.gitignore` review, and clean `dist/` / `.data/` history verification
- March 25 deploy/runtime pass completed for public Docker defaults, desktop Safari notification testing, and task-move data preservation

This is still a working prototype, not a production-ready client.

## 0.1 alpha scope

The planned first public alpha is intentionally narrower than the full roadmap.

Included in `0.1.0-alpha`:

- mobile-first shell with Today, Inbox, Upcoming, Projects, Search, Labels, and Settings
- nested project and task hierarchy handling
- task/project detail overlays and responsive desktop/tablet shell
- list, Kanban, Table, and Gantt project views
- collaboration suite: users, teams, sharing, link shares, and shared-project shell
- read-only offline restore and cached browsing
- browser notification capability setup plus notification-center preferences
- first-pass bulk task editing on list/tree task surfaces

Explicitly not in `0.1.0-alpha`:

- offline sync, queued edits, or conflict handling
- real event-driven push delivery
- saved-filter authoring/builder UI
- richer post-v1 platform features like OIDC, share target, app-store packaging, or multi-account switching UX

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

Current note: the checked-in Dockerfile still builds on Node 18, so the container build may emit engine warnings from newer frontend dependencies even though the app still builds and runs.

Deployment safety note:

- keep `.env` as a real file on the deployment host
- do not symlink `.env` to another machine or workstation path
- keep runtime-only certs and SSH keys local to the deployment host under `./deploy/`
- if you sync the repo to another machine, exclude `.env`, `deploy/*.pem`, and other local runtime files from the sync

## CLI Bridge (Optional)

The Vikunja CLI bridge is optional. You only need it if you want to create,
edit, disable, or delete Vikunja users from inside this app. Core task,
project, sharing, offline, and notification flows all work without it.

- Why it exists: Vikunja does not expose instance user CRUD through its REST API, so this app uses the Vikunja CLI from the server side.
- Supported modes:
  - `docker-exec` for same-host deployments where the app server can reach the Vikunja container runtime
  - `ssh-docker-exec` for a local workstation or separate app host reaching a remote Docker host over SSH
- Trust implications:
  - `docker-exec` implies Docker/socket-level access on the host running the app server
  - `ssh-docker-exec` implies SSH key-based access to the remote Docker host
- Without the bridge:
  - the Settings admin-user section becomes read-only diagnostic UI
  - everything else in the app remains usable

Detailed operational, deployment, audit, and planning notes are intentionally
kept outside this public repo.

## How it works

- The browser never receives your Vikunja API token.
- The browser now talks to a same-origin Node backend that owns the Vikunja credentials/session.
- For self-hosted Vikunja, the intended path is `Settings > Accounts` with username/password login.
- API token mode still exists, but the token is submitted to the backend and kept out of browser storage.
- Account sessions are now stored server-side in an encrypted local file, so ordinary backend restarts keep interactive sessions.
- Admin user lifecycle actions run through a backend-only Vikunja CLI bridge; the browser never gets Docker or CLI access.
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
- Admin user management still depends on the current bridge trust model around the primary Vikunja admin account.
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

- If sign-in or other write operations fail from the browser, check `APP_PUBLIC_ORIGIN` and `APP_ALLOWED_ORIGINS`.
- If iPhone offline shell or browser notifications do not work, use a trusted HTTPS origin and add the app to the Home Screen from Safari.
- If admin user management is unavailable, verify the optional CLI bridge environment variables on the server. The rest of the app should still work without it.
- If UI smoke tests fail locally before the browser starts, run `npx playwright install chromium`.
- If the shell looks stale after a rebuild/deploy, use `Settings > App Data > Refresh app data`.

## Next recommended passes

1. Decide whether saved filters should stay browse-only or get a structured builder UI instead of raw CRUD.
2. Decide how far post-v1 offline work should go beyond the current read-only cache milestone.
