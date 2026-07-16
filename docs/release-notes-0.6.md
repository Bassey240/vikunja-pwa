# Release Notes 0.6

Everything below is new since the public `0.5` snapshot (cut 14 June 2026).
This is the curated public changelog: PWA surface only.

## Calendar View (new)

`0.5` had no calendar at all. `0.6` adds a full one, reachable from the bottom
nav on mobile and the sidebar on desktop.

- **Month, Week, and Day zooms** behind an always-visible `M | W | D` segmented
  control (single letters on narrow screens), with a clickable title that opens
  a go-to-date overlay in every zoom.
- **Week and Day are a real timeline**, rendered with the same task cards the
  kanban board uses: a sticky day-head row, an internally scrolling hour rail,
  and an auto-scroll to the first task on load instead of midnight.
- **Month grid** with ISO week numbers and `+N` overflow chips. Clicking the
  already-selected day drills into its Day view.
- **Drag to reschedule**: handle-only drag plus span resize in the week/day
  timeline, and dragging a task onto another month day cell. Calendar and Gantt
  share one pointer-drag lifecycle.
- **Move to date** opens a large date overlay for when dragging is not
  practical. The same picker is now used everywhere in the app, including
  project and list views.
- **Overlapping events stay readable**: they cascade with tap-to-focus, cap at
  two columns with a `+N` chip, and collapse to compact name + time chips with
  label colour dots rather than unreadable slivers.
- **Add tasks from anywhere in the view**: tap an empty day or an hour slot to
  create a task pre-dated there, with hover targets on hour slots and an inline
  `+ Add task` on empty states.
- **Header controls**: project/label filter, show-completed, and bulk edit.
- **Keyboard**: `T` (today), `M`/`W`/`D` (zoom), `←`/`→` (page), `N` (new task).
- **Desktop sizing**: views fill the pane, with Day capped at 56rem and Month at
  80rem and centered on very wide windows. The week shows all seven columns via
  fluid lanes with a 15rem floor.
- The inspector pane follows the same remembered open/collapsed preference as
  every other view.

## Header And Footer Chrome Pass

- **The desktop screen title renders again**: a CSS rule had collapsed the
  wide-shell heading to zero width, so no screen or project name showed in the
  desktop header at all.
- **One icon system everywhere**: the footer tabs and topbar actions now use
  the sidebar's stroked-SVG icon set. The calendar tab no longer reads as a jar,
  inbox is a real tray, and the view-switcher glyphs (list/kanban/table/gantt)
  are recognizable. All hand-drawn pseudo-element icon CSS was deleted.
- **The mobile project header dropped from six icon buttons to five**: search
  folded into the `⋮` menu on phones.
- **The view popover is a plain switcher**: per-view delete and the create-view
  form moved behind `Manage views…`, so switching views cannot mis-tap a
  destructive control.
- **The `+` button adds a subtask on the task focus screen** instead of opening
  the root composer for the source screen.
- **Today now leads the nav menu**, and the phone calendar header fits its date
  (`Tue 14 Jul` instead of `Mond…`).
- **Icon-only buttons show hover tooltips** sourced from their accessibility
  labels, including the sidebar and inspector pane toggles.

## Task Composer And List Polish

- **Quick Add Magic tokens are highlighted inline as you type**: recognised
  words (dates like `today`, `+project`, `*label`, `@assignee`, `!priority`, and
  repeat phrases like `every week`) are coloured in place inside the composer, so
  it is clear which words become metadata instead of staying in the title.
- **The composer stays steady during continuous adding**: adding a task no
  longer drops and re-shows the composer, and the title field keeps focus so you
  can keep typing the next task.
- **Done and bulk-select checkboxes are now distinguishable**: completed tasks
  fill green and bulk-selection checks fill blue, both at the same size and
  shape, and completed titles are struck through so the done state stays clear
  in bulk-edit mode where the selection check replaces the done check.

## Flat Design Refinements

- **Every card surface now uses a single token.** Kanban cards and column
  headers were a step brighter than the list/detail cards in dark mode; they now
  share the one `--surface-card` fill (guarded by a unit test).
- **Dark-mode hairlines, secondary text, and chrome icons were lifted** so
  borders and dividers hold the same structural definition as light mode.
- **Kanban bucket headers are shorter**: the header sizes to its content
  instead of a fixed 6rem minimum.
- **Calendar surfaces were unified** on the same plane/card token pair as the
  rest of the app.

## Accessibility And Keyboard

- A visible accent focus ring on all controls.
- `/` opens search app-wide; single-key calendar shortcuts as listed above.
  Shortcuts are ignored while typing.

## Fixes And Stability

- **An invalid session token no longer triggers a request storm.** A stale token
  sent the background teams load into an unbounded retry loop (27,310 requests
  to `/api/teams` in roughly four minutes). A 401 now stops retries and surfaces
  re-authentication, and transient errors retry with exponential backoff (5s
  doubling to a five-minute cap). The same guard covers the account-sessions and
  admin loads.
- **The desktop center pane matches the sidebar and inspector background**
  instead of a visibly lighter shade.
- **Adding tasks from the desktop calendar works**: every calendar add-path
  opened a mobile-only composer sheet that never renders on the wide shell; the
  calendar now uses the inline composer on desktop and the sheet on mobile.
- **The month day-list keeps one clear `+ Add task`** instead of competing
  Day/Week buttons.

## Operations

- **Server and client build IDs are stamped automatically from git** as
  `YYYY-MM-DD-<commit>` instead of hand-maintained constants that went stale
  (the client build had silently stayed at `release-0.4.0`). Settings → App Data
  now always identifies the exact deployed commit. `package.json` remains the
  human release number, bumped at release cuts.
