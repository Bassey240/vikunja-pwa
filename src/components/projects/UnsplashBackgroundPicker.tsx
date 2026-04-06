import {useAppStore} from '@/store'
import type {BackgroundImage} from '@/types'
import {useEffect, useMemo, useState} from 'react'

function getPhotographerAttribution(image: BackgroundImage) {
	const info = image.info || {}
	const user = typeof info.user === 'object' && info.user !== null ? info.user as Record<string, unknown> : null
	const userName = typeof user?.name === 'string' ? user.name.trim() : ''
	const userLink = typeof user?.links === 'object' && user.links !== null && typeof (user.links as Record<string, unknown>).html === 'string'
		? `${(user.links as Record<string, unknown>).html || ''}`.trim()
		: ''
	const unsplashLink = typeof info.links === 'object' && info.links !== null && typeof (info.links as Record<string, unknown>).html === 'string'
		? `${(info.links as Record<string, unknown>).html || ''}`.trim()
		: ''

	return {
		userName,
		userLink,
		unsplashLink,
	}
}

export default function UnsplashBackgroundPicker({
	projectId,
	onSelected,
}: {
	projectId: number
	onSelected: () => void
}) {
	const unsplashSearchResults = useAppStore(state => state.unsplashSearchResults)
	const unsplashSearchLoading = useAppStore(state => state.unsplashSearchLoading)
	const searchUnsplashBackgrounds = useAppStore(state => state.searchUnsplashBackgrounds)
	const setUnsplashProjectBackground = useAppStore(state => state.setUnsplashProjectBackground)
	const [query, setQuery] = useState('')
	const [submittingImageId, setSubmittingImageId] = useState<string | null>(null)

	useEffect(() => {
		const trimmedQuery = `${query || ''}`.trim()
		if (!trimmedQuery) {
			void searchUnsplashBackgrounds('')
			return
		}

		const timeoutId = window.setTimeout(() => {
			void searchUnsplashBackgrounds(trimmedQuery)
		}, 300)

		return () => {
			window.clearTimeout(timeoutId)
		}
	}, [query, searchUnsplashBackgrounds])

	const hasResults = unsplashSearchResults.length > 0
	const emptyState = useMemo(() => {
		if (unsplashSearchLoading) {
			return 'Searching Unsplash…'
		}
		if (`${query || ''}`.trim()) {
			return 'No matching Unsplash backgrounds found.'
		}
		return 'Search Unsplash for a project background.'
	}, [query, unsplashSearchLoading])

	async function handleSelect(image: BackgroundImage) {
		setSubmittingImageId(image.id)
		try {
			const success = await setUnsplashProjectBackground(projectId, image)
			if (success) {
				onSelected()
			}
		} finally {
			setSubmittingImageId(null)
		}
	}

	return (
		<div className="unsplash-picker">
			<label className="detail-item detail-item-full detail-field">
				<div className="detail-label">Search Unsplash</div>
				<input
					className="detail-input"
					data-unsplash-search-input="true"
					type="search"
					placeholder="Search backgrounds"
					value={query}
					onChange={event => setQuery(event.currentTarget.value)}
				/>
			</label>
			{!hasResults ? <div className="empty-state compact">{emptyState}</div> : null}
			{hasResults ? (
				<div className="unsplash-grid">
					{unsplashSearchResults.map(image => {
						const attribution = getPhotographerAttribution(image)
						return (
							<button
								key={image.id}
								className="unsplash-grid-item"
								data-unsplash-image-id={image.id}
								type="button"
								disabled={submittingImageId === image.id}
								onClick={() => void handleSelect(image)}
							>
								<img src={`/api/backgrounds/unsplash/images/${encodeURIComponent(image.id)}/thumb`} alt="" loading="lazy" />
								<div className="unsplash-grid-copy">
									<div className="detail-meta">
										{submittingImageId === image.id ? 'Applying…' : 'Use photo'}
									</div>
									{attribution.userName ? (
										<div className="detail-helper-text">
											Photo by{' '}
											{attribution.userLink ? (
												<a href={attribution.userLink} target="_blank" rel="noreferrer">
													{attribution.userName}
												</a>
											) : (
												<span>{attribution.userName}</span>
											)}
											{' '}on{' '}
											<a href={attribution.unsplashLink || 'https://unsplash.com'} target="_blank" rel="noreferrer">
												Unsplash
											</a>
										</div>
									) : null}
								</div>
							</button>
						)
					})}
				</div>
			) : null}
		</div>
	)
}
