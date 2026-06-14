import {markCollectionMutationActivity} from '@/utils/collectionPolling'
import {createGatewayClient} from '@/api/gatewayClient'
import {getPlatform} from '@/platform/registry'
import type {ApiOptions, ApiTransport, UploadOptions} from '@/api/transport'

export type {ApiError, ApiOptions, UploadOptions} from '@/api/transport'

// The registry's transport slot is null on PWA; fall back to the gateway here
// so registry.ts never imports gatewayClient (avoids a registry↔api cycle).
let cachedGateway: ApiTransport | null = null
function transport(): ApiTransport {
	return getPlatform().transport ?? (cachedGateway ??= createGatewayClient())
}

export async function api<TResponse, TBody = unknown>(
	path: string,
	options: ApiOptions<TBody> = {},
): Promise<TResponse> {
	const result = await transport().request<TResponse, TBody>(path, options)
	if ((options.method || 'GET') !== 'GET') {
		markCollectionMutationActivity()
	}
	return result
}

export async function uploadApi<TResponse>(
	path: string,
	formData: FormData,
	options: UploadOptions = {},
): Promise<TResponse> {
	const result = await transport().upload<TResponse>(path, formData, options)
	markCollectionMutationActivity()
	return result
}

export async function apiBlob(path: string): Promise<Blob> {
	return transport().requestBlob(path)
}
