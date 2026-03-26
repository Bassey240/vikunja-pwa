const STORAGE_KEY = 'vikunja-mobile-poc:drag-perf-debug'
const MAX_HISTORY = 20

type DragPerfKind = 'task' | 'project'

type DragPerfPhase = {
	name: string
	at: number
	detail?: unknown
}

type DragPerfBaseTrace = {
	token: string
	kind: DragPerfKind
	startedAt: number
	phases: DragPerfPhase[]
	firstPainted: boolean
	asyncResolved: boolean
	completed: boolean
}

type TaskDropTrace = DragPerfBaseTrace & {
	kind: 'task'
	taskId: number
	sourceProjectId: number
	targetProjectId: number
	targetParentTaskId: number | null
}

type ProjectDropTrace = DragPerfBaseTrace & {
	kind: 'project'
	projectId: number
	sourceParentProjectId: number
	targetParentProjectId: number
	targetBeforeProjectId: number | null
	targetAfterProjectId: number | null
}

type DragPerfState = {
	activeTaskDrop: TaskDropTrace | null
	activeProjectDrop: ProjectDropTrace | null
	history: Array<TaskDropTrace | ProjectDropTrace>
}

declare global {
	interface Window {
		__vikunjaDragPerf?: DragPerfState
	}
}

function now() {
	return typeof performance !== 'undefined' && typeof performance.now === 'function'
		? performance.now()
		: Date.now()
}

function isEnabled() {
	if (typeof window === 'undefined') {
		return false
	}

	try {
		return window.localStorage.getItem(STORAGE_KEY) === '1'
	} catch {
		return false
	}
}

function getState() {
	if (typeof window === 'undefined') {
		return null
	}

	if (!window.__vikunjaDragPerf) {
		window.__vikunjaDragPerf = {
			activeTaskDrop: null,
			activeProjectDrop: null,
			history: [],
		}
	}

	if (!('activeProjectDrop' in window.__vikunjaDragPerf)) {
		window.__vikunjaDragPerf.activeProjectDrop = null
	}
	if (!Array.isArray(window.__vikunjaDragPerf.history)) {
		window.__vikunjaDragPerf.history = []
	}

	return window.__vikunjaDragPerf
}

function roundMs(value: number) {
	return Math.round(value * 10) / 10
}

function describeTrace(trace: TaskDropTrace | ProjectDropTrace) {
	if (trace.kind === 'task') {
		return {
			kind: trace.kind,
			taskId: trace.taskId,
			sourceProjectId: trace.sourceProjectId,
			targetProjectId: trace.targetProjectId,
			targetParentTaskId: trace.targetParentTaskId,
		}
	}

	return {
		kind: trace.kind,
		projectId: trace.projectId,
		sourceParentProjectId: trace.sourceParentProjectId,
		targetParentProjectId: trace.targetParentProjectId,
		targetBeforeProjectId: trace.targetBeforeProjectId,
		targetAfterProjectId: trace.targetAfterProjectId,
	}
}

function logPhase(trace: TaskDropTrace | ProjectDropTrace, phase: DragPerfPhase) {
	console.debug('[drag-perf]', {
		...describeTrace(trace),
		phase: phase.name,
		ms: roundMs(phase.at - trace.startedAt),
		detail: phase.detail,
	})
}

function getTraceLabel(trace: TaskDropTrace | ProjectDropTrace) {
	if (trace.kind === 'task') {
		return `task ${trace.taskId} ${trace.sourceProjectId}->${trace.targetProjectId}`
	}

	return `project ${trace.projectId} ${trace.sourceParentProjectId}->${trace.targetParentProjectId}`
}

function maybeFinalizeTrace(trace: TaskDropTrace | ProjectDropTrace) {
	if (trace.completed || !trace.firstPainted || !trace.asyncResolved) {
		return
	}

	trace.completed = true
	const state = getState()
	if (!state) {
		return
	}

	if (state.activeTaskDrop?.token === trace.token) {
		state.activeTaskDrop = null
	}
	if (state.activeProjectDrop?.token === trace.token) {
		state.activeProjectDrop = null
	}

	state.history.unshift(trace)
	state.history = state.history.slice(0, MAX_HISTORY)

	console.groupCollapsed(`[drag-perf] ${getTraceLabel(trace)}`)
	console.table(
		trace.phases.map(phase => ({
			phase: phase.name,
			ms: roundMs(phase.at - trace.startedAt),
			detail: phase.detail ? JSON.stringify(phase.detail) : '',
		})),
	)
	console.groupEnd()
}

