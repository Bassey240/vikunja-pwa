import type {Webhook, WebhookEventOption} from '@/types'
import {type FormEvent, useEffect, useState} from 'react'

export default function WebhookManager({
	scopeLabel,
	hooks,
	eventOptions,
	loading,
	submitting,
	disabled = false,
	blockedMessage = '',
	onCreate,
	onUpdateEvents,
	onDelete,
}: {
	scopeLabel: string
	hooks: Webhook[]
	eventOptions: WebhookEventOption[]
	loading: boolean
	submitting: boolean
	disabled?: boolean
	blockedMessage?: string
	onCreate: (payload: {targetUrl: string; secret: string; events: string[]}) => Promise<boolean>
	onUpdateEvents: (hookId: number, events: string[]) => Promise<boolean>
	onDelete: (hookId: number) => Promise<boolean>
}) {
	const [targetUrl, setTargetUrl] = useState('')
	const [secret, setSecret] = useState('')
	const [createEvents, setCreateEvents] = useState<string[]>([])
	const [existingEvents, setExistingEvents] = useState<Record<number, string[]>>({})

	useEffect(() => {
		setExistingEvents(
			hooks.reduce<Record<number, string[]>>((result, hook) => {
				result[hook.id] = [...(hook.events || [])]
				return result
			}, {}),
		)
	}, [hooks])

	async function handleCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await onCreate({
			targetUrl,
			secret,
			events: createEvents,
		})
		if (success) {
			setTargetUrl('')
			setSecret('')
			setCreateEvents([])
		}
	}

	return (
		<div className="webhook-manager" data-webhook-scope={scopeLabel}>
			<div className="detail-helper-text">
				{scopeLabel} webhooks send signed POST requests from Vikunja to an external URL whenever selected events fire.
			</div>
			{blockedMessage ? <div className="detail-helper-text">{blockedMessage}</div> : null}
			<form className="detail-grid settings-form" data-form={`${scopeLabel}-webhook-create`} onSubmit={handleCreate}>
				<label className="detail-item detail-item-full detail-field">
					<div className="detail-label">Target URL</div>
					<input
						className="detail-input"
						type="url"
						data-webhook-target-url={scopeLabel}
						placeholder="https://example.com/webhooks/vikunja"
						value={targetUrl}
						disabled={submitting || disabled}
						onChange={event => setTargetUrl(event.currentTarget.value)}
					/>
				</label>
				<label className="detail-item detail-item-full detail-field">
					<div className="detail-label">Secret</div>
					<input
						className="detail-input"
						type="text"
						data-webhook-secret={scopeLabel}
						placeholder="Optional shared secret"
						value={secret}
						disabled={submitting || disabled}
						onChange={event => setSecret(event.currentTarget.value)}
					/>
				</label>
				<div className="detail-item detail-item-full detail-field">
					<div className="detail-label">Events</div>
					<EventCheckboxGrid
						prefix={`${scopeLabel}-create`}
						selectedEvents={createEvents}
						disabled={submitting || disabled}
						eventOptions={eventOptions}
						onToggle={eventName => {
							setCreateEvents(current => toggleEventName(current, eventName))
						}}
					/>
				</div>
				<div className="detail-item detail-item-full detail-field">
					<button
						className="composer-submit"
						type="submit"
						data-action="create-webhook"
						data-webhook-scope-action={scopeLabel}
						disabled={submitting || disabled || !targetUrl.trim() || createEvents.length === 0}
					>
						{submitting ? 'Saving…' : 'Create webhook'}
					</button>
				</div>
			</form>

			{loading ? <div className="empty-state compact">Loading {scopeLabel} webhooks…</div> : null}
			{!loading && hooks.length === 0 ? (
				<div className="empty-state compact">No {scopeLabel} webhooks configured yet.</div>
			) : null}

			{hooks.length > 0 ? (
				<div className="detail-assignee-list webhook-list">
					{hooks.map(hook => (
						<div key={hook.id} className="detail-item detail-field webhook-card" data-webhook-row={hook.id}>
							<div className="detail-label">Webhook #{hook.id}</div>
							<div className="detail-value webhook-target-url">{hook.target_url}</div>
							<div className="detail-meta">
								{hook.secret ? 'Secret configured' : 'No secret'}{hook.updated ? ` · Updated ${hook.updated}` : ''}
							</div>
							<div className="detail-item detail-item-full detail-field">
								<div className="detail-label">Events</div>
								<EventCheckboxGrid
									prefix={`${scopeLabel}-existing-${hook.id}`}
									selectedEvents={existingEvents[hook.id] || []}
									disabled={submitting || disabled}
									eventOptions={eventOptions}
									onToggle={eventName => {
										setExistingEvents(current => ({
											...current,
											[hook.id]: toggleEventName(current[hook.id] || [], eventName),
										}))
									}}
								/>
							</div>
							<div className="detail-inline-actions">
								<button
									className="pill-button"
									type="button"
									data-action="save-webhook-events"
									data-webhook-id={hook.id}
									disabled={submitting || disabled}
									onClick={() => void onUpdateEvents(hook.id, existingEvents[hook.id] || [])}
								>
									{submitting ? 'Saving…' : 'Save events'}
								</button>
								<button
									className="pill-button subtle"
									type="button"
									data-action="delete-webhook"
									data-webhook-id={hook.id}
									disabled={submitting || disabled}
									onClick={() => void onDelete(hook.id)}
								>
									Remove
								</button>
							</div>
						</div>
					))}
				</div>
			) : null}
		</div>
	)
}

function EventCheckboxGrid({
	prefix,
	selectedEvents,
	disabled,
	eventOptions,
	onToggle,
}: {
	prefix: string
	selectedEvents: string[]
	disabled: boolean
	eventOptions: WebhookEventOption[]
	onToggle: (eventName: string) => void
}) {
	if (eventOptions.length === 0) {
		return <div className="empty-state compact">No webhook events are available on this Vikunja instance.</div>
	}

	return (
		<div className="webhook-event-grid">
			{eventOptions.map(option => (
				<label key={option.event_name} className="detail-done-toggle webhook-event-toggle">
					<input
						className="visually-hidden"
						type="checkbox"
						checked={selectedEvents.includes(option.event_name)}
						disabled={disabled}
						data-webhook-event={`${prefix}:${option.event_name}`}
						onChange={() => onToggle(option.event_name)}
					/>
					<span className={`checkbox-button ${selectedEvents.includes(option.event_name) ? 'is-checked' : ''}`.trim()}>
						{selectedEvents.includes(option.event_name) ? '✓' : ''}
					</span>
					<span>{option.event_name}</span>
				</label>
			))}
		</div>
	)
}

function toggleEventName(currentEvents: string[], eventName: string) {
	return currentEvents.includes(eventName)
		? currentEvents.filter(entry => entry !== eventName)
		: [...currentEvents, eventName]
}
