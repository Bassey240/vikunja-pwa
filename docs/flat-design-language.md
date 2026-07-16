# Flat Design Language

The single source of truth for the redesign's "flat" visual language, distilled
from the prototype (`Vikunja PWA CSS re-design/vikunja-styles.css`, the `.vk-*`
classes). Apply this everywhere — settings, menus, overlays, cards, sheets,
dialogs. When something looks "card-in-card," it's violating rule #1.

## Core rules

1. **One card depth.** A surface is *either* a card *or* it lives inside one —
   never both. No card-in-card. Inside a card, rows are separated by **hairlines**,
   not nested boxes.
2. **Type + spacing carry hierarchy**, not borders. Sizes: title 14, sub/value
   12–12.5, caption/eyebrow 11 (uppercase, `0.08em`), key 13.
3. **Accent only for active/selected state.** Status uses the semantic
   `--lbl-{blue,green,amber,red,violet,cyan}` tokens.
4. **Hairlines** are `--ink-line-soft` (row dividers) / `--hairline` (card edge) /
   `--hairline-2` (faint inner rules). In dark mode all three are lifted above
   the light ramp — a white line on near-black reads fainter than a black line
   on the light canvas at equal opacity, so dark runs hotter to keep the same
   structural definition.
5. **Radii:** cards/popovers `--radius-card` (12px); chips 999px; small controls
   6–8px. Squarer (8px) reads as "structural" (project rows).

## The transposable flatten: `.flat-surface` + `.flat-rows`

Cards draw their fill + edge from **tokens**, so flattening is two opt-in classes:

- **`.flat-surface`** — neutralizes the card tokens (`--surface-card`, `--line-ui`,
  `--detail-surface-bg/-border`, `--surface-pane`, `--radius-md`, `--shadow` →
  transparent/0), so **every descendant card flattens automatically, no class
  list**. Controls (inputs, buttons) re-assert a `--hairline` edge. Safe on *any*
  container — including form overlays/dialogs/sheets — because it does **not** add
  dividers.
- **`.flat-rows`** — adds the row treatment on top: de-borders each child and
  draws a full-width hairline between consecutive rows. Use it for **row-list**
  surfaces only (settings) — not forms (you don't want a line between every field).

`.settings-section-content` = both. Overlays that are forms (composer sheet,
detail sheet, dialogs) get `.flat-surface` only — they're opted in via the token
group, so their inner cards flatten without spurious dividers.

## Squareness

Action buttons (`.composer-submit`, `.pill-button`, `.ghost-button`) and inputs
(`.detail-input`, `.detail-textarea`) are **8px** radius — no full-pill buttons.
(The FAB and checkboxes stay round on purpose.)

## Building blocks

### Surface card
`background: var(--surface); border: 1px solid var(--ink-line-soft);
border-radius: var(--radius-card); overflow: hidden;` — gap 12px between cards.

There is **one** card fill: `--surface` (alias `--surface-card`). Every card uses
it — list/task rows, kanban cards **and column heads**, calendar timeline cards,
chips, all-day items, and day heads. There is no separate "kanban" shade.
`--bg-soft` is a soft-tint mix base (done/selected/toast), never a bare card
fill; `--surface-card-strong` is the emphasis-chip token (active pills, sidebar
nav, auth line), not a card. This invariant is guarded by
`tests/unit/design-tokens.test.ts`.

### Overlay / popover (menus, dropdowns)
Surface card **+ `box-shadow: var(--shadow-overlay)`**. Items are flat:
`padding: 9px 12px; border-radius: 7px; background: transparent;`
`:hover → var(--surface-2)`; `.is-active → var(--accent-soft)/var(--accent)`;
danger → `var(--lbl-red)`. *(applied: `.inline-menu` / `.menu-item`)*

### Accordion group (settings)
- Group = one surface card; only **one open at a time**.
- Head: `padding: 12px 16px; cursor: pointer; :hover → surface-2`. Open state →
  bottom hairline + caption brightens to `--text`. Chevron rotates 90°.
- Caption = 11px uppercase `0.08em` `--text-faint`/`600`.
- *(applied: `.settings-section` / `.settings-section-header`)*

### Rows (hairline-separated, never boxed)
| Row | Anatomy |
|---|---|
| Nav/action (`.vk-settings-row`) | 28px icon chip (`--surface-3`, 8px radius) · title 14/500 · sub 12 dim · trailing value/chevron. `.vk-danger` → red. |
| Key/value (`.vk-form-row`) | grid `1fr auto`: key 13 + sub 11.5 · value 12.5 dim (accent if link). 12/16 padding. |
| Toggle | row + 36×20 pill, white knob, accent when on. |
| Radio (`.vk-radio-row`) | 16px dot, accent ring when active · title/sub. |
| Color (`.vk-color-swatch`) | 26px rounded squares, accent ring when active. |

### Atoms
- **Input:** `--surface-2` bg, 1px `--hairline`, 8px radius, 8/10 padding,
  `:focus → outline 2px var(--accent-soft); border-color var(--accent)`.
- **Banner:** tinted pill (`--lbl-green` default / `--lbl-amber`), 10px radius,
  icon circle.
- **Sync queue:** icon chip + label + status (pending=amber, failed=red).

### Project row (`.vk-proj-row`)
Distinct from tasks: **full border tinted with the project's own color**
(`color-mix(... 55%)`, 72% hover) + 4px colored left edge, `--surface` bg, 8px
radius, title+meta **inline** (13.5/600 title, 11 dim meta). Colorless →
`--proj-ink`. *(applied: `.project-node-row`)*

### Task row (`.vk-row`)
`--surface` bg, 1px `--stroke`, 12px radius, subtle rest shadow; hover-reveal
grip/⋯ trail on desktop (`data-handles="hover"`), always-on touch.

## Type
`--font-ui` / `--font-display` = Geist; `--font-mono` = Geist Mono. Eyebrows/keys
use the mono face.

## Rollout status
- ✅ Tokens, fonts · task rows, chips, checkbox · project rows · bottom tab bar ·
  mobile masthead · desktop sidebar / main-head / inspector · **overlay menus** ·
  **settings** (flat accordion, no card-in-card) · **detail panels** (task +
  project, via `.detail-section-content`) · **overlays** (composer / add-task /
  subtask, bulk editor, project/task/label detail, settings dialogs, search /
  filter / notification / background panels).
- ✅ Squareness: buttons + inputs 8px; status/role + **label** chips 6px; FAB
  squared. Footer flat full-width strip; launch safe-area jump fixed
  (`src/platform/safeArea.ts`).
- ⏳ Remaining: **Gantt** (most custom); per-screen empty-state/spacing polish.
