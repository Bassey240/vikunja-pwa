import {uploadApi} from '@/api'
import {useAppStore} from '@/store'
import {formatError} from '@/utils/formatting'
import {type ChangeEvent, useState} from 'react'
import {useNavigate} from 'react-router-dom'

type CsvTaskAttribute =
	| 'title'
	| 'description'
	| 'due_date'
	| 'start_date'
	| 'end_date'
	| 'done'
	| 'priority'
	| 'labels'
	| 'project'
	| 'reminder'
	| 'ignore'

interface CsvColumnMapping {
	column_index: number
	column_name: string
	attribute: CsvTaskAttribute
}

interface CsvDetectionResult {
	columns: string[]
	delimiter: string
	quote_char: string
	date_format: string
	suggested_mapping: CsvColumnMapping[]
	preview_rows: string[][]
}

interface CsvImportConfig {
	delimiter: string
	quote_char: string
	date_format: string
	skip_rows: number
	mapping: CsvColumnMapping[]
}

interface CsvPreviewTask {
	title: string
	description: string
	due_date?: string
	start_date?: string
	end_date?: string
	done: boolean
	priority: number
	labels?: string[]
	project?: string
}

interface CsvPreviewResult {
	tasks: CsvPreviewTask[]
	total_rows: number
}

const CSV_ATTRIBUTE_OPTIONS: Array<{value: CsvTaskAttribute; label: string}> = [
	{value: 'title', label: 'Title'},
	{value: 'description', label: 'Description'},
	{value: 'due_date', label: 'Due Date'},
	{value: 'start_date', label: 'Start Date'},
	{value: 'end_date', label: 'End Date'},
	{value: 'done', label: 'Done'},
	{value: 'priority', label: 'Priority'},
	{value: 'labels', label: 'Labels'},
	{value: 'project', label: 'Project'},
	{value: 'reminder', label: 'Reminder'},
	{value: 'ignore', label: 'Ignore'},
]

const CSV_DELIMITER_OPTIONS: Array<{value: string; label: string}> = [
	{value: ',', label: 'Comma (,)'},
	{value: ';', label: 'Semicolon (;)'},
	{value: '\t', label: 'Tab'},
	{value: '|', label: 'Pipe (|)'},
]

const CSV_DATE_FORMAT_OPTIONS: Array<{value: string; label: string}> = [
	{value: '2006-01-02', label: 'YYYY-MM-DD (2024-01-15)'},
	{value: '2006-01-02T15:04:05', label: 'ISO DateTime (2024-01-15T10:30:00)'},
	{value: '02/01/2006', label: 'DD/MM/YYYY (15/01/2024)'},
	{value: '01/02/2006', label: 'MM/DD/YYYY (01/15/2024)'},
	{value: '02-01-2006', label: 'DD-MM-YYYY (15-01-2024)'},
	{value: '01-02-2006', label: 'MM-DD-YYYY (01-15-2024)'},
	{value: '02.01.2006', label: 'DD.MM.YYYY (15.01.2024)'},
	{value: '2006/01/02', label: 'YYYY/MM/DD (2024/01/15)'},
	{value: '2006-01-02 15:04:05', label: 'DateTime (2024-01-15 10:30:00)'},
]

const defaultCsvConfig = (): CsvImportConfig => ({
	delimiter: ',',
	quote_char: '"',
	date_format: '2006-01-02',
	skip_rows: 0,
	mapping: [],
})

