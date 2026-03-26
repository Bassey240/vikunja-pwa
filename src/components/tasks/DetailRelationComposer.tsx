import {api} from '@/api'
import {useAppStore} from '@/store'
import {buildTaskCollectionPath, normalizeTaskGraph} from '@/store/selectors'
import type {Task, TaskRelationKind} from '@/types'
import {TASK_RELATION_KINDS, TASK_RELATION_LABELS} from '@/utils/taskRelations'
import {type FormEvent, useEffect, useMemo, useState} from 'react'

export default function DetailRelationComposer({
	taskId,
	projectId,
	defaultRelationKind = 'subtask',
	onDone,
}: {
	taskId: number
	projectId: number
	defaultRelationKind?: TaskRelationKind
	onDone: () => void
}) {
	const projects = useAppStore(state => state.projects)
	const addTaskRelation = useAppStore(state => state.addTaskRelation)
	const createTaskAndRelate = useAppStore(state => state.createTaskAndRelate)
	const [relationKind, setRelationKind] = useState<TaskRelationKind>(defaultRelationKind)
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<Task[]>([])
	const [searchLoading, setSearchLoading] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

	useEffect(() => {
		setRelationKind(defaultRelationKind)
	}, [defaultRelationKind])

	useEffect(() => {
		const normalizedQuery = `${query || ''}`.trim()
		if (!normalizedQuery) {
			setResults([])
			setSelectedTaskId(null)
			setSearchLoading(false)
			return
		}

		let cancelled = false
		setSearchLoading(true)
		void api<Task[]>(buildTaskCollectionPath({
			search: normalizedQuery,
			sortBy: ['updated', 'id'],
			orderBy: ['desc', 'desc'],
		}))
			.then(foundTasks => {
				if (cancelled) {
					return
				}

				const normalized = normalizeTaskGraph(foundTasks)
				setResults(normalized.filter(task => task.id !== taskId))
			})
			.catch(() => {
				if (!cancelled) {
					setResults([])
				}
			})
			.finally(() => {
				if (!cancelled) {
					setSearchLoading(false)
				}
			})

		return () => {
			cancelled = true
		}
	}, [query, taskId])

	const selectedTask = useMemo(
		() => results.find(task => task.id === selectedTaskId) || null,
		[results, selectedTaskId],
	)

	const canCreateNew = `${query || ''}`.trim().length > 0 && !selectedTask

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (submitting) {
			return
		}

		setSubmitting(true)
		try {
			let success = false
			if (selectedTask) {
				success = await addTaskRelation(taskId, selectedTask.id, relationKind)
			} else if (canCreateNew) {
				success = await createTaskAndRelate(taskId, query, relationKind)
			}

			if (success) {
				setQuery('')
				setResults([])
				setSelectedTaskId(null)
				onDone()
			}
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<form className="subtask-composer detail-relation-composer" data-form="detail-relation" onSubmit={handleSubmit}>
			<div className="subtask-context">Add relation</div>
			<div className="detail-relation-controls">
				<label className="detail-relation-kind">
					<span className="detail-label">Relation</span>
					<select
						className="detail-select"
						value={relationKind}
						onChange={event => setRelationKind(event.currentTarget.value as TaskRelationKind)}
					>
						{TASK_RELATION_KINDS.map(kind => (
							<option key={kind} value={kind}>
								{TASK_RELATION_LABELS[kind]}
							</option>
						))}
					</select>
				</label>
				<label className="detail-relation-search">
					<span className="detail-label">Task</span>
					<input
						className="subtask-input"
						type="text"
						placeholder="Type to search tasks or create a new one"
						value={selectedTask ? selectedTask.title : query}
						onChange={event => {
							setSelectedTaskId(null)
							setQuery(event.currentTarget.value)
						}}
					/>
				</label>
					<div className="inline-composer-actions">
						<button className="composer-submit" type="submit" disabled={submitting || (!selectedTask && !canCreateNew)}>
							{submitting ? 'Saving…' : (selectedTask ? 'Add relation' : 'Create task')}
						</button>
					<button className="ghost-button" type="button" onClick={onDone}>
						Done
					</button>
				</div>
			</div>
			{searchLoading ? <div className="detail-relation-status">Searching…</div> : null}
			{selectedTask ? (
				<div className="detail-relation-selected">
					<span className="detail-relation-selected-title">{selectedTask.title}</span>
					<button
						className="ghost-button"
						type="button"
						onClick={() => {
							setSelectedTaskId(null)
							setQuery(selectedTask.title)
						}}
					>
						Clear
					</button>
				</div>
			) : null}
			{!selectedTask && results.length > 0 ? (
				<div className="detail-relation-results">
					{results.map(result => {
						const differentProject = result.project_id !== projectId
							? projects.find(project => project.id === result.project_id)?.title || null
							: null
						return (
							<button
								key={result.id}
								className="detail-relation-result"
								type="button"
								onClick={() => {
									setSelectedTaskId(result.id)
									setQuery(result.title)
								}}
							>
								<span className="detail-relation-result-title">{result.title}</span>
								{differentProject ? <span className="detail-relation-result-project">{differentProject}</span> : null}
							</button>
						)
					})}
				</div>
			) : null}
			{!selectedTask && canCreateNew ? (
				<div className="detail-relation-create-hint">
					No exact match selected. Submit to create a new task named <strong>{query.trim()}</strong>.
				</div>
			) : null}
		</form>
	)
}
