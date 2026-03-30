# Refactor: Unified Drag-and-Drop Task Move Function

## Problem

Task drag-and-drop has **4 separate code paths** that each handle position calculation, optimistic updates, API calls, and background refresh independently:

1. **List reorder** (`handleSortableTaskEnd` → `moveTaskToPlacement`)
2. **Kanban bucket move** (`handleSortableTaskEnd` → `moveTaskToBucket`)
3. **Cross-project drop** (`handleSortableTaskEnd` → `moveTaskToPlacement` with project change)
4. **Subtask drop** (`handleSortableTaskEnd` → `moveTaskToPlacement` with parent change)

This causes recurring bugs: fixes applied to one path don't apply to others. For example:
- Kanban had its own position calculation, optimistic update, and view ID resolution — all separate from the list path
- Today screen position preservation only applies to `loadTodayTasks`, not to kanban refreshes
- Cross-project view ID resolution was fixed in `getCurrentProjectTaskViewId` but kanban uses `store.currentProjectViewId` directly

## Goal

Consolidate into **one unified move function** that all drag paths call, adapting behavior based on what changed (position, parent, project, bucket).

## Architecture Overview

### Current Flow
```
handleSortableTaskEnd
  ├─ kanban bucket? → moveTaskToBucket (views.ts)
  │    ├─ applyOptimisticBucketMove (custom)
  │    ├─ POST /api/projects/{id}/views/{viewId}/buckets/{bucketId}/tasks
  │    ├─ POST /api/tasks/{id}/position
  │    └─ error? → loadProjectBuckets + refreshCurrentCollections
  │
  ├─ project drop? → moveTaskToPlacement (tasks.ts)
  ├─ subtask drop? → moveTaskToPlacement (tasks.ts)
  └─ list reorder? → moveTaskToPlacement (tasks.ts)
       ├─ applyOptimisticTaskPlacement OR applyOptimisticVisibleTaskPlacement
       ├─ POST /api/tasks/{id} (project change)
       ├─ DELETE/PUT /api/tasks/{id}/relations (parent change)
       ├─ POST /api/tasks/{id}/position
       └─ refreshBackgroundVisibleTaskCollectionsAfterDrop
```

### Target Flow
```
handleSortableTaskEnd
  ├─ Detect intent (reorder / reparent / move project / move bucket)
  └─ moveTask(taskId, intent)
       ├─ Resolve view ID (unified)
       ├─ Calculate position (unified)
       ├─ Apply optimistic update (unified, handles all collections + buckets)
       ├─ Execute API calls (conditional based on intent)
       └─ Background refresh (unified)
```

## Implementation Plan

### Step 1: Create unified move types

**File:** `src/store/types/task-move.ts` (new)

Define a single intent type that covers all move scenarios:

```typescript
export interface TaskMoveIntent {
  taskId: number

  // Position (at least one of these for reorder)
  beforeTaskId?: number | null
  afterTaskId?: number | null
  siblingIds?: number[] | null

  // Reparenting
  parentTaskId?: number | null      // null = promote to root, undefined = no change

  // Cross-project
  targetProjectId?: number | null   // undefined = same project

  // Kanban
  bucketId?: number | null          // undefined = no bucket change

  // Context
  taskList?: Task[] | null          // Explicit collection context
  traceToken?: string | null        // Performance tracing
}
```

### Step 2: Create unified `moveTask` function

**File:** `src/store/slices/tasks.ts` (modify)

Create `moveTask(intent: TaskMoveIntent)` that replaces both `moveTaskToPlacement` and `moveTaskToBucket`. The function should:

1. **Validate** — find task, check circular parent, resolve target project
2. **Resolve view ID** — call `resolveActiveProjectTaskViewId` with proper context for ANY screen
3. **Calculate position** — use `resolveMovedTaskPosition` or kanban bucket position calculation (same logic, unified)
4. **Apply optimistic update** — single function that handles:
   - List collections (todayTasks, inboxTasks, tasks, etc.)
   - Bucket collections (projectBucketsByViewId)
   - Parent/subtask relationship updates
   - Sequential position assignment (currently only in kanban path)
5. **API calls** (in order):
   - Project move: `POST /api/tasks/{id}` (if `targetProjectId` differs)
   - Parent relation delete: `DELETE /api/tasks/{parentId}/relations/subtask/{taskId}` (if parent changed)
   - Parent relation add: `PUT /api/tasks/{parentId}/relations` (if new parent)
   - Bucket assignment: `POST /api/projects/{id}/views/{viewId}/buckets/{bucketId}/tasks` (if bucket changed)
   - Position save: `POST /api/tasks/{id}/position` (always, when position is finite)
6. **Read backend position** — if server returns normalized position, apply it to ALL collections (list + buckets)
7. **Background refresh** — `refreshBackgroundVisibleTaskCollectionsAfterDrop` (already unified)

### Step 3: Create unified optimistic update

**File:** `src/store/task-helpers.ts` (modify)

Replace `applyOptimisticTaskPlacement`, `applyOptimisticVisibleTaskPlacement`, and `applyOptimisticBucketMove` with a single `applyOptimisticTaskMove`:

```typescript
export function applyOptimisticTaskMove(
  state: AppStore,
  intent: {
    task: Task
    targetProjectId: number
    parentTask: Task | null
    nextParentTaskId: number | null
    beforeTaskId: number | null
    afterTaskId: number | null
    siblingIds: number[] | null
    position: number
    bucketId: number | null       // NEW: kanban bucket
    viewId: number | null         // NEW: for bucket lookup
  },
): TaskCollectionMutationSet
```

