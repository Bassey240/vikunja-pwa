import {tokenizeQuickAddMagic, type QuickAddTokenType} from '@/utils/quickAddMagic'
import {forwardRef, type InputHTMLAttributes, useCallback, useImperativeHandle, useRef} from 'react'

interface Segment {
	text: string
	type?: QuickAddTokenType
}

// Splits the title into plain runs interleaved with the Quick Add Magic tokens
// so the mirror can colour exactly the spans the parser will consume.
function buildSegments(text: string): Segment[] {
	const tokens = tokenizeQuickAddMagic(text)
	const segments: Segment[] = []
	let cursor = 0
	for (const token of tokens) {
		if (token.start > cursor) {
			segments.push({text: text.slice(cursor, token.start)})
		}
		segments.push({text: text.slice(token.start, token.end), type: token.type})
		cursor = token.end
	}
	if (cursor < text.length) {
		segments.push({text: text.slice(cursor)})
	}
	return segments
}

type HighlightedTaskInputProps = InputHTMLAttributes<HTMLInputElement> & {
	value: string
}

// A text input that highlights Quick Add Magic tokens inline as the user types.
// The visible field is the real <input> (transparent glyphs, visible caret); a
// mirror <div> carrying the SAME class renders identical geometry with coloured
// token spans on top. Sharing the class guarantees glyph alignment.
const HighlightedTaskInput = forwardRef<HTMLInputElement, HighlightedTaskInputProps>(
	function HighlightedTaskInput({value, className = '', onScroll, ...rest}, ref) {
		const inputRef = useRef<HTMLInputElement | null>(null)
		const mirrorRef = useRef<HTMLDivElement | null>(null)
		useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

		const syncScroll = useCallback(() => {
			if (mirrorRef.current && inputRef.current) {
				mirrorRef.current.scrollLeft = inputRef.current.scrollLeft
			}
		}, [])

		const segments = buildSegments(value ?? '')

		return (
			<div className="qam-field">
				<div className={`${className} qam-mirror`.trim()} ref={mirrorRef} aria-hidden="true">
					<span className="qam-mirror-text">
						{segments.map((segment, index) =>
							segment.type ? (
								<span key={index} className={`qam-token qam-token-${segment.type}`}>
									{segment.text}
								</span>
							) : (
								<span key={index}>{segment.text}</span>
							),
						)}
					</span>
				</div>
				<input
					{...rest}
					ref={inputRef}
					className={className}
					value={value}
					onScroll={event => {
						syncScroll()
						onScroll?.(event)
					}}
				/>
			</div>
		)
	},
)

export default HighlightedTaskInput
