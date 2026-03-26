import StatusCards from '@/components/layout/StatusCards'
import {useAppStore} from '@/store'
import {type FormEvent} from 'react'
import {useNavigate} from 'react-router-dom'

export default function AuthScreen() {
	const navigate = useNavigate()
	const serverConfig = useAppStore(state => state.serverConfig)
	const accountForm = useAppStore(state => state.accountForm)
	const settingsSubmitting = useAppStore(state => state.settingsSubmitting)
	const settingsNotice = useAppStore(state => state.settingsNotice)
	const isOnline = useAppStore(state => state.isOnline)
	const theme = useAppStore(state => state.theme)
	const setAccountField = useAppStore(state => state.setAccountField)
	const setAccountAuthMode = useAppStore(state => state.setAccountAuthMode)
	const setTheme = useAppStore(state => state.setTheme)
	const login = useAppStore(state => state.login)
	const restoreLegacyFallback = useAppStore(state => state.restoreLegacyFallback)
	const connected = useAppStore(state => state.connected)

	const showPasswordForm = accountForm.authMode === 'password'
	const hasServerFallback = Boolean(serverConfig?.legacyConfigured)
	const connectDisabled = settingsSubmitting || !isOnline

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const success = await login()
		if (success) {
			navigate('/', {replace: true})
		}
	}

	async function handleServerFallback() {
		const success = await restoreLegacyFallback()
		if (success || useAppStore.getState().connected || connected) {
			navigate('/', {replace: true})
		}
	}

	return (
		<div className="auth-shell">
			<div className="auth-layout">
				<section className="auth-hero">
					<div className="auth-brand">
						<div className="auth-logo-mark" aria-hidden="true">
							<div className="auth-logo-mark-core">V</div>
						</div>
						<div className="auth-brand-copy">
							<div className="eyebrow">Unofficial Vikunja client</div>
							<h1>A focused client for your Vikunja workspace.</h1>
							<p>
								An independent PWA that connects to Vikunja servers for projects, tasks, comments,
								attachments, and detail-heavy work across phone, tablet, and desktop.
							</p>
						</div>
					</div>
					<div className="auth-identity-slot">
						<div className="detail-label">Identity-ready shell</div>
						<div className="auth-identity-card">
							<div className="auth-identity-line auth-identity-line-wide"></div>
							<div className="auth-identity-line"></div>
							<div className="auth-identity-chip-row">
								<span className="count-chip compact">Projects</span>
								<span className="count-chip compact">Tasks</span>
								<span className="count-chip compact">Details</span>
							</div>
						</div>
					</div>
				</section>

				<section className="auth-card">
					<div className="auth-card-head">
						<div>
							<div className="detail-label">Welcome</div>
							<h2>Connect to your Vikunja server</h2>
							<p>This app is an independent client and is not affiliated with the official Vikunja project.</p>
						</div>
						<div className="settings-toggle-row">
							<button
								className={`pill-button ${theme === 'dark' ? '' : 'subtle'}`.trim()}
								type="button"
								onClick={() => setTheme('dark')}
							>
								Dark
							</button>
							<button
								className={`pill-button ${theme === 'light' ? '' : 'subtle'}`.trim()}
								type="button"
								onClick={() => setTheme('light')}
							>
								Light
							</button>
						</div>
					</div>

					<StatusCards />
					{!isOnline ? (
						<div className="status-card warning">
							You&apos;re offline. Sign-in requires a live connection. If you connected before, the installed app can reopen the last known shell in read-only mode.
						</div>
					) : null}
					{settingsNotice ? <div className="empty-state compact">{settingsNotice}</div> : null}

					{hasServerFallback ? (
						<div className="auth-fallback-card">
							<div className="detail-label">Developer Fallback</div>
							<div className="auth-fallback-copy">
								Use the server-managed fallback session from the local environment instead of entering account
								credentials.
							</div>
							<button
								className="pill-button"
								data-action="use-server-fallback"
								type="button"
								disabled={settingsSubmitting}
								onClick={() => void handleServerFallback()}
							>
								Continue with server fallback
							</button>
						</div>
					) : null}

					<div className="auth-form-card">
						<div className="detail-label">Connect Account</div>
						<div className="settings-toggle-row">
							<button
								className={`pill-button ${showPasswordForm ? '' : 'subtle'}`.trim()}
								data-action="set-account-auth-mode"
								data-auth-mode="password"
								type="button"
								onClick={() => setAccountAuthMode('password')}
							>
								Password
							</button>
							<button
								className={`pill-button ${showPasswordForm ? 'subtle' : ''}`.trim()}
								data-action="set-account-auth-mode"
								data-auth-mode="apiToken"
								type="button"
								onClick={() => setAccountAuthMode('apiToken')}
							>
								API Token
							</button>
						</div>

						<form className="detail-grid settings-form" data-form="account-login" onSubmit={handleSubmit}>
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">Server URL</div>
								<input
									className="detail-input"
									data-account-field="baseUrl"
									type="url"
									placeholder="https://vikunja.example.com"
									value={accountForm.baseUrl}
									disabled={connectDisabled}
									onChange={event => setAccountField('baseUrl', event.currentTarget.value)}
								/>
							</label>
							{showPasswordForm ? (
								<>
									<label className="detail-item detail-field">
										<div className="detail-label">Username</div>
										<input
											className="detail-input"
											data-account-field="username"
											type="text"
											value={accountForm.username}
											disabled={connectDisabled}
											onChange={event => setAccountField('username', event.currentTarget.value)}
										/>
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Password</div>
										<input
											className="detail-input"
											data-account-field="password"
											type="password"
											value={accountForm.password}
											disabled={connectDisabled}
											onChange={event => setAccountField('password', event.currentTarget.value)}
										/>
									</label>
								</>
							) : (
								<label className="detail-item detail-item-full detail-field">
									<div className="detail-label">API Token</div>
									<input
										className="detail-input"
										data-account-field="apiToken"
										type="password"
										value={accountForm.apiToken}
										disabled={connectDisabled}
										onChange={event => setAccountField('apiToken', event.currentTarget.value)}
									/>
								</label>
							)}
							<div className="detail-item detail-item-full detail-field">
								<button className="composer-submit" type="submit" disabled={connectDisabled}>
									{settingsSubmitting ? 'Connecting…' : !isOnline ? 'Offline' : 'Connect'}
								</button>
							</div>
						</form>
						<div className="empty-state compact">
							Password login is recommended for self-hosted Vikunja. API tokens are proxied through this backend
							and are never stored in browser storage.
						</div>
					</div>
				</section>
			</div>
		</div>
	)
}
