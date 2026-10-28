export function prepareV2Body(route: string, body: unknown): unknown
export function prepareRepeatBody(body: unknown): unknown
export function buildTimeEntryPayload(body: unknown, existing?: unknown): {task_id: number; project_id: number; start_time?: string; end_time: string | null; comment: string}
