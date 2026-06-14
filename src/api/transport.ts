export interface ApiError extends Error {
	statusCode?: number
	details?: unknown
}

export interface ApiOptions<TBody = unknown> {
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	body?: TBody
}

export interface UploadOptions {
	method?: 'POST' | 'PUT'
}

export interface ApiTransport {
	request<TResponse, TBody = unknown>(
		path: string,
		options?: ApiOptions<TBody>,
	): Promise<TResponse>
	upload<TResponse>(
		path: string,
		formData: FormData,
		options?: UploadOptions,
	): Promise<TResponse>
	requestBlob(path: string): Promise<Blob>
}

export function buildApiError(
	message: string,
	statusCode: number,
	details: unknown,
): ApiError {
	const error = new Error(message) as ApiError
	error.statusCode = statusCode
	error.details = details
	return error
}
