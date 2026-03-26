import {type FormEvent, useEffect, useState} from 'react'
import type {SettingsSectionId} from '@/utils/settings-helpers'
import SettingsSection from './SettingsSection'

export default function SettingsCollaborationSection({
	open,
	onToggle,
	name,
	discoverableByName,
	discoverableByEmail,
	collaborationSettingsSubmitting,
	onSubmit,
}: {
	open: boolean
	onToggle: (section: SettingsSectionId) => void
	name: string
	discoverableByName: boolean
	discoverableByEmail: boolean
	collaborationSettingsSubmitting: boolean
	onSubmit: (payload: {
		name: string
		discoverableByName: boolean
		discoverableByEmail: boolean
	}) => Promise<boolean>
}) {
	const [form, setForm] = useState({
		name,
		discoverableByName,
		discoverableByEmail,
	})

	useEffect(() => {
		setForm({
			name,
			discoverableByName,
			discoverableByEmail,
		})
	}, [discoverableByEmail, discoverableByName, name])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		await onSubmit(form)
	}

	return (
		<SettingsSection title="Collaboration" section="collaboration" open={open} onToggle={onToggle}>
			<div className="empty-state compact">
				These settings control how other users can find you when sharing projects or adding team members.
			</div>
			<form className="detail-grid settings-form" data-form="collaboration-settings" onSubmit={handleSubmit}>
				<label className="detail-item detail-item-full detail-field">
					<div className="detail-label">Display name</div>
					<input
						className="detail-input"
						data-setting-field="display-name"
						type="text"
						value={form.name}
						disabled={collaborationSettingsSubmitting}
						onChange={event => {
							const value = event.currentTarget.value
							setForm(state => ({
								...state,
								name: value,
							}))
						}}
					/>
				</label>
				<div className="detail-item detail-item-full detail-field settings-checkbox-field">
					<div className="detail-label">Allow search by name</div>
					<label className="settings-checkbox-row">
						<input
							data-setting-field="discoverable-by-name"
							type="checkbox"
							checked={form.discoverableByName}
							disabled={collaborationSettingsSubmitting}
							onChange={event => {
								const checked = event.currentTarget.checked
								setForm(state => ({
									...state,
									discoverableByName: checked,
								}))
							}}
						/>
						<span>Other users can find you by your display name.</span>
					</label>
				</div>
				<div className="detail-item detail-item-full detail-field settings-checkbox-field">
					<div className="detail-label">Allow search by email</div>
					<label className="settings-checkbox-row">
						<input
							data-setting-field="discoverable-by-email"
							type="checkbox"
							checked={form.discoverableByEmail}
							disabled={collaborationSettingsSubmitting}
							onChange={event => {
								const checked = event.currentTarget.checked
								setForm(state => ({
									...state,
									discoverableByEmail: checked,
								}))
							}}
						/>
						<span>Other users can find you by your full email address.</span>
					</label>
				</div>
				<div className="detail-item detail-item-full detail-field">
					<button className="composer-submit" type="submit" disabled={collaborationSettingsSubmitting}>
						{collaborationSettingsSubmitting ? 'Saving…' : 'Save collaboration settings'}
					</button>
				</div>
			</form>
		</SettingsSection>
	)
}
