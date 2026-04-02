import {type RefObject, useEffect, useState} from 'react'

import type {DatedEntry} from './gantt-helpers'

interface DependencyPath {
	key: string
	d: string
	kind: 'blocking' | 'precedes'
}

export default function GanttDependencyArrows({
	entries,
	gridRef,
}: {
	entries: DatedEntry[]
	gridRef: RefObject<HTMLDivElement | null>
}) {
	const [overlay, setOverlay] = useState<{width: number; height: number; paths: DependencyPath[]}>({
		width: 0,
		height: 0,
		paths: [],
	})

	useEffect(() => {
		const grid = gridRef.current
		if (!grid) {
			setOverlay({
				width: 0,
				height: 0,
				paths: [],
			})
			return
		}

		const compute = () => {
			const nextPaths: DependencyPath[] = []
			const visibleIds = new Set(entries.map(entry => entry.task.id))
			const gridRect = grid.getBoundingClientRect()
			const width = Math.max(grid.scrollWidth, Math.round(gridRect.width))
			const height = Math.max(grid.scrollHeight, Math.round(gridRect.height))

			entries.forEach(entry => {
				const sourceElement = grid.querySelector<HTMLElement>(`[data-gantt-task-id="${entry.task.id}"]`)
				if (!sourceElement) {
					return
				}

				;(['blocking', 'precedes'] as const).forEach(kind => {
					const related = Array.isArray(entry.task.related_tasks?.[kind]) ? entry.task.related_tasks?.[kind] : []
					related?.forEach(targetRef => {
						if (!targetRef?.id || !visibleIds.has(targetRef.id)) {
							return
						}

						const targetElement = grid.querySelector<HTMLElement>(`[data-gantt-task-id="${targetRef.id}"]`)
						if (!targetElement) {
							return
						}

						const sourceRect = sourceElement.getBoundingClientRect()
						const targetRect = targetElement.getBoundingClientRect()
						const startX = sourceRect.right - gridRect.left
						const startY = sourceRect.top - gridRect.top + sourceRect.height / 2
						const endX = targetRect.left - gridRect.left
						const endY = targetRect.top - gridRect.top + targetRect.height / 2
						const controlOffset = Math.max(28, Math.abs(endX - startX) / 2)

						nextPaths.push({
							key: `${entry.task.id}-${kind}-${targetRef.id}`,
							d: `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`,
							kind,
						})
					})
				})
			})

			setOverlay({
				width,
				height,
				paths: nextPaths,
			})
		}

		const rafId = window.requestAnimationFrame(compute)
		const resizeObserver = new ResizeObserver(() => {
			compute()
		})
		resizeObserver.observe(grid)
		window.addEventListener('resize', compute)

		return () => {
			window.cancelAnimationFrame(rafId)
			resizeObserver.disconnect()
			window.removeEventListener('resize', compute)
		}
	}, [entries, gridRef])

	if (!overlay.paths.length || !overlay.width || !overlay.height) {
		return null
	}

	return (
		<svg
			className="project-gantt-dependency-overlay"
			viewBox={`0 0 ${overlay.width} ${overlay.height}`}
			style={{
				width: `${overlay.width}px`,
				height: `${overlay.height}px`,
			}}
			aria-hidden="true"
		>
			<defs>
				{(['blocking', 'precedes'] as const).map(kind => (
					<marker
						key={kind}
						id={`project-gantt-arrowhead-${kind}`}
						viewBox="0 0 10 10"
						refX="8"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" className={`project-gantt-dependency-arrowhead is-${kind}`.trim()} />
					</marker>
				))}
			</defs>
			{overlay.paths.map(path => (
				<path
					key={path.key}
					d={path.d}
					className={`project-gantt-dependency-path is-${path.kind}`.trim()}
					markerEnd={`url(#project-gantt-arrowhead-${path.kind})`}
				/>
			))}
		</svg>
	)
}
