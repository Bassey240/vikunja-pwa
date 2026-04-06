export function addDays(value: Date, days: number) {
	const next = new Date(value)
	next.setDate(next.getDate() + days)
	return next
}
