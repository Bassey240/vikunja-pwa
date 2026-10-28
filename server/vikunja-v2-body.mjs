// Translate app payloads at the API boundary, including queued mutations.
const taskFields = ['title', 'description', 'done', 'is_favorite', 'due_date', 'start_date', 'end_date', 'priority', 'percent_done', 'reminders', 'repeat_after', 'repeat_mode', 'project_id', 'hex_color', 'cover_image_attachment_id', 'bucket_id']
const viewFields = ['title', 'view_kind', 'position', 'filter', 'bucket_configuration_mode', 'bucket_configuration', 'default_bucket_id', 'done_bucket_id']
const bucketFields = ['title', 'limit', 'position', 'project_view_id']
const settingsFields = ['name', 'default_project_id', 'discoverable_by_email', 'discoverable_by_name', 'email_reminders_enabled', 'frontend_settings', 'language', 'overdue_tasks_reminders_enabled', 'overdue_tasks_reminders_time', 'timezone', 'week_start']
const filterFields = ['filter', 'filter_include_nulls', 's', 'sort_by', 'order_by']
const pick = (body, fields) => Object.fromEntries(fields.filter(key => key in body).map(key => [key, body[key]]))
const collection = body => body ? pick(body, filterFields) : {}

export function prepareRepeatBody(body) {
	// Both released v1 (including 2.3) and v2 use repeat_mode.
	if (!body || typeof body !== 'object' || !('repeat_from_current_date' in body)) return body
	const {repeat_from_current_date: fromCurrentDate, ...result} = body
	return {...result, repeat_mode: fromCurrentDate ? 2 : result.repeat_mode === 1 ? 1 : 0}
}

function task(body) {
	const result = pick(prepareRepeatBody(body), taskFields)
	// These are Go value fields. Null clears them; v2 JSON validation requires
	// their zero value rather than JSON null (also used inside bulk updates).
	for (const key of ['due_date', 'start_date', 'end_date']) {
		if (result[key] === null) result[key] = '0001-01-01T00:00:00Z'
	}
	if (result.repeat_after === null) result.repeat_after = 0
	if (Array.isArray(result.reminders)) result.reminders = result.reminders.map(reminder => pick(reminder, ['reminder', 'relative_to', 'relative_period']))
	return result
}

export function prepareV2Body(route, body) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return body
	if (route === 'user/settings/general') return pick(body, settingsFields)
	if (/^tasks\/\d+$|^projects\/\d+\/tasks$/.test(route)) return task(body)
	if (/^projects\/\d+\/tasks\/bulk$/.test(route)) return {tasks: body.tasks.map(task)}
	if (route === 'tasks/bulk') {
		return {...body, values: task(body.values), fields: body.fields.map(field => field === 'repeat_from_current_date' ? 'repeat_mode' : field)}
	}
	if (/^projects\/\d+\/duplicate$|^projects\/\d+\/views\/\d+\/buckets\/\d+\/tasks$/.test(route)) {
		const {project_id: _projectId, ...rest} = body
		return rest
	}
	if (/^filters(?:\/\d+)?$/.test(route)) return {...body, filters: collection(body.filters)}
	if (/^projects\/\d+\/views(?:\/\d+)?$/.test(route)) {
		const result = pick(body, viewFields)
		if ('filter' in result) result.filter = collection(result.filter)
		if (Array.isArray(result.bucket_configuration)) {
			result.bucket_configuration = result.bucket_configuration.map(bucket => ({title: bucket.title, filter: collection(bucket.filter)}))
		}
		return result
	}
	if (/^projects\/\d+\/views\/\d+\/buckets(?:\/\d+)?$/.test(route)) return pick(body, bucketFields)
	return body
}

/* PUT replaces every writable column upstream, so an edit merges onto the
 * entry it read back rather than blanking whatever the caller left out. */
export function buildTimeEntryPayload(body, existing = null) {
	const source = body && typeof body === 'object' ? body : {}
	const pick = (snakeKey, camelKey) => {
		if (snakeKey in source) {
			return source[snakeKey]
		}

		if (camelKey in source) {
			return source[camelKey]
		}

		return existing ? existing[snakeKey] : undefined
	}

	const taskId = Number(pick('task_id', 'taskId') || 0)
	const projectId = Number(pick('project_id', 'projectId') || 0)
	if ((taskId > 0) === (projectId > 0)) {
		const error = new Error('A time entry needs exactly one of taskId or projectId.')
		error.statusCode = 400
		throw error
	}

	const startTime = `${pick('start_time', 'startTime') || ''}`.trim()
	const endTime = `${pick('end_time', 'endTime') || ''}`.trim()

	return {
		task_id: taskId,
		project_id: projectId,
		...(startTime ? {start_time: startTime} : {}),
		// A null end_time is what marks the entry as the running timer.
		end_time: endTime || null,
		comment: `${source.comment ?? existing?.comment ?? ''}`.trim(),
	}
}
