# Calendar View — Requirements & Implementation Plan

Roadmap source: [ideas-roadmap.md](ideas-roadmap.md) §1. This document is the
requirements + phased technical plan for the calendar surface that replaces the
Today view.

---

## Context

The current **Today** tab is a flat list backed by `/api/tasks/today`. We want a
**calendar surface that replaces Today** — a WeekCal-style dense grid with three
zoom levels, direct scheduling from the grid, and drag-to-reschedule. This is the
largest single item in the ideas backlog (🔴 multi-session).

Vikunja already gives us the raw material:
- Tasks carry full-datetime `due_date`, `start_date`, `end_date`, plus `done`,
  `done_at`, `repeat_after`, reminders, priority, labels, assignees
  ([types.ts:676](../src/types.ts)). The detail editor already uses a
  **datetime** picker, so times are real, not synthetic
  ([TaskDateControl.tsx](../src/components/tasks/detail/TaskDateControl.tsx)).
- **Upcoming** already demonstrates the exact loading model a calendar needs: a
  single date-range filter `due_date >= now+1d/d && due_date < now+14d/d`
  through `buildTaskCollectionPath`
  ([tasks.ts:362](../src/store/slices/tasks.ts),
  [selectors.ts:213](../src/store/selectors.ts)). No pagination machinery exists
  in the app — every collection is one filtered fetch.
- **Gantt** already ships a reusable pointer-drag engine with move /
  resize-start / resize-end semantics and `shiftDateByZoom`
  ([gantt-drag.ts](../src/components/project/views/gantt/gantt-drag.ts)) — the
  mental model and much of the math for calendar drag-to-reschedule and
  span-resize already exist.

Intended outcome: opening the app lands on a calendar; you see your tasks laid
out on real days/times across month/week/day; you schedule, reschedule, resize,
duplicate, complete and delete tasks directly from the grid; and "go to today"
is your Today view.

---

## Decisions locked with the user

Captured across four rounds of clarifying questions. These are requirements, not
suggestions.

### Placement & scope
- **The calendar becomes Today.** It takes over the index route `/`; the old
  flat Today list is retired. "Go to today" lands on the day/timeline view.
- **Three zoom levels, month-first.** Build order: **Month → Week → Day**.
- **Global, all-projects**, with a **filter chip** to narrow by project/label
  (reuse existing filter UI).
- **Undated tasks are hidden.** Only tasks with a relevant date appear. No
  backlog tray in scope.

### Data model & time
- **Anchor = start–end span when present, else due_date.** A task with both
  `start_date` and `end_date` renders as a **multi-day bar** across those days;
  otherwise it sits on its `due_date` (fallback `start_date`).
- **Due vs span is one block, never two.** When a task has both a span
  (`start_date`+`end_date`) and a `due_date`, the **span is the block** (its
  geometry — top, height, column) and the **due time is a deadline marker** layered
  on the same block, not a second card. The marker is **suppressed when it
  coincides** with the span's own end. A task is never rendered twice. *(Decided
  with the user; marker rendering is a later "tinker" pass, not yet built.)*
- **Midnight = all-day.** A time of exactly `00:00` local (from the stored UTC
  midnight) is treated as **all-day** → rendered in the day's header band, not a
  time slot. Any other time is **timed** and placed at that time.
- **Render in device-local time.** Stored UTC is converted to the browser's
  local timezone for both display and grid placement.
- **Tap-to-add targeting:** tapping a **day** (month/week header) pre-fills an
  **all-day** task on that day; tapping a **time slot** (week/day grid)
  pre-fills that **exact datetime**.

### Interactions
- **Task tap menu** (WeekCal-style) offers: **Edit (open detail)**,
  **Duplicate/copy**, **Delete**, **Mark done**.
- **Drag, scoped by view:** **move** a task between days/time slots in every
  view (grab the whole block — no handle needed). **Resize** (drag the span's
  edges) is **Week/Day only** — month cells are too small for edge handles, so
  month is **move-only**.
- **Recurring tasks: single next instance only.** Render exactly what the API
  returns (the current/next occurrence); do not project ghost future repeats.
