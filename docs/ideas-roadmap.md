# Vikunja PWA / iOS — Product Ideas Roadmap

A living backlog of feature ideas and UX fixes. This is **not** the engineering
phase plan (that's [ios-roadmap.md](ios-roadmap.md)) — this is the "what we want
to build and fix" list. Items move from here into a real plan when we pick them
up.

Status legend: 🟢 quick fix · 🟡 medium · 🔴 large / multi-session

---

## 1. Calendar view (replaces / enhances Today) 🔴 📐 🚧 in progress

> **Full spec:** [calendar-view-requirements.md](calendar-view-requirements.md)
> — requirements + a safe, phased technical plan (built behind a temporary
> `/calendar` route, cut over to `/` only at the end). The open questions below
> are now resolved there.
>
> **Progress:** Phases 0–6 shipped behind the temporary `/calendar` route —
> scaffolding, the pure placement/window engine (unit-tested), the read-only
> Month grid with selected-day list, and tap-to-add composer targeting. Calendar
> edits/deletes apply and undo optimistically like the other views. The Week &
> Day timeline now renders as a **kanban board**: each day is a kanban lane
> (tappable head + all-day card band + an hour-rail timeline placing timed tasks
> by start time, overlaps packed side by side, now-line on today), lanes scroll
> horizontally. Tasks use the full kanban frame — done checkbox, `TaskCard`
> body, drag handle, ⋮ menu (Edit / Duplicate / Delete via the shared
> `TaskMenu`). Navigation: Week lane head → Day, Month selected-day Day/Week
> buttons, Day-view header date picker. The calendar is reachable from the
> desktop WideSidebar as well as the mobile shell. **Phase 6 — drag & resize**
> is in: Month "drag a selected-day task onto a day cell" rides the shared
> SortableJS bridge (same engine as list/project/kanban), Week/Day timeline
> move + edge-resize rides a pointer-drag lifecycle now shared with the gantt
> engine (`src/utils/pointer-drag.ts`), and "Move to date" everywhere goes
> through one picker (`CompactDatePicker` + `moveTaskToDay`) — inline for list
> rows, anchored popover for boards. **Next: Phase 7 — route cutover** (flip
> `/` to the calendar, remap the Today nav, retire `/calendar`).

The big one. A calendar surface that **enhances and effectively replaces the
current Today view**. Three zoom levels, WeekCal-style density, and direct
editing from the grid.

**Views**
- **Month** — each day cell shows a tiny detail list of that day's tasks
  (WeekCal-style mini agenda inside the cell), not just a dot/count.
- **Week** — laid out like a kanban, but the columns are the days of the week
  sitting next to each other. Drag tasks between day-columns.
- **Today** — the current Today view, now time-aware: tasks shown against times
  of day (timeline). Navigating to the current date lands you here.

**Interactions**
- Tap a day → list of that day's tasks appears below the calendar.
- Tap a day (or a time slot) → add-task composer opens **pre-targeted to that
  day/time**, so adding drops the task straight onto that date.
- Tap a task → edit options (copy / paste / delete / edit), WeekCal-style.
- Drag-and-drop tasks **between days** and **between times** to reschedule.
- "Go to today" navigation = your Today view.

**Notes**
- Reference feel: WeekCal (dense day cells, tap-to-edit, copy/paste of events).
- Week view = kanban-of-days mental model.
- ⚠️ **When we start planning this, expect many questions** — data model for
  timed vs all-day tasks, how Vikunja stores due/start times, recurring tasks,
  multi-day spans, timezone handling (Vikunja stores due dates at midnight UTC),
  cross-view DnD semantics, and how this coexists with or supersedes the list
  views.

---

## 3. Bulk-edit vs done state is indistinguishable 🟢 ✅ done

When bulk edit is active, the bulk-edit selection checkmark **replaces** the
done checkmark, so you can't tell which tasks are already done.

- Done tasks should be visually distinct independent of the checkmark — e.g.
  **strikethrough / struck-through font** on the title.
- Bulk-edit selection checkmarks need the **same size and styling** as the done
  checkmarks (currently they read as a different control).

**Shipped:** done checks fill green (`--done-green`), bulk checks fill accent
blue, same size/shape via shared `--checkbox-size`; done titles strike through.
Commit `25c958e`.

---

## 4. Composer flashes on continuous add 🟡 ✅ done

During continuous task entry, every time you tap done to commit a task the
composer **flashes out and back in**. It should stay **steady and mounted**
until explicitly discarded, with the task-name field **kept focused/active** for
the next entry. No teardown/remount between adds.

(Related history: composer has two fixed positions and must never drift — see
memory `composer-two-positions`. Whatever fixes the flash must not reintroduce
position drift.)

**Shipped:** root cause was focus loss on submit (Add button stealing focus +
subtask input `disabled` while submitting), which dismissed the iOS keyboard and
dropped the keyboard-pinned composer. Guarded the Add buttons with
`onMouseDown` preventDefault and stopped disabling the input. Commit `e9f70d8`.
Confirmed on-device (LAN dev build, mobile).

---

## 5. Quick Add Magic — no visual confirmation 🟡 ✅ done

Quick Add Magic parsing works well, but there's **no visual feedback** while
typing, so you can't tell a magic token will be parsed vs. treated as part of the
title.

- While typing, **highlight recognized magic tokens inline** (e.g. typing
  `today`, `*label`, `@assignee`, `!priority`, `+project`) so the user sees the
  word will become metadata, not literal title text.
- Goal: a live visual cue that the token is being captured by Quick Add Magic
  before the task is committed.

**Shipped:** `tokenizeQuickAddMagic` + a layered `HighlightedTaskInput` colour
each token inline (palette-aliased), applied in the root + subtask composers.
Unit-tested, including a guard that token spans match what the parser removes.
Commit `088b451`.

---

## 6. Extend offline-queue coverage to bespoke drag writes 🟡

**Status: the queue already exists** — `src/store/offline-queue.ts` /
`offline-sync.ts` back a persisted, IndexedDB mutation outbox with
pending/syncing/failed/succeeded states, temp-id remapping, a Topbar indicator,
and a Settings UI. Store actions on the `QUEUEABLE_ACTIONS` allowlist
([offline-readonly.ts:6](../src/store/offline-readonly.ts)) — `toggleTaskDone`,
`deleteTask`, `moveTask`, `duplicateTask`, `saveTaskDetailPatch`,
`submitRootTask`, and ~15 more — already enqueue offline and replay on
reconnect. Non-allowlisted actions are blocked with a notice.

The real gap: **bespoke drag writes bypass the queue.** Gantt's drag commit
hits `POST /api/tasks/:id` directly and, when offline, bails with
"You're offline. Reconnect to update tasks."
([ProjectGanttView.tsx:190](../src/components/project/views/ProjectGanttView.tsx))
rather than enqueueing — because it isn't a store action routed through
`shouldQueueOffline`.

Goal: route drag-reschedule / span-resize writes (Gantt **and** the new
calendar) through the existing queue instead of a direct `POST` that bails.

- Move the drag commit into a queueable store action (e.g. `rescheduleTask`)
  on the allowlist, so it enqueues offline exactly like `moveTask` does today.
- Reuse the existing outbox, indicator, and replay — no new infrastructure.
- The calendar (item 1) inherits this for free once its writes are store
  actions; until then it ships as offline-read-only, matching Gantt today.

---

## Parking lot (unsorted / future)

_Add new ideas here; promote them into a numbered section when they firm up._
