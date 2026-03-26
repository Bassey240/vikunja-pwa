export interface ApiError extends Error {
	statusCode?: number
	details?: unknown
}

interface ApiOptions<TBody> {
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	body?: TBody
}

export async function api<TResponse, TBody = unknown>(
	path: string,
	options: ApiOptions<TBody> = {},
): Promise<TResponse> {
	const response = await fetch(path, {
		method: options.method || 'GET',
		credentials: 'same-origin',
		headers: {
			'Content-Type': 'application/json',
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
	})

	const payload = await response.json().catch(() => ({}))
	if (!response.ok) {
		const error = new Error(
			(payload as {error?: string}).error || 'Request failed.',
		) as ApiError
		error.statusCode = response.status
		error.details = (payload as {details?: unknown}).details || null
		throw error
	}

	return payload as TResponse
}

export async function uploadApi<TResponse>(
	path: string,
	formData: FormData,
	options: {
		method?: 'POST'
	} = {},
): Promise<TResponse> {
	const response = await fetch(path, {
		method: options.method || 'POST',
		credentials: 'same-origin',
		body: formData,
	})

	const payload = await response.json().catch(() => ({}))
	if (!response.ok) {
		const error = new Error(
			(payload as {error?: string}).error || 'Request failed.',
		) as ApiError
		error.statusCode = response.status
		error.details = (payload as {details?: unknown}).details || null
		throw error
	}

	return payload as TResponse
}
