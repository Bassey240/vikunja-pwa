import {type ReactNode} from 'react'

interface ProjectPreviewProps {
	label: string
	children: ReactNode
	parentProjectId?: number
}

export default function ProjectPreview({label, children, parentProjectId}: ProjectPreviewProps) {
	return (
		<section className="project-preview-section">
			<div className="project-preview-label">{label}</div>
			<div className="project-preview-stack" data-parent-project-id={Number(parentProjectId || 0)}>
				{children}
			</div>
		</section>
	)
}
