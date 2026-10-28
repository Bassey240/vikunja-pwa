export function addDays(value: Date, days: number) {
	const next = new Date(value)
	next.setDate(next.getDate() + days)
	return next
}

export function withDefaultDueTime(value: Date, time = '12:00') {
	const next = new Date(value)
	const [hours, minutes] = time.split(':').map(Number)
	next.setHours(hours, minutes, 0, 0)
	return next
}

export function dateOnlyDueIso(dayKey: string, defaultDueTime?: string | null) {
	return defaultDueTime
		? new Date(`${dayKey}T${defaultDueTime}`).toISOString()
		: `${dayKey}T00:00:00.000Z`
}

/* YYYY-MM-DD of the LOCAL calendar day. Never toISOString().slice(0, 10):
 * that converts to UTC first, so just after local midnight it names
 * yesterday. Filter-date strings must match the user's wall clock, paired
 * with the real zone from getFilterTimezone() below. */
export function localDayIso(value: Date) {
	const month = `${value.getMonth() + 1}`.padStart(2, '0')
	const day = `${value.getDate()}`.padStart(2, '0')
	return `${value.getFullYear()}-${month}-${day}`
}

/* The IANA zone the server must resolve bare filter dates in. This has to be
 * the DEVICE zone (which localDayIso used), not the profile setting — the two
 * travel together or "today" shifts by a day. */
export function getFilterTimezone(preferred?: string | null) {
	const explicit = `${preferred || ''}`.trim()
	if (explicit) {
		return explicit
	}
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
	} catch {
		return 'UTC'
	}
}
