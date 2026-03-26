import {type ReactNode, useRef} from 'react'

interface DetailSheetProps {
	open: boolean
	closeAction: string
	onClose: () => void
	children: ReactNode
	mode?: 'sheet' | 'inspector'
}

export default function DetailSheet({
	open,
	closeAction,
	onClose,
	children,
	mode = 'sheet',
}: DetailSheetProps) {
	const backdropPressStartedRef = useRef(false)

	if (!open) {
		return null
	}

	if (mode === 'inspector') {
		return (
			<aside className="detail-sheet detail-sheet-inspector" aria-hidden="false">
				{children}
			</aside>
		)
	}

	return (
		<div
			className="sheet-backdrop detail-backdrop is-open"
			data-action={closeAction}
			onPointerDown={event => {
				backdropPressStartedRef.current = event.target === event.currentTarget
			}}
			onClick={event => {
				const shouldClose = backdropPressStartedRef.current && event.target === event.currentTarget
				backdropPressStartedRef.current = false
				if (shouldClose) {
					onClose()
				}
			}}
		>
			<aside className="detail-sheet" aria-hidden="false">
				{children}
			</aside>
		</div>
	)
}
