interface CaretProps {
	expanded: boolean
}

// One expand/collapse caret used everywhere a row or section opens (task +
// project rows, settings + detail sections). Renders the shared .caret-icon
// CSS chevron (styles.css) — collapsed points right, expanded points down.
export default function Caret({expanded}: CaretProps) {
	return <span className="caret-icon" data-expanded={expanded ? 'true' : 'false'} aria-hidden="true" />
}
