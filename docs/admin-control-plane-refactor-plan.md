# Admin Control Plane Refactor Plan

Status: Draft for implementation

## Why this exists

The current admin bridge implementation proved that backend-only Vikunja CLI execution is useful, but it also exposed three architectural problems:

1. The PWA assumes one persistence model for deployment-level settings, even though real Vikunja installs may be file-backed, env-backed, or effectively read-only from the PWA's point of view.
2. The PWA currently assumes `user.id === 1` is the instance admin, but Vikunja OSS does not expose a documented instance-wide admin role through the normal user API.
3. The SMTP UI can present writable controls even when the deployment cannot actually persist changes.

The result is patchwork behavior:

- bridge actions like `testmail` work
- writable deployment settings only work for some layouts
- authorization is too implicit for a feature that can execute CLI and Docker-host actions
- SMTP config can fail visibly in deployments that do not provide a real writable config target

This refactor turns the PWA into a proper deployable control plane for Vikunja admin operations instead of a collection of feature-specific bridge assumptions.

## Goals

- Keep the PWA deployable from this repo with a clear `.env.example` contract.
- Make all bridge-backed admin features explicitly operator-only.
- Separate user settings from deployment settings and from PWA-local state.
- Stop treating the running Vikunja container filesystem as the source of truth for persistent admin settings.
- Make unsupported deployments safe and clear by falling back to read-only diagnostics instead of fake writability.
- Establish a simple architecture that can be reused for future admin settings beyond SMTP.

## Non-goals

- Do not modify Vikunja itself.
- Do not require Vikunja to expose a new admin API or role model.
- Do not store deployment-level secrets or authoritative config in the PWA database or browser storage.
- Do not make every Vikunja deployment writable from day one.
- Do not introduce a plugin-style provider framework before a second meaningfully different writable backend actually exists.

## Current-state decision

The existing SMTP save/apply flow must not remain "maybe writable" during the refactor.

The first implementation step must make this explicit:

- if the deployment exposes a supported writable config source, SMTP remains writable
- otherwise the SMTP UI becomes read-only and explains why writes are unavailable

That means the SMTP fix and the source-mode refactor are the same piece of work, not separate phases.

## Core design decisions

### 1. The PWA is a control plane, not the source of truth

The PWA backend may inspect, validate, write, and apply deployment settings, but it must not invent its own persistent store for upstream Vikunja deployment config.

Authoritative state must live in the real deployment config source, for example:

- a host-mounted Vikunja `config.yml`
- a host-managed env file or Compose config
- a read-only deployment where the PWA can inspect but not modify

### 2. Split settings into three domains

The codebase should treat these as separate systems:

- User settings: stored in Vikunja through the normal API and database
- PWA runtime/session state: stored by the PWA in `.data` or browser storage
- Deployment/admin settings: managed through the deployment config source only

### 3. The CLI bridge is execution, not persistence

The existing bridge remains useful for:

- `testmail`
- `doctor`
- `user` CLI actions
- restart/apply actions
- diagnostics

The bridge must not be the mechanism that defines where persistent config lives.

### 4. Authorization must be explicit and server-side

The PWA must stop inferring admin authority from undocumented Vikunja behavior.

Operator authorization will be configured by the deployer through one explicit allowlist:

- `ADMIN_BRIDGE_ALLOWED_EMAILS`

All bridge-backed and deployment-admin routes must deny by default unless the signed-in Vikunja account email matches the configured allowlist.

### 5. UI must be capability-driven

The frontend should not assume writable admin settings exist.

Instead, the backend should expose capabilities such as:

- can inspect effective config
- can write config
- can apply/restart
- can test mail
- can manage users

The UI then renders:

- writable forms only when the deployment supports safe persistence
- read-only effective values otherwise
- explicit unsupported reasons when write/apply is not available

## Simplified implementation shape

This refactor should stay proportionate to the current codebase.

Do not introduce a multi-file provider framework yet.

Instead:

- keep admin config orchestration centered in `server/admin-config.mjs`
- keep route guards centralized in `server.mjs` or a small extracted auth helper
- keep validation inline in the write path until it becomes complex enough to justify extraction

The important abstraction is config source, not transport.

For now, `server/admin-config.mjs` should support:

- `read-only`
- `file-backed`
- future: `compose-env`

Within `file-backed`, transport remains an implementation detail:

- local file access
- SSH file access

This keeps the code understandable while still giving the PWA a real deployment model.

## Source modes

### `read-only`

Use when:

- the bridge can inspect effective config
- but the deployer has not configured a supported writable source

Behavior:

- inspect effective mailer config from what the bridge can read today, primarily env/config values visible through bridge-backed inspection
- run diagnostics
- run `testmail`
- reject save/apply
- UI shows read-only state with a clear reason

