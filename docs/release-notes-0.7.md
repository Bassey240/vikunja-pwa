# Release Notes 0.7.15

The first public snapshot in the 0.7 series, with everything below new since
0.6.0. This release covers the PWA.

## New features

- **Automatic API v2 support.** The PWA uses API v2 on Vikunja 2.4 and newer,
  with API v1 compatibility for older servers, including 2.3. No manual switch
  is needed. Reconnecting detects server upgrades; endpoints unavailable in v2
  use their supported v1 equivalents where applicable.
- **Create multiple tasks at once.** Enable Multiple tasks in the task composer
  and enter one task per line, with the same quick-add shortcuts. Supported
  servers use bulk creation; older servers create tasks in order. If creation
  stops, only the remaining lines are kept for retry. Offline entry uses the
  existing queue.
- **Audio and video attachments.** Play audio directly in the attachment list
  and open videos in the attachment viewer. Downloads remain available.
- **Task-link previews.** Same-instance task links in descriptions and comments
  display the task number, title and completion state, and open in the app.
  Missing or inaccessible tasks retain ordinary links.
- **Default due time.** Choose the local time applied to date-only deadlines
  in Preferences. Explicitly entered times remain unchanged.
- **Due tomorrow filtering.** Available in task filters, project filters and
  the saved-filter editor.
- **Pending email changes.** Account settings show confirmed and pending email
  addresses, with controls to resend confirmation, cancel or refresh a pending
  change. Servers without this feature retain the existing form.
- **Planka imports and clearer import progress.** Supported servers offer
  Planka 2 import using an API key or local credentials. Running imports refresh
  automatically while Migration settings are open, with timestamps and failure
  details when supplied by the server.
- **AI connections through MCP.** On supported Vikunja 2.7 servers, create
  read-only or read/write tokens and copy client connection instructions from
  Settings. Revoke access through API Tokens.
- **Time tracking.** On licensed servers, start and stop timers, add, edit and
  delete time entries, and see total time per task. A running timer appears
  above the bottom navigation with Open and Stop controls. Starting another
  timer stops the current one.
- **Instance administration.** Instance administrators can manage users and
  view instance totals through Vikunja's admin API where supported. Host-side
  operations and user renaming still require the optional CLI bridge.
- **Live notification and timer updates.** Supported password and OpenID
  Connect sessions receive updates as events arrive, with polling retained.
  API-token and link-share sessions retain their existing refresh behavior.

## Fixes and reliability

- React Router is updated to 7.18.4 to address reported dependency security advisories.
- Date filters use your local calendar day and timezone.
- Temporary background refresh failures no longer leave a persistent error banner.
- Invalid or expired API-token sessions ask you to sign in again.
- Offline synchronization retries transient write conflicts and preserves
  queued changes.

## Compatibility and verification limits

Features appear according to your server's capabilities and licensing. Older
servers retain their supported workflows. Live updates require Node's built-in
WebSocket client; the supplied Node 22 Docker runtime supports them.

Time-tracking UI and gateway workflows have automated coverage with a simulated
licensed server; verification against a live licensed server remains pending.
Imports, webhooks and OpenID Connect still need broader real-provider testing.
This release does not claim complete coverage of every upstream feature or
provider configuration.
