import {api, type ApiError} from '@/api'
import {useAppStore} from '@/store'
import {formatError} from '@/utils/formatting'
import {useEffect, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'

interface LinkShareAuthPayload {
	projectId: number
}

export default function LinkShareAuthScreen() {
	const navigate = useNavigate()
	const {share = ''} = useParams()
	const loadAccountStatus = useAppStore(state => state.loadAccountStatus)
	const [loading, setLoading] = useState(true)
	const [passwordRequired, setPasswordRequired] = useState(false)
	const [password, setPassword] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	const attemptedRef = useRef(false)

	useEffect(() => {
		if (!share || attemptedRef.current) {
			return
		}

		attemptedRef.current = true
		void authenticate()
	}, [share])

	async function authenticate(nextPassword = '') {
		if (!share) {
			setLoading(false)
			setErrorMessage('Invalid share link.')
			return
		}

		setLoading(true)
		setErrorMessage('')

		try {
			const payload = await api<LinkShareAuthPayload, {password: string}>(`/api/shares/${encodeURIComponent(share)}/auth`, {
				method: 'POST',
				body: {
					password: nextPassword,
				},
			})
			await loadAccountStatus()
			navigate(`/projects/${payload.projectId}`, {replace: true})
		} catch (error) {
			const code = Number((error as ApiError | undefined)?.details && typeof (error as ApiError).details === 'object'
				? ((error as ApiError).details as {code?: number}).code || 0
				: 0)
			if (code === 13001) {
				setPasswordRequired(true)
				setErrorMessage('')
				return
			}

			setPasswordRequired(code === 13002 || passwordRequired)
			setErrorMessage(code === 13002 ? 'Invalid password.' : formatError(error as Error))
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="shell">
			<div className="surface">
				<section className="panel screen-card">
					<div className="screen-body settings-layout">
						<div className="settings-card">
							<div className="screen-title">Shared Project</div>
							{loading ? <div className="empty-state">Authenticating link share…</div> : null}
							{passwordRequired ? (
								<div className="settings-card-body">
									<div className="detail-helper-text">This shared project requires a password.</div>
									<label className="settings-field">
										<div className="settings-label">Password</div>
										<input
											className="detail-input"
											type="password"
											value={password}
											onChange={event => setPassword(event.currentTarget.value)}
											onKeyDown={event => {
												if (event.key === 'Enter' && !loading) {
													event.preventDefault()
													void authenticate(password)
												}
											}}
										/>
									</label>
									<div className="settings-card-actions">
										<button
											className="pill-button"
											type="button"
											disabled={loading}
											onClick={() => void authenticate(password)}
										>
											Open shared project
										</button>
									</div>
								</div>
							) : null}
							{!loading && errorMessage ? <div className="empty-state compact">{errorMessage}</div> : null}
						</div>
					</div>
				</section>
			</div>
		</div>
	)
}
