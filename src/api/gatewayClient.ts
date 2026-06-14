import {
	type ApiOptions,
	type ApiTransport,
	type UploadOptions,
	buildApiError,
} from './transport'

async function parsePayload(response: Response): Promise<unknown> {
	return response.json().catch(() => ({}))
}

function ensureOk(payload: unknown, response: Response): void {
	if (response.ok) {
		return
	}
	const message =
		(payload as {error?: string}).error || 'Request failed.'
	const details = (payload as {details?: unknown}).details ?? null
	throw buildApiError(message, response.status, details)
}

export function createGatewayClient(): ApiTransport {
	return {
		async request<TResponse, TBody>(
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
			const payload = await parsePayload(response)
			ensureOk(payload, response)
			return payload as TResponse
		},
		async upload<TResponse>(
			path: string,
			formData: FormData,
			options: UploadOptions = {},
		): Promise<TResponse> {
			const response = await fetch(path, {
				method: options.method || 'POST',
				credentials: 'same-origin',
				body: formData,
			})
			const payload = await parsePayload(response)
			ensureOk(payload, response)
			return payload as TResponse
		},
		async requestBlob(path: string): Promise<Blob> {
			const response = await fetch(path, {credentials: 'same-origin'})
			if (!response.ok) {
				throw buildApiError(
					`Blob request failed: ${response.status}`,
					response.status,
					null,
				)
			}
			return response.blob()
		},
	}
}
