export default function MetadataRow({
	label,
	field,
	value,
}: {
	label: string
	field: 'done_at' | 'created' | 'updated'
	value: string
}) {
	return (
		<div className="detail-metadata-row">
			<div className="detail-metadata-label">{label}</div>
			<div className="detail-metadata-value" data-task-metadata={field}>
				{value}
			</div>
		</div>
	)
}