Note:

- read-only mode is only useful when bridge connectivity exists, because without the bridge there is no deployment-level config source to inspect

### `file-backed`

Use when:

- the deployer provides an authoritative config file path the PWA is allowed to manage

Behavior:

- read config
- validate writes inline
- persist to the authoritative host-backed file target
- apply/restart through the bridge

Transport:

- local or SSH, selected by config, but not modeled as separate top-level providers

### Future: `compose-env`

Add only when there is a real need to manage env/Compose-backed upstream config directly.

It is not needed to complete the current refactor.

## Security model

The refactor must harden bridge/admin operations as follows:

- no bridge/admin route without explicit operator authorization
- no reliance on `user.id === 1`
- no secrets returned to the browser after save
- password-style fields remain write-only
- validate before apply
- fail closed when source-mode configuration is incomplete

Existing request logging is sufficient for now; no separate audit subsystem is in scope for this refactor.

## Deployability contract

The repo must remain deployable from `vikunja-mobile-poc` with documented defaults.

Deployment config should clearly distinguish:

- safe repo-shipped defaults
- operator-filled env values
- runtime-only files under `./deploy`
- external authoritative admin-config sources

The `.env.example` contract should expand to include:

- bridge connectivity
- `ADMIN_BRIDGE_ALLOWED_EMAILS`
- `VIKUNJA_HOST_CONFIG_PATH`

Selection rule for the initial implementation:

- if `VIKUNJA_HOST_CONFIG_PATH` is set, source mode is `file-backed`
- if `VIKUNJA_HOST_CONFIG_PATH` is not set, source mode is `read-only`

Path meaning:

- in local bridge mode, `VIKUNJA_HOST_CONFIG_PATH` is a local authoritative config path accessible to the PWA runtime
- in SSH bridge mode, `VIKUNJA_HOST_CONFIG_PATH` is a remote authoritative config path on the Vikunja host

The repo should remain safe to publish because deployment secrets and authoritative upstream config are not committed.

## Implementation steps

### Step 1: Refactor admin config around source modes and fix SMTP behavior

- Refactor `server/admin-config.mjs` to use source modes:
  - `read-only`
  - `file-backed`
- Treat local vs SSH as transport detail inside `file-backed`.
- Stop assuming the running container filesystem is the authoritative writable target.
- Expose capabilities from the backend so the SMTP UI can render correctly.
- Make SMTP writable only when a supported writable source is configured.
- Make SMTP read-only with a clear explanation when no writable source is configured.

Concrete response shape:

- `GET /api/admin/config/mailer` returns the effective mailer config plus a `capabilities` object, for example:
  - `canInspect`
  - `canWrite`
  - `canApply`
  - `reasonCode`

`reasonCode` should be machine-readable and stable, for example:

- `no_bridge`
- `no_config_path`
- `unsupported_source_mode`
- `not_authorized`

The frontend owns the user-facing explanation text.

Acceptance:

- SMTP no longer presents fake writability
- unsupported deployments show read-only diagnostics instead of failing save/apply
- writable deployments persist to an authoritative host-backed config target

### Step 2: Replace implicit admin inference with operator allowlists

- Replace `user.id === 1` authorization with explicit operator allowlist config.
- Add one centralized backend guard for all bridge/admin routes.
- Keep authorization enforcement server-side only.

Acceptance:

- every bridge/admin route is denied unless the account matches the configured allowlist
- no route depends on `id === 1`

### Step 3: Documentation and deployment examples

- Update `.env.example` with source-mode and operator-allowlist config.
- Update README and deployment notes to explain read-only vs writable mode.
- Document the expected file-backed deployment layout for writable admin settings.

Acceptance:

- a deployer can understand whether their installation is read-only or writable
- a deployer can configure bridge auth and admin-config mode without reading source code

Future deployment-admin features should follow the same rule: inspect capabilities first, fall back to read-only by default, and never persist settings into the running container filesystem.

## Immediate code issues this plan will replace

These are symptoms of the current architecture and should be removed by the refactor:

- `requireAdminSession()` relying on `adminBridge.isAdminAccount()`
- `adminBridge.isAdminAccount()` relying on `user.id === 1`
- mailer config writes assuming container-local filesystem paths are authoritative
- SMTP UI assuming bridge availability implies safe writability

## Completion criteria

The refactor is complete when:

- operator authorization is explicit, documented, and enforced server-side
- the PWA can be deployed from this repo with a source mode selected in `.env`
- unsupported deployments degrade to safe read-only diagnostics
- writable admin config only works through a declared authoritative source mode
- no deployment-admin setting is persisted inside the running container filesystem
- future admin features have a clear extension rule instead of feature-specific bridge hacks
