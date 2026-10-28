/* Only setLoadError and clearLoadError may write this map; anything else desyncs the ownership check. */
const lastLoadErrors = new Map<string, string>()

type ErrorState = {error: string | null}
type ErrorSet = (partial: ErrorState) => void
type ErrorGet = () => ErrorState

/**
 * Background polls must never paint the global error banner: a transient
 * failure between two successful polls would flash and clear on its own.
 */
export function setLoadError(set: ErrorSet, key: string, message: string, silent: boolean) {
	if (silent) {
		return
	}
	lastLoadErrors.set(key, message)
	set({error: message})
}

/* Clears the banner only when this load path is the one that painted it. */
export function clearLoadError(set: ErrorSet, get: ErrorGet, key: string) {
	const owned = lastLoadErrors.get(key)
	if (!owned) {
		return
	}
	lastLoadErrors.delete(key)
	if (get().error === owned) {
		set({error: null})
	}
}

export function resetLoadErrorOwnership() {
	lastLoadErrors.clear()
}
