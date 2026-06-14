import Topbar from '@/components/layout/Topbar'
import {type ReactNode, useRef} from 'react'

interface DetailSheetProps {
	open: boolean
	closeAction: string
	onClose: () => void
	children: ReactNode
	mode?: 'sheet' | 'inspector'
	/* 'modal' closes on backdrop tap; 'page' only via its own topbar Back. */
	variant?: 'page' | 'modal'
	/* Page-variant topbar title. */
	title?: string
}

export default function DetailSheet({
	open,
	closeAction,
	onClose,
	children,
	mode = 'sheet',
	variant = 'modal',
	title = '',
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

	if (variant === 'page') {
		return (
			<div className="surface detail-page-surface" data-detail-page>
				<Topbar title={title} backAction={closeAction} onBack={onClose} />
				<div className="surface-content">
					{/* .detail-sheet carries the --detail-density-* props the rows read. */}
					<div className="detail-sheet">{children}</div>
				</div>
			</div>
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
