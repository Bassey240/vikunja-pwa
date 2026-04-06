import WebhookManager from '@/components/webhooks/WebhookManager'
import type {Webhook, WebhookEventOption} from '@/types'
import type {SettingsSectionId} from '@/utils/settings-helpers'
import {useEffect} from 'react'
import SettingsSection from './SettingsSection'

export default function SettingsWebhooksSection({
	open,
	onToggle,
	userWebhooks,
	userWebhooksLoaded,
	userWebhooksLoading,
	userWebhookEvents,
	userWebhookEventsLoaded,
	webhookSubmitting,
	onReload,
	onLoadUserWebhookEvents,
	onCreateUserWebhook,
	onUpdateUserWebhookEvents,
	onDeleteUserWebhook,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	userWebhooks: Webhook[]
	userWebhooksLoaded: boolean
	userWebhooksLoading: boolean
	userWebhookEvents: WebhookEventOption[]
	userWebhookEventsLoaded: boolean
	webhookSubmitting: boolean
	onReload: () => void
	onLoadUserWebhookEvents: () => void
	onCreateUserWebhook: (payload: {targetUrl: string; secret: string; events: string[]}) => Promise<boolean>
	onUpdateUserWebhookEvents: (hookId: number, events: string[]) => Promise<boolean>
	onDeleteUserWebhook: (hookId: number) => Promise<boolean>
}) {
	useEffect(() => {
		if (!open) {
			return
		}

		if (!userWebhooksLoaded && !userWebhooksLoading) {
			onReload()
		}
		if (!userWebhookEventsLoaded) {
			onLoadUserWebhookEvents()
		}
	}, [onLoadUserWebhookEvents, onReload, open, userWebhookEventsLoaded, userWebhooksLoaded, userWebhooksLoading])

	return (
		<SettingsSection
			title="Webhooks"
			section="webhooks"
			open={open}
			onToggle={onToggle}
			actions={
				<button className="pill-button subtle" type="button" onClick={onReload}>
					Reload
				</button>
			}
		>
			<div className="empty-state compact">
				Create user-directed webhooks here for reminders and overdue task events tied to your account.
			</div>
			<WebhookManager
				scopeLabel="user"
				hooks={userWebhooks}
				eventOptions={userWebhookEvents}
				loading={userWebhooksLoading}
				submitting={webhookSubmitting}
				onCreate={onCreateUserWebhook}
				onUpdateEvents={onUpdateUserWebhookEvents}
				onDelete={onDeleteUserWebhook}
			/>
		</SettingsSection>
	)
}
