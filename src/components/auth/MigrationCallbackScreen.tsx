import {useAppStore} from '@/store'
import type {MigrationService} from '@/types'
import {useEffect, useState} from 'react'
import {useLocation, useNavigate, useParams} from 'react-router-dom'

const SUPPORTED_SERVICES = new Set<MigrationService>(['todoist', 'trello', 'microsoft-todo'])

export default function MigrationCallbackScreen() {
	const navigate = useNavigate()
	const location = useLocation()
	const {service = ''} = useParams()
	const completeOAuthMigration = useAppStore(state => state.completeOAuthMigration)
	const migrationMessages = useAppStore(state => state.migrationMessages)
	const migrationSubmittingServices = useAppStore(state => state.migrationSubmittingServices)
	const [callbackError, setCallbackError] = useState('')

	useEffect(() => {
		const migrationService = `${service || ''}`.trim() as MigrationService
		if (!SUPPORTED_SERVICES.has(migrationService)) {
			setCallbackError('This migration callback does not match a supported OAuth import service.')
			return
		}

		const params = new URLSearchParams(location.search)
		const code = `${params.get('code') || ''}`.trim()
		if (!code) {
			setCallbackError('This migration callback does not include an OAuth code.')
			return
		}

		let cancelled = false
		void completeOAuthMigration(migrationService, code).then(success => {
			if (cancelled) {
				return
			}
			if (success) {
				navigate('/settings?section=migration', {replace: true})
			}
		})

		return () => {
			cancelled = true
		}
	}, [completeOAuthMigration, location.search, navigate, service])

	const migrationService = `${service || ''}`.trim() as MigrationService
	const running = migrationSubmittingServices.has(migrationService)
	const message = migrationMessages[migrationService] || null

	return (
		<div className="surface auth-callback-surface">
			<div className="surface-content">
				<section className="panel screen-card">
					<div className="screen-body detail-density-compact-surface">
						<div className="detail-label">Import callback</div>
						<h2 className="panel-title">Completing migration</h2>
						{callbackError ? <div className="status-card danger">{callbackError}</div> : null}
						{!callbackError && message ? <div className="empty-state compact">{message}</div> : null}
						{!callbackError && !message ? (
							<div className="empty-state compact">
								{running ? 'Starting the import on Vikunja…' : 'Finishing the import callback…'}
							</div>
						) : null}
					</div>
				</section>
			</div>
		</div>
	)
}
