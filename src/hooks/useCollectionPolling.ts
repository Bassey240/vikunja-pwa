import {getLastCollectionMutationAt} from '@/utils/collectionPolling'
import {useEffect, useRef} from 'react'

interface UseCollectionPollingOptions {
	enabled: boolean
	intervalMs: number
	mutationDebounceMs?: number
	onPoll: () => Promise<void> | void
}

export default function useCollectionPolling({
	enabled,
	intervalMs,
	mutationDebounceMs = 0,
	onPoll,
}: UseCollectionPollingOptions) {
	const onPollRef = useRef(onPoll)

	useEffect(() => {
		onPollRef.current = onPoll
	}, [onPoll])

	useEffect(() => {
		if (!enabled || intervalMs <= 0 || typeof window === 'undefined' || typeof document === 'undefined') {
			return
		}

		let cancelled = false
		let inFlight = false

		const runPoll = async () => {
			if (cancelled || inFlight || document.visibilityState !== 'visible') {
				return
			}

			if (mutationDebounceMs > 0 && Date.now() - getLastCollectionMutationAt() < mutationDebounceMs) {
				return
			}

			inFlight = true
			try {
				await onPollRef.current()
			} finally {
				inFlight = false
			}
		}

		const handleVisibilityChange = () => {
			void runPoll()
		}

		document.addEventListener('visibilitychange', handleVisibilityChange)
		const intervalId = window.setInterval(() => {
			void runPoll()
		}, intervalMs)

		return () => {
			cancelled = true
			document.removeEventListener('visibilitychange', handleVisibilityChange)
			window.clearInterval(intervalId)
		}
	}, [enabled, intervalMs, mutationDebounceMs])
}
