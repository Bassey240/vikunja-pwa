import {calculateMenuPosition} from '@/utils/menuPosition'
import type {MenuAnchor} from '@/types'
import {type ReactNode} from 'react'
import {createPortal} from 'react-dom'

interface ContextMenuProps {
	anchor: MenuAnchor
	children: ReactNode
	className?: string
	positionMode?: 'auto' | 'anchor-end'
}

export default function ContextMenu({
	anchor,
	children,
	className = '',
	positionMode = 'auto',
}: ContextMenuProps) {
	const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
	const position = calculateMenuPosition(anchor)
	const anchorEndLeft = Math.min(Math.max(188, Math.round(anchor.right)), Math.max(188, viewportWidth - 12))
	const menuClassName = ['inline-menu', 'row-menu', className].filter(Boolean).join(' ')

	return createPortal(
		<div
			className={menuClassName}
			data-menu-root="true"
			style={{
				top: `${position.top}px`,
				left: positionMode === 'anchor-end' ? `${anchorEndLeft}px` : `${position.left}px`,
				right: 'auto',
				position: 'fixed',
				transform: positionMode === 'anchor-end' ? 'translateX(-100%)' : undefined,
			}}
		>
			{children}
		</div>,
		document.body,
	)
}
