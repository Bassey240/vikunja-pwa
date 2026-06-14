import {getPlatform} from '@/platform/registry'
import {useState, type ReactNode} from 'react'

interface Props {
	path: string
	filename: string
	className?: string
	children: ReactNode
}

export default function AttachmentDownloadLink({
	path,
	filename,
	className,
	children,
}: Props) {
	const [busy, setBusy] = useState(false)
	const downloader = getPlatform().downloader

	if (downloader.mode === 'anchor') {
		return (
			<a
				className={className}
				href={path}
				download={filename}
			>
				{children}
			</a>
		)
	}

	async function onClick() {
		if (busy) return
		setBusy(true)
		try {
			await downloader.download(path, filename)
			getPlatform().haptics.success()
		} catch {
			getPlatform().haptics.error()
		} finally {
			setBusy(false)
		}
	}

	return (
		<button
			type="button"
			className={className}
			disabled={busy}
			onClick={() => {
				void onClick()
			}}
		>
			{busy ? 'Saving…' : children}
		</button>
	)
}
