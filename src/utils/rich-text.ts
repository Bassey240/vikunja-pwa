/* Vikunja stores rich-text fields (descriptions, comments) as HTML on every
 * API version; v2 can exchange them as Markdown on request, but HTML is the
 * stored form. Rendering therefore means walking that HTML.
 *
 * This module is the pure, node-testable half: it decides what survives.
 * Anything not on the allowlist is dropped and its text kept, so unknown or
 * hostile markup degrades to plain text instead of executing. The renderer
 * builds React elements from this — the app never uses dangerouslySetInnerHTML. */

/* Tags Vikunja's editor emits, mapped to what we render them as. */
export const RICH_TEXT_TAGS: Record<string, string> = {
	p: 'p',
	br: 'br',
	hr: 'hr',
	strong: 'strong',
	b: 'strong',
	em: 'em',
	i: 'em',
	u: 'u',
	s: 's',
	del: 's',
	strike: 's',
	code: 'code',
	pre: 'pre',
	blockquote: 'blockquote',
	ul: 'ul',
	ol: 'ol',
	li: 'li',
	a: 'a',
	h1: 'h1',
	h2: 'h2',
	h3: 'h3',
	h4: 'h4',
	h5: 'h5',
	h6: 'h6',
	table: 'table',
	thead: 'thead',
	tbody: 'tbody',
	tr: 'tr',
	th: 'th',
	td: 'td',
	span: 'span',
	div: 'div',
}

/* Dropped along with their contents — text inside them is never content. */
export const RICH_TEXT_DROPPED_SUBTREES = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template'])

const SAFE_LINK_SCHEMES = ['http:', 'https:', 'mailto:']

export function resolveRichTextTag(tagName: string | null | undefined) {
	return RICH_TEXT_TAGS[`${tagName || ''}`.toLowerCase()] || null
}

export function isDroppedRichTextSubtree(tagName: string | null | undefined) {
	return RICH_TEXT_DROPPED_SUBTREES.has(`${tagName || ''}`.toLowerCase())
}

/* Only absolute http(s)/mailto links survive; javascript:, data: and friends
 * are dropped so a stored link can never execute. Relative links are kept
 * because Vikunja emits them for in-app references. */
export function sanitizeRichTextHref(href: string | null | undefined) {
	const value = `${href || ''}`.trim()
	if (!value) {
		return null
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
		const scheme = value.slice(0, value.indexOf(':') + 1).toLowerCase()
		return SAFE_LINK_SCHEMES.includes(scheme) ? value : null
	}

	// Protocol-relative URLs inherit the page scheme; treat them as external.
	if (value.startsWith('//')) {
		return `https:${value}`
	}

	return value.startsWith('#') || value.startsWith('/') || !value.includes(':') ? value : null
}

/* Checklist items are stored as list items carrying a data attribute; Vikunja
 * renders them as checkboxes. Read mode shows their state without editing. */
export function getRichTextChecklistState(getAttribute: (name: string) => string | null) {
	const raw = getAttribute('data-checked') ?? getAttribute('data-checklist') ?? null
	if (raw === null) {
		return null
	}
	return raw === 'true' || raw === ''
}

/* True when the value looks like markup rather than something a user typed
 * as literal text — used to decide whether a field needs HTML rendering. */
export function looksLikeRichTextHtml(value: string | null | undefined) {
	return /<\/?[a-z][^>]*>/i.test(`${value || ''}`)
}

/* Vikunja's task permalinks are /tasks/:id, relative to its frontend base. */
export function getRichTextTaskId(href: string, bases: string[]): number | null {
	for (const value of bases) {
		try {
			const base = new URL(`${value.replace(/\/+$/, '')}/`)
			if (!['http:', 'https:'].includes(base.protocol)) continue
			const url = new URL(href, base)
			if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}tasks/`)) continue
			const id = url.pathname.slice(`${base.pathname}tasks/`.length)
			if (/^\d+$/.test(id) && Number(id) > 0) return Number(id)
		} catch {
			// Invalid URLs remain ordinary links.
		}
	}
	return null
}
