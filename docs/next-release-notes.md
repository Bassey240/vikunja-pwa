# Next Release Notes

Working notes for the next public release after `0.3.1`.

Use this file as the running source for:

- README release-summary updates
- GitHub release notes
- public changelog text

How to use it:

1. Add entries as features and fixes land on `forgejo/main`.
2. Keep each bullet factual and specific.
3. Prefer one clear sentence per user-visible enhancement.
4. Put internal refactors here only if they affect deployers, contributors, or release notes.
5. When the next public snapshot is prepared, use this file instead of reconstructing the release from commit history.
6. After the public release is published, archive the finalized notes into the release summary and reset this file for the following cycle.

## Candidate Version

- Target: `0.4.0`
- Status: `feature-complete; the main remaining release risk is real-provider and real-delivery testing for webhooks, migrations, and OIDC`

## Extra Testing Still Needed Before Public 0.4.0

The core feature set is in place, but these areas still need broader
real-instance/manual validation before the public release should be treated as
fully baked:

- **Plan 8 — Webhooks** needs more manual testing against real external receivers and real event delivery.
- **Plan 9 — Migration tools** needs more real-provider testing across Todoist, Trello, Microsoft To Do, TickTick, and Vikunja export imports.
- **Plan 10 — OpenID Connect** needs more real-provider testing beyond the current smoke and local-provider flows.

Recommended but lower-risk manual follow-up:

- **Project view management** should still get a broader mobile + desktop pass for create/delete/seeded-view flows.
- **Project backgrounds** should still get a wider device pass for upload/remove/Unsplash behavior and visual consistency.
- **Saved filter workspaces** should still get a broader real-instance pass around complex filter queries and mixed project/filter drag behavior.

## User-Facing Additions

- **User and project webhooks are now manageable in the PWA** with target URL, optional secret, and event selection for both user-level and project-level webhook subscriptions.
- **Migration imports are now exposed directly in Settings** for Todoist, Trello, Microsoft To Do, TickTick, and Vikunja export flows, with service-specific status reporting and PWA callback guidance.
- **OpenID Connect login is now implemented end to end**: provider discovery, redirect launch, callback completion, and PWA session creation all stay in the app shell.
- **Project views can now be created and deleted in the PWA** and new views can be seeded directly from the current task-filter state.
- **Project backgrounds are now first-class in the PWA** with upload, remove, Unsplash selection, project-surface rendering, and blur-hash fallback previews.
- **Saved filters can now be created, edited, and deleted inside the PWA** with a structured cross-project builder for status, project, label, priority, due date, text matches, favorites, sort mode, and advanced raw clauses.
- **Saved filters now also behave like filter projects** inside the normal Projects workspace, including project-row presentation, project-style opening, and task-list handling.
- **Settings now exposes operator access state more clearly** with an explicit operator-status card that shows whether the current account is authorized for the CLI bridge and whether the bridge itself is ready.
- **Project sharing now explains the current session's effective access level** before the share controls, so users can see whether they are acting as read-only, writer, admin, shared-link, or operator sessions.
- **Team management now uses proper sheets instead of prompt dialogs** for editing team metadata and adding members, and team cards now show the current session's access level directly in the list.

## Admin, Deployment, And Operations

- **The operator settings area is now labeled `Administration`** and groups user lifecycle management, bridge status, SMTP controls, and migration-provider settings under one clearer operator-facing section.
- **Migration OAuth providers can now be enabled or disabled from the PWA** with client ID/secret or key fields, redirect URL management, and deploy-aware apply/restart support.
- **Migration settings now keep disabled providers visible** and link operators straight to provider configuration instead of hiding unavailable importers completely.
- **The current bridge limit is now documented directly in the UI**: the Vikunja CLI bridge supports lifecycle operations and deployment config, not instance-role editing.
- **GitHub Actions release maintenance was refreshed for Node 24** so the public CI workflow uses current major action versions.

## Fixes And Stability

- **Task collections and the project tree now refresh in the background** with silent polling, mutation debounce, and visibility-return refreshes so external changes appear without manual reload in common cases.
- **Sensitive upload routes now enforce raw-body limits** for avatar upload, attachments, and restore payloads instead of reading unbounded request bodies into memory.
- **Cookie-authenticated unsafe requests now require origin context** as an extra CSRF hardening layer on top of the existing `SameSite=Strict` session cookies.
- **Shared helpers and styling tokens were canonicalized** in the audit remediation pass, including the latent `isRecord` array bug and missing semantic CSS token definitions.
- **Regression coverage was expanded for permission UX** around operator visibility, project access messaging, mobile settings layout, and dialog-based team management.
- **Regression coverage now also protects webhooks, migration tools, OIDC, importer configuration, and the new migration-provider visibility handoff.**
- **Saved filter creation, saved-filter workspaces, project backgrounds, and filter-project drag parity now have dedicated smoke coverage.**

## Docs And Contributor Workflow

- **README now reflects the `0.4.0` feature set** including webhooks, migration tools, OpenID Connect, polling, and the renamed `Administration` operator section.
- **Release metadata is now aligned for `0.4.0`** across package versioning, build identifiers, and public release messaging.

## Breaking Changes Or Migration Notes

- **OAuth migration callbacks must now be configured intentionally** if you want the full import flow to stay inside the PWA. Update the redirect URL in Vikunja and the matching Todoist/Trello/Microsoft developer app to the same PWA callback URL.
- **If those callback URLs still point at the stock Vikunja frontend**, the import may begin in the PWA but return to the original frontend to complete.

## Not Planned For This Release

- A true instance-user permission or role editor is still out of scope until the Vikunja CLI bridge exposes a stable backend surface for it.
- Push-driven realtime invalidation, share target flows, and app-store packaging remain deferred.
- Saved filters still use the PWA's structured builder plus advanced clause composition; this release does not attempt full raw-query-builder parity for every possible Vikunja clause/operator combination.
