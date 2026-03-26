import ProjectNode from './ProjectNode'
import type {TaskSortBy} from '@/hooks/useFilters'
import {getVisibleRootProjects, type ProjectAggregateCounts} from '@/store/project-helpers'
import {useAppStore} from '@/store'
import {type TaskMatcher} from '@/store/selectors'
import type {Project} from '@/types'

interface ProjectTreeProps {
	countsByProjectId: Map<number, ProjectAggregateCounts>
	rootProjects?: Project[]
	getChildren?: (projectId: number) => Project[]
	previewTaskMatcher?: TaskMatcher
	previewTaskSortBy?: TaskSortBy
	previewTaskBulkMode?: boolean
}

export default function ProjectTree({
	countsByProjectId,
	rootProjects,
	getChildren,
	previewTaskMatcher,
	previewTaskSortBy = 'position',
	previewTaskBulkMode = false,
}: ProjectTreeProps) {
	const projects = useAppStore(state => state.projects)
	const visibleRootProjects = rootProjects ?? getVisibleRootProjects(projects)

	return (
		<>
			{visibleRootProjects.map(project => (
				<ProjectNode
					key={project.id}
					project={project}
					depth={0}
					parentProjectId={0}
					countsByProjectId={countsByProjectId}
					getChildren={getChildren}
					previewTaskMatcher={previewTaskMatcher}
					previewTaskSortBy={previewTaskSortBy}
					previewTaskBulkMode={previewTaskBulkMode}
				/>
			))}
		</>
	)
}