export function beginTaskDropTrace({
	taskId,
	sourceProjectId,
	targetProjectId,
	targetParentTaskId,
}: {
	taskId: number
	sourceProjectId: number
	targetProjectId: number
	targetParentTaskId: number | null
}) {
	if (!isEnabled()) {
		return null
	}

	const state = getState()
	if (!state) {
		return null
	}

	const trace: TaskDropTrace = {
		token: `${taskId}:${now()}`,
		taskId,
		sourceProjectId,
		targetProjectId,
		targetParentTaskId,
		kind: 'task',
		startedAt: now(),
		phases: [],
		firstPainted: false,
		asyncResolved: false,
		completed: false,
	}

	state.activeTaskDrop = trace
	markTaskDropTrace(trace.token, 'drop-start', {
		sourceProjectId,
		targetProjectId,
		targetParentTaskId,
	})
	return trace.token
}

export function markTaskDropTrace(token: string | null, name: string, detail?: unknown) {
	if (!token || !isEnabled()) {
		return
	}

	const trace = getState()?.activeTaskDrop
	if (!trace || trace.token !== token || trace.completed) {
		return
	}

	const phase = {
		name,
		at: now(),
		detail,
	}
	trace.phases.push(phase)
	logPhase(trace, phase)

	if (name === 'async-resolved') {
		trace.asyncResolved = true
	}
	if (name === 'first-destination-paint') {
		trace.firstPainted = true
	}
	if (name === 'drop-failed') {
		trace.asyncResolved = true
		trace.firstPainted = true
	}

	maybeFinalizeTrace(trace)
}

export function getActiveTaskDropTrace() {
	if (!isEnabled()) {
		return null
	}

	return getState()?.activeTaskDrop || null
}

export function isTaskDropTraceTarget(taskId: number, projectId: number, parentTaskId: number | null) {
	const trace = getActiveTaskDropTrace()
	if (!trace || trace.completed) {
		return null
	}

	if (trace.taskId !== taskId || trace.targetProjectId !== projectId || trace.targetParentTaskId !== parentTaskId) {
		return null
	}

	return trace
}

export function beginProjectDropTrace({
	projectId,
	sourceParentProjectId,
	targetParentProjectId,
	targetBeforeProjectId,
	targetAfterProjectId,
}: {
	projectId: number
	sourceParentProjectId: number
	targetParentProjectId: number
	targetBeforeProjectId: number | null
	targetAfterProjectId: number | null
}) {
	if (!isEnabled()) {
		return null
	}

	const state = getState()
	if (!state) {
		return null
	}

	const trace: ProjectDropTrace = {
		token: `${projectId}:${now()}`,
		kind: 'project',
		projectId,
		sourceParentProjectId,
		targetParentProjectId,
		targetBeforeProjectId,
		targetAfterProjectId,
		startedAt: now(),
		phases: [],
		firstPainted: false,
		asyncResolved: false,
		completed: false,
	}

	state.activeProjectDrop = trace
	markProjectDropTrace(trace.token, 'drop-start', {
		sourceParentProjectId,
		targetParentProjectId,
		targetBeforeProjectId,
		targetAfterProjectId,
	})
	return trace.token
}

export function markProjectDropTrace(token: string | null, name: string, detail?: unknown) {
	if (!token || !isEnabled()) {
		return
	}

	const trace = getState()?.activeProjectDrop
	if (!trace || trace.token !== token || trace.completed) {
		return
	}

	const phase = {
		name,
		at: now(),
		detail,
	}
	trace.phases.push(phase)
	logPhase(trace, phase)

	if (name === 'async-resolved') {
		trace.asyncResolved = true
	}
	if (name === 'first-destination-paint') {
		trace.firstPainted = true
	}
	if (name === 'drop-failed') {
		trace.asyncResolved = true
		trace.firstPainted = true
	}

	maybeFinalizeTrace(trace)
}

export function getActiveProjectDropTrace() {
	if (!isEnabled()) {
		return null
	}

	return getState()?.activeProjectDrop || null
}

export function isProjectDropTraceTarget(projectId: number, parentProjectId: number) {
	const trace = getActiveProjectDropTrace()
	if (!trace || trace.completed) {
		return null
	}

	if (trace.projectId !== projectId || trace.targetParentProjectId !== parentProjectId) {
		return null
	}

	return trace
}
