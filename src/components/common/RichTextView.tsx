import {api} from '@/api'
import {useAppStore} from '@/store'
import type {Task} from '@/types'
import {createElement, useEffect, useState, type ReactNode} from 'react'
import {
	getRichTextChecklistState,
	getRichTextTaskId,
	isDroppedRichTextSubtree,
	looksLikeRichTextHtml,
	resolveRichTextTag,
	sanitizeRichTextHref,
} from '@/utils/rich-text'

/* Renders the HTML Vikunja stores for descriptions and comments.
 *
 * DOMParser only builds a document — it never runs scripts or loads
 * subresources — and the tree is then rebuilt as React elements through an
 * allowlist, so nothing from the server reaches the DOM as markup. The app
 * keeps its no-dangerouslySetInnerHTML posture. */

const VOID_TAGS = new Set(['br', 'hr'])

export default function RichTextView({value, className = ''}: {value: string; className?: string}) {
	const account = useAppStore(state => state.account)
	const bases = [
		window.location.origin,
		account?.instanceFeatures?.frontendUrl,
		account?.baseUrl.replace(/\/+$/, '').replace(/\/api\/v[12]$/, ''),
	].filter((value): value is string => Boolean(value))
	const raw = `${value || ''}`.trim()
	if (!raw) {
		return null
	}

	// Plain-text fields (and every field on a server that never stored markup)
	// render as-is, preserving the author's line breaks.
	if (!looksLikeRichTextHtml(raw)) {
		return <div className={`rich-text ${className}`.trim()}>{renderText(raw, bases)}</div>
	}

	if (typeof DOMParser === 'undefined') {
		return <div className={`rich-text ${className}`.trim()}>{raw}</div>
	}

	const parsed = new DOMParser().parseFromString(raw, 'text/html')
	return <div className={`rich-text ${className}`.trim()}>{renderChildren(parsed.body, bases)}</div>
}

function renderChildren(node: Node, bases: string[], linkify = true): ReactNode[] {
	const output: ReactNode[] = []
	node.childNodes.forEach((child, index) => {
		const rendered = renderNode(child, index, bases, linkify)
		if (rendered !== null) {
			output.push(rendered)
		}
	})
	return output
}

function renderNode(node: Node, key: number, bases: string[], linkify: boolean): ReactNode {
	if (node.nodeType === 3) {
		return linkify ? renderText(node.textContent || '', bases) : node.textContent || null
	}

	if (node.nodeType !== 1) {
		return null
	}

	const element = node as Element
	const tagName = element.tagName.toLowerCase()

	if (isDroppedRichTextSubtree(tagName)) {
		return null
	}

	const tag = resolveRichTextTag(tagName)
	// Unrecognised markup keeps its text so nothing the author wrote is lost.
	if (!tag) {
		return element.textContent || null
	}

	if (VOID_TAGS.has(tag)) {
		return createElement(tag, {key})
	}

	if (tag === 'a') {
		const href = sanitizeRichTextHref(element.getAttribute('href'))
		if (!href) {
			return element.textContent || null
		}
		const taskId = linkify && element.children.length === 0 && element.textContent?.trim() === element.getAttribute('href')?.trim()
			? getRichTextTaskId(href, bases) : null
		if (taskId !== null) {
			return <TaskLink key={key} href={href} taskId={taskId} />
		}
		return createElement(
			'a',
			{key, href, target: '_blank', rel: 'noopener noreferrer', onClick: (event: React.MouseEvent) => event.stopPropagation()},
			...renderChildren(element, bases, false),
		)
	}

	if (tag === 'li') {
		const checked = getRichTextChecklistState(name => element.getAttribute(name))
		if (checked !== null) {
			return createElement(
				'li',
				{key, className: 'rich-text-check', 'data-checked': checked ? 'true' : 'false'},
				createElement('input', {type: 'checkbox', checked, readOnly: true, tabIndex: -1}),
				...renderChildren(element, bases, linkify),
			)
		}
	}

	return createElement(tag, {key}, ...renderChildren(element, bases, linkify && tag !== 'pre' && tag !== 'code'))
}

function renderText(text: string, bases: string[]): ReactNode[] {
	const output: ReactNode[] = []
	let offset = 0
	for (const match of text.matchAll(/https?:\/\/[^\s<>]+/g)) {
		const href = match[0].replace(/[.,;!?)\]}]+$/, '')
		const taskId = getRichTextTaskId(href, bases)
		if (taskId === null) continue
		output.push(text.slice(offset, match.index), <TaskLink key={match.index} href={href} taskId={taskId} />)
		offset = match.index + href.length
	}
	output.push(text.slice(offset))
	return output
}

function TaskLink({href, taskId}: {href: string; taskId: number}) {
	const [task, setTask] = useState<Task | null>(null)
	const openTaskDetail = useAppStore(state => state.openTaskDetail)
	useEffect(() => {
		let active = true
		setTask(null)
		void api<{task: Task}>(`/api/tasks/${taskId}`).then(result => {
			if (active) setTask(result.task)
		}).catch(() => { /* Missing or inaccessible tasks keep their original link. */ })
		return () => { active = false }
	}, [taskId])
	const resolved = task?.id === taskId ? task : null
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className={resolved ? `rich-text-task-link${resolved.done ? ' is-done' : ''}` : undefined}
			title={resolved?.title}
			onClick={event => {
				event.stopPropagation()
				if (!resolved || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
				event.preventDefault()
				void openTaskDetail(taskId)
			}}
		>
			{resolved ? <>
				<span className="rich-text-task-id">{resolved.identifier || `#${resolved.index || resolved.id}`}</span>
				<span className="rich-text-task-title">{resolved.title}</span>
				{resolved.done ? <span aria-label="Completed">✓</span> : null}
			</> : href}
		</a>
	)
}
