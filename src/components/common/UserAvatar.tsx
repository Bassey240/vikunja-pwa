import type {TaskAssignee} from '@/types'
import {useAppStore} from '@/store'
import {getUserDisplayName, getUserInitials} from '@/utils/formatting'
import {useEffect, useState} from 'react'

export default function UserAvatar({
	user,
	size = 32,
	preferInitials = false,
}: {
	user: TaskAssignee | null | undefined
	size?: number
	preferInitials?: boolean
}) {
	const [failed, setFailed] = useState(false)
	const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)
	const avatarCacheBuster = useAppStore(state => state.avatarCacheBuster)
	const avatarProvider = useAppStore(state => state.avatarProvider)
	const currentUsername = useAppStore(state => `${state.account?.user?.username || ''}`.trim())
	const normalizedSize = Math.max(16, Math.round(size || 32))
	const userUsername = `${user?.username || ''}`.trim()
	const forceLocalInitials = Boolean(
		userUsername &&
		currentUsername &&
		userUsername === currentUsername &&
		avatarProvider === 'initials',
	)
	const avatarSrc = userUsername && !preferInitials && !forceLocalInitials
		? `/api/avatar/${encodeURIComponent(user.username)}?size=${normalizedSize}&v=${avatarCacheBuster}`
		: null
	const sharedStyle = {
		inlineSize: `${normalizedSize}px`,
		blockSize: `${normalizedSize}px`,
	}

	useEffect(() => {
		setFailed(false)
		setResolvedSrc(null)
	}, [avatarSrc])

	useEffect(() => {
		if (!avatarSrc) {
			return
		}

		let active = true
		let objectUrl: string | null = null

		void (async () => {
			try {
				const response = await fetch(avatarSrc, {
					credentials: 'same-origin',
					cache: 'no-store',
				})
				if (!response.ok) {
					throw new Error(`Avatar request failed with ${response.status}`)
				}

				const blob = await response.blob()
				if (!blob.type.startsWith('image/')) {
					throw new Error('Avatar response was not an image.')
				}

				objectUrl = URL.createObjectURL(blob)
				if (active) {
					setResolvedSrc(objectUrl)
				}
			} catch {
				if (active) {
					setFailed(true)
				}
			}
		})()

		return () => {
			active = false
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl)
			}
		}
	}, [avatarSrc])

	if (resolvedSrc && !failed) {
		return (
			<img
				key={resolvedSrc}
				src={resolvedSrc}
				alt={getUserDisplayName(user)}
				className="user-avatar"
				style={sharedStyle}
				onError={() => setFailed(true)}
			/>
		)
	}

	return (
		<span className="user-avatar user-avatar-initials" style={sharedStyle} aria-label={getUserDisplayName(user)}>
			{getUserInitials(user)}
		</span>
	)
}
