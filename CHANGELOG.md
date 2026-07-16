# Changelog

Release history for Vikunja PWA, newest first.

Detailed notes for the current release: [docs/release-notes-0.6.md](docs/release-notes-0.6.md).

## 0.6.0

- A full calendar view with Month, Week, and Day zooms, reachable from the bottom nav on mobile and the sidebar on desktop. Week and Day render as a timeline built from the same task cards the Kanban board uses, with a sticky day-head row, an internally scrolling hour rail, and auto-scroll to the first task instead of midnight.
- Calendar tasks can be rescheduled by dragging, resized by their span, moved onto another month day cell, or re-dated through a large "move to date" overlay that is now the shared date picker everywhere in the app.
- Tasks can be added from anywhere in the calendar: tap an empty day or hour slot to create one pre-dated to that spot, with inline `+ Add task` on empty states.
- Overlapping events stay readable — they cascade with tap-to-focus, cap at two columns with a `+N` chip, and collapse into compact name/time chips with label colour dots.
- Calendar keyboard support: `T` for today, `M`/`W`/`D` to zoom, `←`/`→` to page, `N` for a new task, plus `/` to search from anywhere and a visible focus ring app-wide.
- A header and footer chrome pass: one stroked-SVG icon set across the footer, topbar, and sidebar, the desktop screen title rendering again after a CSS rule collapsed it to zero width, the mobile project header trimmed from six icon buttons to five, and the view popover split so switching a view cannot mis-tap a destructive control.
- Quick Add Magic tokens are highlighted inline as you type, so it is clear which words become metadata before the task is added.
- The composer stays steady across continuous adds, keeping focus instead of dropping and re-showing itself.
- Done and bulk-select checkboxes are now distinguishable (green versus blue, with a strikethrough on done), so the done state stays clear in bulk-edit mode.
- Flat-design refinements: every card surface collapsed onto a single token, dark-mode hairlines and secondary text lifted, and Kanban bucket headers sized to their content.
- An invalid session token no longer triggers an unbounded retry loop against the API. A 401 now stops retries and surfaces re-authentication, while transient errors back off exponentially; the same guard covers the teams, account-sessions, and admin loads.
- Server and client build identifiers are now stamped automatically from git as `YYYY-MM-DD-<commit>`, so `Settings → App Data` and `/health` always identify the exact deployed build instead of a hand-maintained constant.

## 0.5.0

- The entire UI was rebuilt around a single flat design language — a tokenized system of surfaces, hairline dividers, squared corners, and no elevation shadows, applied consistently across mobile and desktop, with Geist Sans/Mono as the app typefaces.
- The header notification panel is now opaque and correctly centered on mobile, and notification read actions are hidden on API-token logins (which Vikunja's backend cannot mark read) instead of surfacing a raw `invalid token` error.
- User webhooks are now manageable from `Settings`, and project webhooks are now manageable from `Project detail`, including target URL, secret, and event selection.
- Migration imports are now available inside the PWA for Todoist, Trello, Microsoft To Do, TickTick, and Vikunja export flows, with OAuth callback handling and per-service status reporting.
- OpenID Connect login is now fully wired end to end: provider discovery, redirect launch, callback completion, and PWA session creation.
- Project views can now be created and deleted inside the PWA, and new views can be seeded directly from the current task-filter state.
- Project backgrounds are now supported end to end in the PWA, including upload/remove, Unsplash selection, blur-hash fallback previews, project-tree rendering, and project/task workspace backgrounds.
- Saved filters can now be created, edited, and deleted in-app, then opened as filter projects in the normal Projects workspace with the same task surfaces and drag handling as other project workspaces.
- The settings admin surface has been clarified into `Administration`, with explicit operator status plus SMTP and migration-provider configuration in the same operator area.
- Migration settings now keep disabled providers visible, explain why they are unavailable, and link operators directly to the provider-configuration area.
- Background refresh polling now keeps task collections and the project tree fresher after external changes, with mutation debounce and visibility-return refresh behavior.
- The audit remediation pass added raw-body limits on sensitive upload endpoints, stricter cookie-auth origin checks, shared helper cleanup, and missing token definitions.

## 0.3.1

- Same-list task reorder in Inbox and Today now respects the actual screen sort mode, so non-manual views no longer animate a move and then snap back.
- The post-drop background refresh path now preserves a freshly moved task instead of letting stale positive positions temporarily restore the old order.
- Drag lifecycle cleanup now rebinds correctly across screen switches, fixing the case where a successful or interrupted drag on one view could leave the next view temporarily non-draggable.
- Expanded project previews in the main project tree now stay task-list-only even if the focused project view was set to Kanban.
- Regression coverage was extended around Inbox/Today DnD, stale-refresh ordering, and project preview isolation.

## 0.3.0-alpha

- The Gantt view was rebuilt into an interactive planner with zoom presets, richer task bars, priority and progress cues, assignee and label chips, dependency arrows, hover tooltips, and drag/resize scheduling.
- Supported task and project edits now work offline: the app stores snapshots and mutation queues in IndexedDB, applies optimistic local changes, and replays them automatically when connectivity returns.
- Kanban drag-and-drop was finished end-to-end: sort within bucket, move across buckets, drop onto a card to create a subtask, use "Move to bucket" from the task menu, and reopen or complete tasks by moving them in or out of the done bucket.
- Account/auth/security coverage expanded with instance-aware registration and password-reset gating, 2FA sign-in and management, CalDAV tokens, scoped API tokens, session inspection and revocation, password/email changes, data export, and account-deletion scheduling.
- Release readiness improved with broader smoke coverage for Gantt, offline, Kanban, and security flows plus a cleaner curated-GitHub release workflow.

## 0.2.1

- Expired or invalid persisted password sessions are now cleared cleanly instead of leaving the app stuck in a refresh-token failure loop.
- The stale-session path now drops back to sign-in after the first failed refresh attempt, which also avoids the follow-on `Too many requests` noise that could appear during bootstrap.

## 0.2.0-alpha

- Full avatar management was added, including provider switching (`Default avatar`, `Initials`, `Gravatar`, `Marble`, `Upload`) and uploaded-avatar support.
- Account onboarding now includes registration, forgot-password, reset-password, and reset-link handoff for single-instance deployments.
- Email delivery can now be configured from the PWA through SMTP settings, test mail diagnostics, and apply/restart support instead of requiring manual server-side edits only.
- Admin bridge access is now explicitly operator-gated, and the email/SMTP settings UI now reflects whether the current deployment is writable or read-only.
- Mail diagnostics were tightened so email test failures are reported correctly even when the Vikunja CLI exits with status `0`.
- The Docker release target was updated to Node 22, and the image now includes the Compose support needed for admin apply/restart flows.
- The post-0.1 stabilization work also includes task-move and completion-refresh fixes across list, Kanban, Today, and cross-project drag/drop flows.
- Smoke coverage was expanded for avatars, onboarding/auth, drag-and-drop, task detail, email admin flows, operator auth, compose apply, and mail diagnostics.

