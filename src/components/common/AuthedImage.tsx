import {getPlatform} from '@/platform/registry'
import {useEffect, useState, type ImgHTMLAttributes} from 'react'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
	src: string
}

/**
 * Renders an image whose URL needs the user's Vikunja credentials.
 *
 * The platform image loader decides how: the PWA passes the same-origin path
 * straight through (cookie auth at the gateway). A platform adapter can instead
 * fetch the bytes as a Blob, wrap them in an object URL, and hand back a revoke fn.
 */
export default function AuthedImage({src, ...rest}: Props) {
	const passthrough = getPlatform().imageLoader.mode === 'passthrough'
	const [resolvedSrc, setResolvedSrc] = useState<string | null>(
		passthrough ? src : null,
	)

	useEffect(() => {
		let cancelled = false
		let revoke: (() => void) | undefined
		void (async () => {
			try {
				const result = await getPlatform().imageLoader.load(src)
				if (cancelled) {
					result.revoke?.()
					return
				}
				revoke = result.revoke
				setResolvedSrc(result.url)
			} catch {
				if (!cancelled) {
					setResolvedSrc(null)
				}
			}
		})()
		return () => {
			cancelled = true
			revoke?.()
		}
	}, [src])

	if (!resolvedSrc) {
		return null
	}
	return <img {...rest} src={resolvedSrc} />
}