This function should:
1. Remove task from ALL list collections (same as current `applyOptimisticTaskPlacement`)
2. Remove task from ALL bucket collections (same as current `applyOptimisticBucketMove` removal step)
3. Update parent/subtask relationships across all collections
4. Insert into target list collection at correct index
5. If `bucketId` provided: insert into target bucket, assign sequential positions `(i+1)*1024`
6. Reorder list siblings via `applyLocalSiblingReorderInList`
7. Update task detail if open

### Step 4: Simplify `handleSortableTaskEnd`

**File:** `src/hooks/useDragAndDrop.tsx` (modify)

Replace the 4 branch paths with unified intent construction:

```typescript
async function handleSortableTaskEnd(event: SortableEvent) {
  // ... existing setup (find task, cleanup drag state) ...

  // Detect intent
  const intent: TaskMoveIntent = { taskId: task.id }

  const kanbanBucketId = extractKanbanBucketId(event.to)
  if (kanbanBucketId) {
    intent.bucketId = kanbanBucketId
    const siblingIds = getSiblingTaskIdsFromContainer(event.to)
    const movedIndex = siblingIds.indexOf(taskId)
    intent.beforeTaskId = siblingIds[movedIndex - 1] || null
    intent.afterTaskId = siblingIds[movedIndex + 1] || null
  } else if (releaseProjectTarget?.projectId) {
    intent.targetProjectId = releaseProjectTarget.projectId
    intent.parentTaskId = null
    intent.taskList = getVisibleTaskListForTaskDrop(...)
  } else if (releaseTaskTarget?.taskId) {
    intent.parentTaskId = releaseTaskTarget.taskId
  } else {
    // List reorder
    if (!isManualTaskSortActive()) {
      restoreSortableDomPosition(event)
      return
    }
    const parentBranch = event.to.closest('.task-branch[data-task-branch-id]')
    intent.parentTaskId = parentBranch ? Number(parentBranch.dataset.taskBranchId) : null
    intent.targetProjectId = resolveTaskDropTargetProjectId(...)
    const siblingIds = getSiblingTaskIdsFromContainer(event.to)
    const movedIndex = siblingIds.indexOf(taskId)
    intent.beforeTaskId = siblingIds[movedIndex - 1] || null
    intent.afterTaskId = siblingIds[movedIndex + 1] || null
    intent.siblingIds = siblingIds
    intent.taskList = getVisibleTaskListForTaskDrop(...)
  }

  await commitTaskDrop(event, {
    traceToken: beginTaskDropTrace({...}),
    suppressRollbackFlash: ...,
    commitMove: () => store.moveTask(intent),
  })
}
```

### Step 5: Remove dead code

After the refactor is verified working:

1. Delete `moveTaskToPlacement` from `src/store/slices/tasks.ts`
2. Delete `moveTaskToBucket` from `src/store/slices/views.ts`
3. Delete `applyOptimisticBucketMove` from `src/store/slices/views.ts`
4. Delete `applyOptimisticVisibleTaskPlacement` from `src/store/task-helpers.ts`
5. Remove the separate `applyOptimisticTaskPlacement` (replaced by `applyOptimisticTaskMove`)
6. Update any other callers of these functions (check `moveTaskToPlacement` references — also used by the "Move up"/"Move down" menu buttons in `public/app/task-position.js`)

## Key Files

| File | Changes |
|------|---------|
| `src/store/types/task-move.ts` | NEW — `TaskMoveIntent` type |
| `src/store/slices/tasks.ts` | Add `moveTask`, remove `moveTaskToPlacement` |
| `src/store/slices/views.ts` | Remove `moveTaskToBucket`, `applyOptimisticBucketMove` |
| `src/store/task-helpers.ts` | Add `applyOptimisticTaskMove`, remove old optimistic functions |
| `src/hooks/useDragAndDrop.tsx` | Simplify `handleSortableTaskEnd` to use `moveTask` |
| `public/app/task-position.js` | Update "Move up"/"Move down" to use `moveTask` |

## Testing

All 18 existing smoke tests in `tests/smoke/react-dnd.react.smoke.spec.js` must pass without modification. These tests cover:
- Root project reorder
- Root task reorder (list view)
- Cross-project task drag
- Cross-project edge positioning
- Projects overview cross-project drops
- Cross-type rejection
- Collapsed parent after subtask drop
- Subtask promotion (drag to root)
- Today screen nesting with due date preservation
- Today screen drag reorder with background refresh
- Cross-project view ID isolation

No new tests are needed — the existing tests already cover all the scenarios. If a test fails, the refactor has a bug.

## Constraints

- Do NOT change any API endpoints or server-side logic
- Do NOT change the Sortable.js integration (event handling, DOM manipulation)
- Do NOT change the `commitTaskDrop` / `restoreSortableDomPosition` rollback mechanism
- Do NOT change `refreshBackgroundVisibleTaskCollectionsAfterDrop` — it already works correctly
- Do NOT change `loadTodayTasks` position preservation — it's needed because `/api/tasks/today` returns position=0
- Preserve all tracing (`beginTaskDropTrace`, `markTaskDropTrace`) for debugging
- Preserve the `shouldSkipFullRefreshForVisibleTaskDrop` optimization
- The `TaskMoveIntent` should be the ONLY interface callers need — all complexity is internal

## Order of Operations

1. Create `TaskMoveIntent` type
2. Create `applyOptimisticTaskMove` (can coexist with old functions)
3. Create `moveTask` (can coexist with `moveTaskToPlacement` and `moveTaskToBucket`)
4. Update `handleSortableTaskEnd` to use `moveTask`
5. Update `public/app/task-position.js` to use `moveTask`
6. Run all 18 smoke tests
7. Delete old functions only after tests pass
8. Run all smoke tests again
