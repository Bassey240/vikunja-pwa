import type {Project, Task} from '@/types'

export interface ProjectAggregateCounts {
	projectCount: number
	taskCount: number
	taskCountLoaded: boolean
}

export function compareByPositionThenId(
	a: {position?: number | null; id?: number | null},
	b: {position?: number | null; id?: number | null},
) {
	return Number(a.position || 0) - Number(b.position || 0) || Number(a.id || 0) - Number(b.id || 0)
}

export function isRootProject(project: Project) {
	return Number(project.parent_project_id || 0) === 0
}

export function findDefaultProjectId(projects: Project[]) {
	const rootProjects = projects.filter(isRootProject).sort(compareByPositionThenId)
	return rootProjects[0]?.id || null
}

export function getDefaultComposeProjectId(projects: Project[], defaultProjectId: number | null) {
	if (defaultProjectId && projects.some(project => project.id === defaultProjectId)) {
		return defaultProjectId
	}

	const inbox = projects.find(project => project.title?.toLowerCase() === 'inbox')
	return inbox?.id || findDefaultProjectId(projects)
}

export function getSavedFilterProjectId(filterId: number) {
	const numericFilterId = Number(filterId)
	if (!Number.isInteger(numericFilterId) || numericFilterId < 0) {
		return 0
	}

	return (numericFilterId + 1) * -1
}

export function resolveInboxProjectId(projects: Project[], defaultProjectId: number | null) {
	if (defaultProjectId && projects.some(project => project.id === defaultProjectId)) {
		return defaultProjectId
	}

	const inboxProject = projects.find(project => Boolean(project.is_inbox_project))
	if (inboxProject) {
		return inboxProject.id
	}

	const inboxByTitle = projects.find(project => project.title?.trim().toLowerCase() === 'inbox')
	if (inboxByTitle) {
		return inboxByTitle.id
	}

	return findDefaultProjectId(projects)
}

export function getProjectAncestors(projectId: number, projects: Project[]) {
	const byId = new Map(projects.map(project => [project.id, project]))
	const ancestors: Project[] = []
	let current = byId.get(projectId) || null

	while (current) {
		ancestors.unshift(current)
		current = byId.get(Number(current.parent_project_id || 0)) || null
	}

	return ancestors
}

export function getProjectPathTitle(projectId: number, projects: Project[]) {
	return getProjectAncestors(projectId, projects)
		.map(project => project.title)
		.join(' / ')
}

export function sortProjectsAlphabeticallyByPath(projects: Project[]) {
	return projects
		.slice()
		.sort((a, b) => {
			const pathA = getProjectPathTitle(a.id, projects)
			const pathB = getProjectPathTitle(b.id, projects)
			return pathA.localeCompare(pathB) || Number(a.id || 0) - Number(b.id || 0)
		})
}

export function getProjectDescendantIds(projectId: number, projects: Project[]) {
	const descendants = new Set<number>()
	const stack = [projectId]

	while (stack.length > 0) {
		const currentId = stack.pop()
		for (const project of projects) {
			if (Number(project.parent_project_id || 0) !== currentId || descendants.has(project.id)) {
				continue
			}

			descendants.add(project.id)
			stack.push(project.id)
		}
	}

	return descendants
}

export function getAvailableParentProjects(projectId: number, projects: Project[]) {
	const blockedIds = new Set([projectId, ...getProjectDescendantIds(projectId, projects)])
	return projects
		.filter(project => !blockedIds.has(project.id))
		.sort(compareByPositionThenId)
}

export function getVisibleRootProjects(projects: Project[]) {
	const projectMap = new Map(projects.map(project => [project.id, project]))

	return projects
		.filter(project => {
			const parentProjectId = Number(project.parent_project_id || 0)
			return parentProjectId === 0 || !projectMap.has(parentProjectId)
		})
		.sort(compareByPositionThenId)
}

export function getVisibleChildProjects(parentProjectId: number, projects: Project[]) {
	return projects
		.filter(project => Number(project.parent_project_id || 0) === parentProjectId)
		.sort(compareByPositionThenId)
}

export function getExpandableProjectIds(projects: Project[]) {
	const expandableIds = new Set<number>()

	for (const project of projects) {
		const parentProjectId = Number(project.parent_project_id || 0)
		if (parentProjectId > 0) {
			expandableIds.add(parentProjectId)
		}
	}

	return expandableIds
}

export function getProjectAggregateCountsMap(
	projects: Project[],
	projectFilterTasks: Task[],
	taskCountLoaded: boolean,
) {
	const projectMap = new Map(projects.map(project => [project.id, project]))
	const childIdsByParentId = new Map<number, number[]>()
	const directTaskCountsByProjectId = new Map<number, number>()

	for (const project of projects) {
		const parentProjectId = Number(project.parent_project_id || 0)
		if (!parentProjectId || !projectMap.has(parentProjectId) || parentProjectId === project.id) {
			continue
		}

		const childIds = childIdsByParentId.get(parentProjectId) || []
		childIds.push(project.id)
		childIdsByParentId.set(parentProjectId, childIds)
	}

	for (const task of projectFilterTasks) {
		const projectId = Number(task.project_id || 0)
		if (!projectMap.has(projectId)) {
			continue
		}

		directTaskCountsByProjectId.set(projectId, (directTaskCountsByProjectId.get(projectId) || 0) + 1)
	}

	const countsByProjectId = new Map<number, ProjectAggregateCounts>()
	const visiting = new Set<number>()

	function computeCounts(projectId: number): ProjectAggregateCounts {
		if (countsByProjectId.has(projectId)) {
			return countsByProjectId.get(projectId)!
		}

		if (visiting.has(projectId)) {
			return {
				projectCount: 0,
				taskCount: directTaskCountsByProjectId.get(projectId) || 0,
				taskCountLoaded: taskCountLoaded,
			}
		}

		visiting.add(projectId)

		let projectCount = 0
		let taskCount = directTaskCountsByProjectId.get(projectId) || 0

		for (const childId of childIdsByParentId.get(projectId) || []) {
			const childCounts = computeCounts(childId)
			projectCount += 1 + childCounts.projectCount
			taskCount += childCounts.taskCount
		}

		visiting.delete(projectId)

		const counts = {
			projectCount,
			taskCount,
			taskCountLoaded: taskCountLoaded,
		}
		countsByProjectId.set(projectId, counts)
		return counts
	}

	for (const project of projects) {
		computeCounts(project.id)
	}

	return countsByProjectId
}