export default function CsvMigrationScreen() {
	const navigate = useNavigate()
	const connected = useAppStore(state => state.connected)
	const loadProjects = useAppStore(state => state.loadProjects)
	const [selectedFile, setSelectedFile] = useState<File | null>(null)
	const [detectionResult, setDetectionResult] = useState<CsvDetectionResult | null>(null)
	const [previewResult, setPreviewResult] = useState<CsvPreviewResult | null>(null)
	const [config, setConfig] = useState<CsvImportConfig>(defaultCsvConfig)
	const [errorMessage, setErrorMessage] = useState('')
	const [successMessage, setSuccessMessage] = useState('')
	const [analyzing, setAnalyzing] = useState(false)
	const [previewLoading, setPreviewLoading] = useState(false)
	const [importing, setImporting] = useState(false)

	const hasTitleMapping = config.mapping.some(mapping => mapping.attribute === 'title')

	function resetState() {
		setSelectedFile(null)
		setDetectionResult(null)
		setPreviewResult(null)
		setConfig(defaultCsvConfig())
		setErrorMessage('')
		setSuccessMessage('')
	}

	function buildImportFormData(file: File, nextConfig: CsvImportConfig) {
		const formData = new FormData()
		formData.append('import', file)
		formData.append('config', JSON.stringify(nextConfig))
		return formData
	}

	async function analyzeCsv(file: File) {
		setAnalyzing(true)
		setErrorMessage('')
		setSuccessMessage('')

		try {
			const formData = new FormData()
			formData.append('import', file)
			const result = await uploadApi<CsvDetectionResult>('/api/migration/csv/detect', formData, {
				method: 'PUT',
			})
			const nextConfig: CsvImportConfig = {
				delimiter: result.delimiter,
				quote_char: result.quote_char,
				date_format: result.date_format,
				skip_rows: 0,
				mapping: result.suggested_mapping,
			}

			setSelectedFile(file)
			setDetectionResult(result)
			setConfig(nextConfig)
			await refreshPreview(file, nextConfig)
		} catch (error) {
			setErrorMessage(formatError(error as Error))
			setSelectedFile(file)
			setDetectionResult(null)
			setPreviewResult(null)
			setConfig(defaultCsvConfig())
		} finally {
			setAnalyzing(false)
		}
	}

	async function refreshPreview(file = selectedFile, nextConfig = config) {
		if (!(file instanceof File)) {
			return
		}

		setPreviewLoading(true)
		setErrorMessage('')
		try {
			const result = await uploadApi<CsvPreviewResult>('/api/migration/csv/preview', buildImportFormData(file, nextConfig), {
				method: 'PUT',
			})
			setPreviewResult(result)
		} catch (error) {
			setErrorMessage(formatError(error as Error))
			setPreviewResult(null)
		} finally {
			setPreviewLoading(false)
		}
	}

	async function handleImport() {
		if (!(selectedFile instanceof File) || !hasTitleMapping) {
			return
		}

		setImporting(true)
		setErrorMessage('')
		try {
			const result = await uploadApi<{message?: string}>('/api/migration/csv/migrate', buildImportFormData(selectedFile, config), {
				method: 'PUT',
			})
			setSuccessMessage(`${result.message || 'Import started successfully.'}`.trim())
			await loadProjects({silent: true})
		} catch (error) {
			setErrorMessage(formatError(error as Error))
		} finally {
			setImporting(false)
		}
	}

	function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0] || null
		if (!(file instanceof File)) {
			resetState()
			return
		}

		void analyzeCsv(file)
	}

	function updateMapping(columnIndex: number, attribute: CsvTaskAttribute) {
		setConfig(current => ({
			...current,
			mapping: current.mapping.map(mapping => (
				mapping.column_index === columnIndex
					? {
						...mapping,
						attribute,
					}
					: mapping
			)),
		}))
	}

	if (!connected) {
		return (
			<div className="surface auth-callback-surface">
				<div className="surface-content">
					<section className="panel screen-card">
						<div className="screen-body detail-density-compact-surface">
							<div className="detail-label">CSV Import</div>
							<h2 className="panel-title">Sign in required</h2>
							<div className="status-card warning">Connect this app to Vikunja before starting a CSV import.</div>
							<button className="pill-button subtle" type="button" onClick={() => navigate('/settings?section=migration', {replace: true})}>
								Back to migration settings
							</button>
						</div>
					</section>
				</div>
			</div>
		)
	}

	return (
		<div className="surface auth-callback-surface">
			<div className="surface-content">
				<section className="panel screen-card">
					<div className="screen-body detail-density-compact-surface">
						<div className="detail-label">Migration</div>
						<h2 className="panel-title">CSV Importer</h2>
						<div className="empty-state compact">
							Upload a CSV file, review the detected columns, map each one to a Vikunja field, preview the result, and then import.
						</div>

						{errorMessage ? <div className="status-card danger">{errorMessage}</div> : null}
						{successMessage ? <div className="status-card success">{successMessage}</div> : null}

						<div className="detail-grid settings-form">
							<label className="detail-item detail-item-full detail-field">
								<div className="detail-label">CSV file</div>
								<input
									className="detail-input"
									type="file"
									accept=".csv,.txt,text/csv,text/plain"
									disabled={analyzing || previewLoading || importing}
									onChange={handleFileChange}
								/>
								<div className="detail-helper-text">
									The file must be uploaded as a normal CSV export with a header row. If there are metadata rows before the real data, set Skip Rows below.
								</div>
							</label>

							{selectedFile ? (
								<div className="detail-item detail-item-full detail-field">
									<div className="detail-label">Selected file</div>
									<div className="detail-value">{selectedFile.name}</div>
								</div>
							) : null}

							{analyzing ? (
								<div className="detail-item detail-item-full detail-field">
									<div className="empty-state compact">Analyzing CSV structure…</div>
								</div>
							) : null}

							{detectionResult ? (
								<>
									<label className="detail-item detail-field">
										<div className="detail-label">Delimiter</div>
										<select
											className="detail-input"
											value={config.delimiter}
											disabled={previewLoading || importing}
											onChange={event => setConfig(current => ({
												...current,
												delimiter: event.currentTarget.value,
											}))}
										>
											{CSV_DELIMITER_OPTIONS.map(option => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Date format</div>
										<select
											className="detail-input"
											value={config.date_format}
											disabled={previewLoading || importing}
											onChange={event => setConfig(current => ({
												...current,
												date_format: event.currentTarget.value,
											}))}
										>
											{CSV_DATE_FORMAT_OPTIONS.map(option => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</label>
									<label className="detail-item detail-field">
										<div className="detail-label">Skip rows</div>
										<input
											className="detail-input"
											type="number"
											min="0"
											value={config.skip_rows}
											disabled={previewLoading || importing}
											onChange={event => setConfig(current => ({
												...current,
												skip_rows: Math.max(0, Number(event.currentTarget.value || 0)),
											}))}
										/>
									</label>
									<div className="detail-item detail-item-full detail-field">
										<div className="settings-subsection-header">
											<div className="panel-label">Column Mapping</div>
											<button
												className="pill-button subtle"
												type="button"
												disabled={previewLoading || importing}
												onClick={() => void refreshPreview()}
											>
												{previewLoading ? 'Refreshing…' : 'Refresh preview'}
											</button>
										</div>
										<div className="settings-session-list">
											{config.mapping.map(mapping => (
												<div key={mapping.column_index} className="settings-session-row">
													<div>
														<div className="detail-value">{mapping.column_name || `Column ${mapping.column_index + 1}`}</div>
														<div className="detail-meta">
															Example: {detectionResult.preview_rows[0]?.[mapping.column_index] || 'No sample value'}
														</div>
													</div>
													<select
														className="detail-input"
														value={mapping.attribute}
														disabled={previewLoading || importing}
														onChange={event => updateMapping(mapping.column_index, event.currentTarget.value as CsvTaskAttribute)}
													>
														{CSV_ATTRIBUTE_OPTIONS.map(option => (
															<option key={option.value} value={option.value}>
																{option.label}
															</option>
														))}
													</select>
												</div>
											))}
										</div>
										{!hasTitleMapping ? (
											<div className="detail-helper-text">Map at least one column to Title before importing.</div>
										) : null}
									</div>

									<div className="detail-item detail-item-full detail-field">
										<div className="settings-subsection-header">
											<div className="panel-label">Preview</div>
											<div className="detail-meta">
												{previewResult ? `${previewResult.total_rows} row${previewResult.total_rows === 1 ? '' : 's'} ready to import` : 'No preview yet'}
											</div>
										</div>
										{previewLoading ? (
											<div className="empty-state compact">Building preview…</div>
										) : previewResult?.tasks?.length ? (
											<div className="settings-session-list">
												{previewResult.tasks.map((task, index) => (
													<div key={`${task.title}-${index}`} className="settings-session-row">
														<div>
															<div className="detail-value">{task.title || 'Untitled task'}</div>
															<div className="detail-meta">
																{[
																	task.project ? `Project: ${task.project}` : '',
																	task.due_date ? `Due: ${task.due_date}` : '',
																	Array.isArray(task.labels) && task.labels.length ? `Labels: ${task.labels.join(', ')}` : '',
																	task.done ? 'Marked done' : '',
																].filter(Boolean).join(' · ') || 'No extra mapped fields'}
															</div>
															{task.description ? <div className="detail-helper-text">{task.description}</div> : null}
														</div>
													</div>
												))}
											</div>
										) : detectionResult ? (
											<div className="empty-state compact">No preview rows matched the current configuration.</div>
										) : null}
									</div>

									<div className="detail-item detail-item-full detail-field">
										<div className="detail-inline-actions">
											<button
												className="composer-submit"
												type="button"
												disabled={importing || previewLoading || !hasTitleMapping || !(selectedFile instanceof File)}
												onClick={() => void handleImport()}
											>
												{importing ? 'Importing…' : 'Import CSV'}
											</button>
											<button
												className="pill-button subtle"
												type="button"
												disabled={analyzing || previewLoading || importing}
												onClick={resetState}
											>
												Choose another file
											</button>
											<button
												className="pill-button subtle"
												type="button"
												onClick={() => navigate('/settings?section=migration', {replace: true})}
											>
												Back to migration settings
											</button>
										</div>
									</div>
								</>
							) : null}
						</div>
					</div>
				</section>
			</div>
		</div>
	)
}
