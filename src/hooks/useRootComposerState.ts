import {useAppStore} from '@/store'
import {sortProjectsAlphabeticallyByPath} from '@/store/project-helpers'
import {findTaskInAnyContext} from '@/store/selectors'
import {type FormEvent, useMemo, useRef, useState} from 'react'

export function useRootComposerState() {
	const rootComposerOpen = useAppStore(state => state.rootComposerOpen)
	const rootComposerPlacement = useAppStore(state => state.rootComposerPlacement)
	const rootSubmitting = useAppStore(state => state.rootSubmitting)
	const composerProjectId = useAppStore(state => state.composerProjectId)
	const composerParentTaskId = useAppStore(state => state.composerParentTaskId)
	const projects = useAppStore(state => state.projects)
	const taskDetail = useAppStore(state => state.taskDetail)
	const tasks = useAppStore(state => state.tasks)
	const todayTasks = useAppStore(state => state.todayTasks)
	const inboxTasks = useAppStore(state => state.inboxTasks)
	const upcomingTasks = useAppStore(state => state.upcomingTasks)
	const searchTasks = useAppStore(state => state.searchTasks)
	const savedFilterTasks = useAppStore(state => state.savedFilterTasks)
	const projectPreviewTasksById = useAppStore(state => state.projectPreviewTasksById)
	const getProjectAncestors = useAppStore(state => state.getProjectAncestors)
	const closeRootComposer = useAppStore(state => state.closeRootComposer)
	const setComposerProjectId = useAppStore(state => state.setComposerProjectId)
	const submitRootTask = useAppStore(state => state.submitRootTask)
	const [title, setTitle] = useState('')
	const inputRef = useRef<HTMLInputElement | null>(null)

	const parentTask = useMemo(() => {
		if (!composerParentTaskId) {
			return null
		}

		if (taskDetail?.id === composerParentTaskId) {
			return taskDetail
		}

		return findTaskInAnyContext(composerParentTaskId, {
			tasks,
			todayTasks,
			inboxTasks,
			upcomingTasks,
			searchTasks,
			savedFilterTasks,
			projectPreviewTasksById,
		})
	}, [
		composerParentTaskId,
		inboxTasks,
		projectPreviewTasksById,
		savedFilterTasks,
		searchTasks,
		taskDetail,
		tasks,
		todayTasks,
		upcomingTasks,
	])

	const sortedProjects = useMemo(() => sortProjectsAlphabeticallyByPath(projects), [projects])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await submitRootTask(title)
		if (success) {
			setTitle('')
			inputRef.current?.focus()
		}
	}

	return {
		rootComposerOpen,
		rootComposerPlacement,
		rootSubmitting,
		composerProjectId,
		closeRootComposer,
		getProjectAncestors,
		handleSubmit,
		inputRef,
		parentTask,
		setComposerProjectId,
		setTitle,
		sortedProjects,
		title,
	}
}
