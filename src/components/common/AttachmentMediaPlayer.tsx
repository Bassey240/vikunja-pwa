import {apiBlob} from '@/api'
import {useEffect, useRef, useState} from 'react'

export default function AttachmentMediaPlayer({path, filename, kind}: {path: string; filename: string; kind: 'audio' | 'video'}) {
	const [url, setUrl] = useState<string | null>(null)
	const [failed, setFailed] = useState(false)
	const mediaRef = useRef<HTMLMediaElement | null>(null)
	const label = kind === 'video' ? 'Video' : 'Audio'

	useEffect(() => {
		let cancelled = false
		let objectUrl: string | null = null
		setUrl(null)
		setFailed(false)
		void apiBlob(path).then(blob => {
			if (cancelled) return
			objectUrl = URL.createObjectURL(blob)
			setUrl(objectUrl)
		}).catch(() => {
			if (!cancelled) setFailed(true)
		})
		return () => {
			cancelled = true
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	}, [path])

	useEffect(() => {
		const media = mediaRef.current
		return () => {
			media?.pause()
			media?.removeAttribute('src')
			media?.load()
		}
	}, [url, kind])

	return (
		<div className="detail-attachment-media">
			{url ? kind === 'video' ? (
				<video ref={element => { mediaRef.current = element }} controls playsInline preload="metadata" src={url} aria-label={`Video: ${filename}`} onError={() => setFailed(true)} />
			) : (
				<audio ref={element => { mediaRef.current = element }} controls preload="metadata" src={url} aria-label={`Audio: ${filename}`} onError={() => setFailed(true)} />
			) : !failed ? <div className="detail-helper-text">Loading {kind}…</div> : null}
			{failed ? <div className="detail-helper-text" role="status">{label} unavailable. You can still download this file.</div> : null}
		</div>
	)
}
