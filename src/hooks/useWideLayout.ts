import {useEffect, useState} from 'react'

const WIDE_LAYOUT_QUERY = '(min-width: 960px)'
const COMPACT_WIDE_LAYOUT_QUERY = '(min-width: 960px) and (max-width: 1099px)'

function getMatches(query: string) {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return false
	}

	return window.matchMedia(query).matches
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