- **Done tasks** are governed by the **existing header show/hide-completed
  toggle** (`useShowCompletedTaskFilter`,
  [useShowCompleted.ts:13](../src/hooks/useShowCompleted.ts)), not a new control.
  When shown, done tasks use the strikethrough / `--done-green` styling already
  introduced in roadmap item 3.

### Layout & loading
- **Month overflow:** each day cell shows a few task lines then **"+X more"**;
  **tapping the day reveals the full list below the calendar**. Uniform cell
  height.
- **Week view = kanban-board timeline.** Each day is a kanban lane (reusing the
  project board's lane classes and horizontal scroll); inside each lane an
  hour-rail timeline places timed tasks at their hour, with all-day tasks in a
  top band. Tasks render with the full kanban task frame (checkbox, card, drag
  handle, ⋮ menu). Day view is one widened lane for a single day.
- **Data window:** one **date-range query per visible window** (the Upcoming
  pattern, widened to the visible month and accounting for spans that overlap
  the window), plus **light prefetch of the adjacent window** each side so
  navigation is instant. *Recommended default; dead-simple alternative is
  visible-window-only with a refetch per navigation.*
- **Offline: read, and queue writes routed as store actions.** Render dated
  tasks from the existing offline snapshot. The app already has a persisted
  mutation outbox (`offline-queue.ts` / `offline-sync.ts`); store actions on the
  `QUEUEABLE_ACTIONS` allowlist enqueue offline and replay on reconnect. Calendar
  edits that reuse existing store actions (`toggleTaskDone`, `duplicateTask`,
  `deleteTask`, `saveTaskDetailPatch`, `moveTask`) inherit offline queueing for
  free. Bespoke drag-reschedule writes are the one gap — they need to become a
  queueable store action rather than a direct `POST`; tracked as
  ([ideas-roadmap.md](ideas-roadmap.md) §6) and not a blocker for shipping.

---

## Requirements

### R1 — Routing & navigation
- New `CalendarScreen` mounted at the index route `/`
  ([router.tsx](../src/router.tsx)), replacing `TodayScreen` as `index: true`.
- `TodayScreen` is retired (or kept only as an internal fallback). The
  bottom-nav "Today" button
  ([BottomNav.tsx:78](../src/components/layout/BottomNav.tsx)) now opens the
  calendar; `screen === 'today'` semantics map to the calendar.
- A **zoom switcher** (Month / Week / Day) in the calendar header; **default
  landing = Day** ("go to today" is your Today view). Persist last-used zoom.
- Header gains: a **"Today" / go-to-current-date** action, **prev/next**
  navigation for the visible window, the **filter chip**, and the existing
  **show/hide-completed** toggle.

### R2 — Date model & placement engine
A single pure module (`src/utils/calendar-placement.ts`) that, given a task and a
visible window, returns its placement:
- Resolve anchor: `start_date`+`end_date` → span; else `due_date`; else
  `start_date`; else **excluded** (undated hidden).
- Convert UTC → local; classify **all-day** (local `00:00`) vs **timed**.
- For spans: clip to the visible window, emit per-day segments for month/week.
- Unit-tested in isolation (the riskiest correctness surface): all-day vs timed
  boundary, span clipping, DST edges, span vs single-day.

### R3 — Data loading
- Add `loadCalendarTasks(window)` to the tasks slice, mirroring
  `loadUpcomingTasks`: build a date-range filter over the window via
  `buildTaskCollectionPath`. The filter must catch tasks whose **span overlaps**
  the window (due/start/end within range), not only due_date.
- Cache by window key; prefetch the neighbouring window. Reuse
  `normalizeTaskGraph` and the offline-snapshot persistence already used by
  Today/Upcoming.

### R4 — Month view
- 6×7 grid, uniform-height day cells, week starts per locale.
- Each cell: date number, then up to N task lines (all-day bars first, then
  timed sorted by time), then **"+X more"**.
- Multi-day spans render as continuous bars across cells where feasible.
- **Tap a day** → that day's full task list renders **below** the calendar
  (reuse the existing collection list as the "selected-day list").
- **Tap empty day area** → composer pre-targeted all-day on that day.

### R5 — Week & Day views (kanban-board timeline)
- Each day is a **kanban lane** (Week = 7 lanes side by side, Day = 1),
  reusing the project board's `.kanban-lane` / `.kanban-lane-head` classes and
  horizontal scroll-snap. Day-zoom widens the single lane to fill the frame.
- Each lane: a tappable head (weekday + date + count chip), an **all-day card
  band**, then an **hour-rail timeline** down the lane — a 24-row hour gutter
  with timed tasks positioned by start time, height by duration. A now-line
  marks the current time on today's lane.
- **Overlap = cascade, not hide** ([calendar-timegrid.ts](../src/utils/calendar-timegrid.ts)).
  Overlapping tasks pack into greedy first-fit columns (Google-style); each card
  expands rightward into any column free for its whole duration, and later
  columns stack on top so every card's left strip stays visible. Nothing is
  collapsed into a "+N" chip — every task is on the grid at first glance.
- **Tap-to-focus.** A tap on an overlapped card pops it to full width on top
  (accent ring, flat design — no shadow). A capture-phase handler on the track
  restores the cascade on the next tap that lands off the focused card's frame —
  its empty span padding, another card, or a bare slot all dismiss, while a tap
  on the focused frame or its resize edges keeps focus. The portaled task menu is
  exempt (`currentTarget.contains` rejects its React-tree events), so
  Edit/Duplicate/Delete still fire. Focus resets on paging/zoom change and on
  leaving the screen, so returning from a task's detail never leaves a card stuck
  expanded.
- **Frame depends on width.** A **full-width** (non-overlapping) task keeps the
  full kanban frame — checkbox, the `TaskCard` body, drag handle, ⋮ menu — and
  is interactive directly. An **overlapped (narrow)** task renders as a
  **compact chip**: small-font title + start time + up to five label colour
  dots, no controls; the controls reappear when it's tapped to full width.
- **Every timeline card shows its start time** as a small meta line (via the
  `TaskCard` `timeLabel` prop, fed from the placement start), so the hour is
  readable without opening the task.
- **Tap empty slot** → composer pre-targeted to that exact datetime.
- **Drill-down:** in Week, tapping a lane head opens that day's Day view. Month's
  selected-day list offers **Day** and **Week** buttons; Day view carries a
  compact date picker in the header. The calendar is reachable from the desktop
  WideSidebar as well as the mobile shell.
- Week view is the literal "kanban-of-days" model — lanes are days, with a
  timeline inside each.

### R6 — Tap menu & task actions
- Tapping a task block opens a small menu: **Edit** (existing `TaskDetail`),
  **Duplicate** (clone with adjusted date — supports copy/paste-to-day),
  **Delete** (existing confirm path), **Mark done** (existing toggle).
- Reuse existing task mutations — `toggleTaskDone` / `duplicateTask` /
  `deleteTask` already live in the tasks slice; no new plumbing.

### R7 — Drag-to-reschedule & resize
- Extend / adapt the gantt drag engine
  ([gantt-drag.ts](../src/components/project/views/gantt/gantt-drag.ts)) for the
  calendar grid:
  - **Month: move-only** — long-press a task block and drop on another day cell
    (whole-block grab, no edge handles), rewriting its date(s) and preserving
    span length. No resize in month (cells too small for edge handles).
  - **Week/Day:** drag between time slots → rewrite the time; **resize edges** →
    rewrite start/end of the span (room for handles here).
- Writes go through the existing `POST /api/tasks/:id` + refresh path; offline
  blocks with a notice (queue is a later roadmap item).

### R8 — Composer integration (tap-to-add)
- Extend `openRootComposer`
  ([task-composers.ts:68](../src/store/slices/task-composers.ts)) with an
  optional **`defaultDueDate?: string`** (ISO) alongside the existing
  `defaultDueToday`, feeding the existing `composerDueDate` state — a natural
  extension of the current Today-defaulting path (`getTodayDueDateIso`).
- Day tap → all-day ISO for that day; slot tap → exact datetime ISO.

### R9 — Done tasks & filtering
- Visibility driven by `useShowCompletedTaskFilter` (no new toggle). When shown,
  done tasks use the existing strikethrough + `--done-green` treatment.
- Filter chip narrows the calendar by project/label using existing filter
  building blocks.

### R10 — Offline
- Render from the offline snapshot when offline (read).
- Calendar edits that reuse existing queueable store actions (`toggleTaskDone`,
  `duplicateTask`, `deleteTask`, `saveTaskDetailPatch`, `moveTask`) **enqueue
  offline and replay on reconnect** through the existing outbox
  (`offline-queue.ts` / `offline-sync.ts`, `QUEUEABLE_ACTIONS` allowlist).
- The one gap is **bespoke drag-reschedule writes**, which today `POST`
  directly and bail offline (matching Gantt). Making that a queueable store
  action is tracked separately ([ideas-roadmap.md](ideas-roadmap.md) §6) and is
  not required to ship the calendar.

---

## Technical implementation plan (safe, phased)

Guiding principle: **each phase is independently shippable, reversible, and
leaves the app fully working.** The calendar is built behind the existing screen
infrastructure so it can co-exist with Today until it's proven, then take over
the route. No phase requires a "big bang" cutover.

### Codebase touchpoints (how things actually wire)

- **Screen mount:** `AppShell` keeps screens alive via a `mountedScreens` record
  keyed off `screenFromPath(pathname)`
  ([AppShell.tsx:31,138,305](../src/components/layout/AppShell.tsx)); the route
  element is set in [router.tsx:48](../src/router.tsx). Adding a screen = new
  `Screen` union member in [types.ts](../src/types.ts), a `screenFromPath` case,
  a `mountedScreens` entry, and a router element. Mechanical, low-risk.
- **Date writes:** a reschedule is `POST /api/tasks/:id` with the full task body
  (`title, start_date, end_date, priority, done`), exactly as Gantt does at
  [ProjectGanttView.tsx:195](../src/components/project/views/ProjectGanttView.tsx),
  followed by `refreshCurrentCollections()`.
- **Tap-menu actions already exist in the tasks slice:** `toggleTaskDone`
  ([tasks.ts:646](../src/store/slices/tasks.ts)), `duplicateTask`
  ([tasks.ts:802](../src/store/slices/tasks.ts)), `deleteTask`
  ([tasks.ts:850](../src/store/slices/tasks.ts)); Edit = open existing
  `TaskDetail`.
- **Offline reality:** a persisted mutation outbox **already exists**
  (`offline-queue.ts` / `offline-sync.ts`). Store actions on the
  `QUEUEABLE_ACTIONS` allowlist ([offline-readonly.ts:6](../src/store/offline-readonly.ts))
  — `toggleTaskDone`, `deleteTask`, `moveTask`, `duplicateTask`,
  `saveTaskDetailPatch`, and more — enqueue offline and replay on reconnect, so
  calendar actions that reuse them get offline support for free. The exception is
  **bespoke drag writes**: Gantt's drag does a direct `POST /api/tasks/:id` and
  bails offline with "Reconnect to update tasks"
  ([ProjectGanttView.tsx:190](../src/components/project/views/ProjectGanttView.tsx))
  because it bypasses the store/queue. Routing drag-reschedule through a
  queueable store action is the only net-new piece, tracked as its own roadmap
  item.

### New modules (kept small and testable)

```
src/utils/calendar-placement.ts      pure date→placement engine (R2), unit-tested
src/utils/calendar-window.ts         visible-window math + range-filter builder (R3)
src/store/slices/calendar.ts         calendar slice: window state, loadCalendarTasks, cache
src/components/screens/CalendarScreen.tsx     shell: header, zoom switcher, view router
src/components/calendar/CalendarHeader.tsx    prev/next, Today, zoom, filter chip, completed toggle
src/components/calendar/MonthGrid.tsx         6×7 grid + "+X more" + selected-day list
src/components/calendar/TimeGrid.tsx          kanban-lane-per-day timeline for Week (7 lanes) & Day (1 lane)
src/components/calendar/useCalendarDrag.ts    drag/resize adapted from gantt-drag.ts (R7)
tests/unit/calendar-placement.test.ts         placement correctness (node:test)
```

The two pure utils carry the correctness risk and are testable without a server,
so they land and are green **before** any UI is wired.

### Phase 0 — Scaffolding behind a temporary route (no behaviour change) ✅
- Add the `Screen` union member, `screenFromPath` case, `mountedScreens` entry,
  and an empty `CalendarScreen` mounted at a **temporary `/calendar` route** (so
  Today is untouched and the new screen is reachable for development only).
- Add the empty `calendar` store slice. Lint/build/test stay green.
- *Reversible:* deleting one route line removes it entirely.

### Phase 1 — Placement engine + loading (no UI yet) ✅
- Implement `calendar-placement.ts` (R2) and `calendar-window.ts` (R3) +
  `loadCalendarTasks` in the slice, mirroring `loadUpcomingTasks`
  ([tasks.ts:362](../src/store/slices/tasks.ts)). Filter must capture
  **span-overlap**, not just `due_date` in range.
- Ship unit tests for placement (all-day vs timed at local 00:00, span clipping,
  DST/month boundaries, anchor fallback order) and the range-filter builder.
- *Verifiable headless:* `npm test`, no preview needed.

### Phase 2 — Month view, read-only (the hero) ✅
- Build `MonthGrid` consuming the placement engine: uniform cells, all-day bars
  first then timed, **"+X more"**, multi-day bars, **tap-day → selected-day list
  below** (reuse the existing collection list component).
- Wire `CalendarHeader` (prev/next, Today, completed toggle via
  `useShowCompletedTaskFilter`, filter chip). Still on `/calendar`.
- *Verify:* preview on LAN — real tasks on correct days, overflow, day-list.

### Phase 3 — Tap-to-add (composer integration) ✅
- Extend `openRootComposer` with `defaultDueDate?: string`
  ([task-composers.ts:68](../src/store/slices/task-composers.ts)), feeding the
  existing `composerDueDate`. The selected-day list header carries a **"+ Add"**
  action that opens the composer pre-dated to that day as an all-day task
  (`allDayDueIso` → UTC midnight) routed to the inbox project.
- *Verify:* tapping a day's "+ Add" opens the composer pre-dated; created task
  lands on the right cell.

### Phase 4 — Week & Day kanban-board timeline ✅
- `TimeGrid` renders each day as a kanban lane (reusing `.kanban-lane` /
  `.kanban-lane-head` + horizontal scroll), with an all-day card band and an
  hour-rail timeline inside; timed tasks placed by start, height by span,
  overlaps packed into side-by-side columns; a now-line on today. Day-zoom
  widens the single lane. Tap-slot → composer pre-filled exact datetime.
  Drill-down: Week lane head → Day; Month selected-day Day/Week buttons; Day
  header date picker. Reachable from the desktop WideSidebar.
- *Verify:* timed tasks at correct hours across tz; slot-add datetime;
  on-device.

### Phase 5 — Tap menu & actions ✅
- Each task block carries the full kanban frame; the ⋮ menu reuses `TaskMenu` →
  existing `toggleTaskDone` / `duplicateTask` / `deleteTask` and
  open-`TaskDetail`. Duplicate refreshes the window so the clone appears.
- *Verify:* each action from the grid; confirm flows reuse existing dialogs.

### Phase 6 — Drag & resize ✅
Built on the app's two existing drag engines, not a third one:
- **Month = move-only.** "Drag a selected-day task onto a day cell" rides the
  **shared SortableJS bridge** (`useSortableBridge`, the same engine
  list/project/kanban use): the bridge hit-tests in-month day cells during the
  drag, highlights via the existing `is-drop-target` class, and commits through
  `moveTaskToDay` on drop. No native HTML5 DnD, no calendar-only drag path.
- **Week/Day = slot move + edge-resize.** `useCalendarBoardDrag` is the
  vertical-time analogue of the gantt bar drag; both now share one pointer-drag
  lifecycle (`src/utils/pointer-drag.ts` — activation threshold, pointer
  capture/release, the window pointermove/up/cancel effect). Only the geometry
  differs (gantt: 1-D horizontal columns over `Date`; calendar: 2-D
  vertical-time + lane over `ms`). Commit via `rescheduleCalendarTask`.
- **"Move to date" is one picker everywhere** (`CompactDatePicker` +
  `moveTaskToDay`): inline (`MoveToDateField`) for list/tree rows including the
  calendar selected-day list, anchored ContextMenu popover for the space-
  constrained boards (Kanban cards, Gantt bars, calendar timeline cards). The
  calendar's old bespoke header-banner pick-mode was removed.
- *Verify:* covered by `react-calendar` + `react-projects` smokes (month day-cell
  drop fires the move POST, timed-card drag reschedules, gantt bar drag/resize,
  Move-to-date commit/cancel). iOS touch-drag still to confirm on device.

### Phase 7 — Route cutover
- Flip the index route `/` to `CalendarScreen`, remap the bottom-nav "Today"
  button and `screen === 'today'` semantics, retire/park `TodayScreen`, drop the
  temporary `/calendar` route. One small, easily-revertible commit.
- *Verify:* cold launch lands on the calendar (Day, today); "Today" nav works;
  iOS confirm.

### Sequencing & safety summary
- Phases 0–6 develop on a throwaway `/calendar` route → **zero risk to Today**
  until the deliberate cutover in Phase 7.
- Correctness-critical logic (placement, window/range) is pure and unit-tested
  in Phase 1, before any pixels.
- Every phase ends green on `lint && build && test`; touch/iOS-specific phases
  (4, 6, 7) get an on-device confirmation.
- The existing offline outbox covers calendar actions that reuse queueable store
  actions; only routing **bespoke drag writes** through it is out of scope here,
  tracked as its own roadmap item, so the calendar ships with drag as
  online-only (matching Gantt today) without blocking it.

---

## Reuse map (don't rebuild)

| Need | Existing asset |
| --- | --- |
| Date-range collection fetch | `loadUpcomingTasks` + `buildTaskCollectionPath` ([tasks.ts:362](../src/store/slices/tasks.ts), [selectors.ts:213](../src/store/selectors.ts)) |
| Pointer drag move/resize + day-shift math | `useGanttBarDrag`, `shiftDateByZoom` ([gantt-drag.ts](../src/components/project/views/gantt/gantt-drag.ts)) |
| Tap-to-add date defaulting | `openRootComposer` / `composerDueDate` ([task-composers.ts:68](../src/store/slices/task-composers.ts)) |
| Show/hide completed | `useShowCompletedTaskFilter` ([useShowCompleted.ts:13](../src/hooks/useShowCompleted.ts)) |
| Selected-day task list | the existing Today/`CollectionScreen` list ([CollectionScreen.tsx](../src/components/screens/CollectionScreen.tsx)) |
| Done styling | `--done-green` + strikethrough (roadmap item 3, already shipped) |
| Task graph normalization / offline snapshot | `normalizeTaskGraph`, `persistOfflineTaskCollections` (tasks slice) |
| Datetime editing | `TaskDateControl` / `CompactDatePicker` (datetime mode) |

---

## Verification

- **Placement engine:** unit tests (node:test, `tests/unit/`) for all-day vs
  timed classification, span clipping to window, DST/month boundaries, anchor
  fallback order. This is the correctness core — test before UI.
- **Loading:** assert `loadCalendarTasks` builds a filter that captures
  span-overlapping tasks, not just `due_date` in range.
- **Per-phase preview verification** (dev server on LAN): Month grid renders real
  tasks on correct days; "+X more" + tap-day list; tap-empty-day opens composer
  pre-dated; Week/Day timed placement at correct hour; tap-slot pre-fills
  datetime; tap-menu actions; drag between days/slots and edge-resize rewrite the
  right field; completed toggle.
- **iOS confirmation** for touch drag, tap-menu ergonomics, and the
  keyboard-pinned composer on tap-to-add — final confirm on device.
- `npm run lint && npm run build && npm test` clean at each phase.

---

## Constraints carried in

- Fully tokenized — no magic numbers; new colours alias existing `--lbl-*` /
  accent tokens.
- Platform-specific behaviour stays behind the `src/platform/registry.ts` ports;
  shared calendar code never imports platform adapters directly.
- Commit incrementally, one coherent unit per commit.
- The roadmap stays the source of truth: §1 links here and is marked in
  progress when work starts.
