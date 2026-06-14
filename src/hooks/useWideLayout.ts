import {useEffect, useState} from 'react'

// Desktop browsers switch to the split layout at 960px. Touch tablets
// (iPad portrait: 768-834pt) have plenty of room for the split layout too,
// but a narrow *desktop* window shouldn't trigger it that early — so the
// lower 768px threshold is gated on a coarse (touch) pointer.
const WIDE_LAYOUT_QUERY =
	'(min-width: 960px), (min-width: 768px) and (pointer: coarse)'
// Compact-wide trims the sidebar/inspector for narrow split layouts. Applies
// to narrow desktop windows (960-1099) and to touch tablets below 1100 that
// have entered the split layout (iPad portrait + smaller landscape).
const COMPACT_WIDE_LAYOUT_QUERY =
	'(min-width: 960px) and (max-width: 1099px), (min-width: 768px) and (max-width: 1099px) and (pointer: coarse)'

function getMatches(query: string) {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return false
	}

	return window.matchMedia(query).matches
}

// Synchronous read of the wide-layout breakpoint for non-React callers (e.g. the store).
export function isWideLayout() {
	return getMatches(WIDE_LAYOUT_QUERY)
}

function useMediaQuery(query: string) {
	const [matches, setMatches] = useState(() => getMatches(query))

	useEffect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			return
		}

		const mediaQuery = window.matchMedia(query)
		const handleChange = () => setMatches(mediaQuery.matches)

		handleChange()
		if (typeof mediaQuery.addEventListener === 'function') {
			mediaQuery.addEventListener('change', handleChange)
			return () => mediaQuery.removeEventListener('change', handleChange)
		}

		mediaQuery.addListener(handleChange)
		return () => mediaQuery.removeListener(handleChange)
	}, [query])

	return matches
}

export function useCompactWideLayout() {
	return useMediaQuery(COMPACT_WIDE_LAYOUT_QUERY)
}

export default function useWideLayout() {
	return useMediaQuery(WIDE_LAYOUT_QUERY)
}
