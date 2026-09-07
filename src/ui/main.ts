/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: main.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import '@awesome.me/webawesome/dist/styles/webawesome.css'
import '@awesome.me/webawesome/dist/components/badge/badge.js'
import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/card/card.js'
import '@awesome.me/webawesome/dist/components/comparison/comparison.js'
import '@awesome.me/webawesome/dist/components/callout/callout.js'
import '@awesome.me/webawesome/dist/components/divider/divider.js'
import '@awesome.me/webawesome/dist/components/dialog/dialog.js'
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js'
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js'
import '@awesome.me/webawesome/dist/components/icon/icon.js'
import '@awesome.me/webawesome/dist/components/input/input.js'
import '@awesome.me/webawesome/dist/components/option/option.js'
import '@awesome.me/webawesome/dist/components/page/page.js'
import '@awesome.me/webawesome/dist/components/progress-bar/progress-bar.js'
import '@awesome.me/webawesome/dist/components/scroller/scroller.js'
import '@awesome.me/webawesome/dist/components/select/select.js'
import '@awesome.me/webawesome/dist/components/slider/slider.js'
import './brand/wa-theme-lgs1920-base.css'
import './styles.css'

type JobStatus = 'queued' | 'encoding' | 'completed' | 'failed' | 'canceled'

type Job = {
    id: string
    status: JobStatus
    progress: number
    createdAt: string
    startedAt?: string
    completedAt?: string
    error?: string
    outputUrl?: string
    options: {
        quality: string
        hardwareAcceleration: string
        width?: number
        height?: number
        durationSeconds?: number
    }
}

type LogEntry = {
    timestamp: string
    level: string
    message: string
    jobId?: string
}

const state: {
    token: string
    jobs: Job[]
    logs: LogEntry[]
    connected: boolean
    sourceUrls: Map<string, string>
    sourceFormats: Map<string, string>
} = {
    token: '',
    jobs: [],
    logs: [],
    connected: false,
    sourceUrls: new Map(),
    sourceFormats: new Map(),
}

const THEME_STORAGE_KEY = 'theme'
const BRAND_COLOR_STORAGE_KEY = 'brandColor'
const THEME_MODES = ['system', 'light', 'dark'] as const
const BRAND_COLORS = ['yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green', 'gray'] as const

const elements = {
    connectionStatus: document.querySelector('#connection-status'),
    refreshButton: document.querySelector('#refresh-button'),
    submitButton: document.querySelector('#submit-button'),
    jobForm: document.querySelector('#job-form'),
    fileInput: document.querySelector('#file-input') as HTMLInputElement | null,
    fileName: document.querySelector('#file-name'),
    qualityInput: document.querySelector('#quality-input') as HTMLElement | null,
    accelerationInput: document.querySelector('#acceleration-input') as HTMLElement | null,
    widthInput: document.querySelector('#width-input') as HTMLInputElement | null,
    heightInput: document.querySelector('#height-input') as HTMLInputElement | null,
    formMessage: document.querySelector('#form-message'),
    currentJob: document.querySelector('#current-job'),
    jobsBody: document.querySelector('#jobs-body'),
    jobCount: document.querySelector('#job-count'),
    activeCount: document.querySelector('#active-count'),
    completedCount: document.querySelector('#completed-count'),
    failedCount: document.querySelector('#failed-count'),
    serviceAddress: document.querySelector('#service-address'),
    logOutput: document.querySelector('#log-output'),
    clearLogButton: document.querySelector('#clear-log-button'),
    newJobDialog: document.querySelector('#new-job-dialog') as (HTMLElement & {open?: boolean}) | null,
    brandColorMenu: document.querySelector('#brand-color-menu'),
    themeMenu: document.querySelector('#theme-menu'),
    comparisonDialog: document.querySelector('#comparison-dialog') as (HTMLElement & {open?: boolean}) | null,
    comparisonStatus: document.querySelector('#comparison-status'),
    comparisonBeforeLabel: document.querySelector('#comparison-before-label'),
    comparisonAfterLabel: document.querySelector('#comparison-after-label'),
    comparisonTimeSlider: document.querySelector('#comparison-time-slider') as (HTMLElement & {value?: number}) | null,
    comparisonTimeLabel: document.querySelector('#comparison-time-label'),
    beforeVideo: document.querySelector('#before-video') as HTMLVideoElement | null,
    afterVideo: document.querySelector('#after-video') as HTMLVideoElement | null,
}

let comparisonOutputUrl: string | undefined
let comparisonRequestId = 0
let comparisonDurationLimit: number | undefined
let comparisonTimeSyncing = false
let shutdownRequestSent = false

/** Read a persisted theme preference without allowing storage failures to stop the UI. */
const readPreference = (key: string, fallback: string): string => {
    try {
        return localStorage.getItem(key) ?? fallback
    }
    catch {
        return fallback
    }
}

/** Persist a local theme preference. */
const writePreference = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value)
    }
    catch {
        // The dashboard remains usable when browser storage is unavailable.
    }
}

/** Sync the active color mode icon and menu item. */
const syncThemeMenu = (theme: string): void => {
    document.querySelectorAll<HTMLElement>('[data-theme-icon]').forEach(icon => {
        icon.toggleAttribute('hidden', icon.dataset.themeIcon !== theme)
    })
    document.querySelectorAll<HTMLElement>('[data-theme-option]').forEach(option => {
        option.toggleAttribute('data-selected', option.dataset.themeOption === theme)
    })
}

/** Sync the active brand color swatch and menu item. */
const syncBrandMenu = (brand: string): void => {
    document.querySelectorAll<HTMLElement>('[data-brand-swatch]').forEach(swatch => {
        swatch.dataset.brandColor = brand
    })
    document.querySelectorAll<HTMLElement>('[data-brand-option]').forEach(option => {
        option.toggleAttribute('data-selected', option.dataset.brandOption === brand)
    })
}

/** Apply the LGS1920 theme and brand color used by the site. */
const applyTheme = (): void => {
    const root = document.documentElement
    const selectedTheme = readPreference(THEME_STORAGE_KEY, 'dark')
    const theme = THEME_MODES.includes(selectedTheme as typeof THEME_MODES[number]) ? selectedTheme : 'dark'
    const selectedBrand = readPreference(BRAND_COLOR_STORAGE_KEY, 'yellow')
    const brand = BRAND_COLORS.includes(selectedBrand as typeof BRAND_COLORS[number]) ? selectedBrand : 'yellow'
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    root.classList.remove('wa-light', 'wa-dark', ...BRAND_COLORS.map(color => `wa-brand-${color}`))
    root.classList.add('wa-theme-lgs1920', `wa-brand-${brand}`, isDark ? 'wa-dark' : 'wa-light')
    root.dataset.themeMode = isDark ? 'dark' : 'light'
    root.dataset.themeSelection = theme
    root.dataset.brandColor = brand
    syncThemeMenu(theme)
    syncBrandMenu(brand)
}

/** Fetch JSON from the local encoder API with the current process token. */
const apiJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers)
    if (state.token) {
        headers.set('Authorization', `Bearer ${state.token}`)
    }

    const response = await fetch(path, {...init, headers, cache: init.cache ?? 'no-store'})
    const body = await response.json() as T & {error?: {message?: string}}
    if (!response.ok) {
        throw new Error(body.error?.message ?? `Request failed with status ${response.status}`)
    }

    return body
}

/** Format an ISO timestamp for the local user's browser locale. */
const formatDate = (value: string): string => new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium',
}).format(new Date(value))

/** Convert a job status into a Web Awesome badge variant. */
const statusVariant = (status: JobStatus): string => {
    if (status === 'completed') {
        return 'success'
    }
    if (status === 'failed') {
        return 'danger'
    }
    if (status === 'canceled') {
        return 'neutral'
    }

    return status === 'encoding' ? 'brand' : 'warning'
}

/** Create a status badge element for a job row. */
const createStatusBadge = (job: Job): HTMLElement => {
    const badge = document.createElement('wa-badge')
    badge.setAttribute('variant', statusVariant(job.status))
    badge.textContent = job.status

    return badge
}

/** Create an icon element for a Web Awesome action button. */
const createIcon = (name: string, label: string): HTMLElement => {
    const icon = document.createElement('wa-icon')
    icon.setAttribute('name', name)
    icon.setAttribute('label', label)

    return icon
}

/** Show a short message below the new-job form. */
const showFormMessage = (message: string, isError = false): void => {
    if (!elements.formMessage) {
        return
    }

    elements.formMessage.textContent = message
    elements.formMessage.classList.toggle('error', isError)
}

/** Render the service connection badge and address. */
const renderConnection = (): void => {
    if (elements.connectionStatus) {
        elements.connectionStatus.setAttribute('variant', state.connected ? 'success' : 'danger')
        elements.connectionStatus.textContent = state.connected ? 'Connected' : 'Offline'
    }

    if (elements.serviceAddress) {
        elements.serviceAddress.textContent = state.connected ? `${location.hostname}:${location.port || 'local'}` : 'Offline'
    }
}

/** Render summary counters from the current job collection. */
const renderStats = (): void => {
    const activeCount = state.jobs.filter(job => job.status === 'queued' || job.status === 'encoding').length
    const completedCount = state.jobs.filter(job => job.status === 'completed').length
    const failedCount = state.jobs.filter(job => job.status === 'failed').length

    if (elements.activeCount) elements.activeCount.textContent = String(activeCount)
    if (elements.completedCount) elements.completedCount.textContent = String(completedCount)
    if (elements.failedCount) elements.failedCount.textContent = String(failedCount)
    if (elements.jobCount) elements.jobCount.textContent = `${state.jobs.length} ${state.jobs.length === 1 ? 'job' : 'jobs'}`
}

/** Render the currently active job card. */
const renderCurrentJob = (): void => {
    if (!elements.currentJob) {
        return
    }

    const job = state.jobs.find(candidate => candidate.status === 'encoding' || candidate.status === 'queued')
    elements.currentJob.replaceChildren()

    if (!job) {
        const emptyState = document.createElement('div')
        emptyState.className = 'empty-state wa-stack wa-gap-xs wa-align-items-center'
        emptyState.append(createIcon('circle-check', 'No active job'))
        const title = document.createElement('strong')
        title.textContent = 'No active job'
        const note = document.createElement('span')
        note.textContent = 'Start an encoding to see live progress here.'
        emptyState.append(title, note)
        elements.currentJob.append(emptyState)
        return
    }

    const title = document.createElement('span')
    title.className = 'active-job-title'
    title.textContent = `Job ${job.id}`
    const badge = createStatusBadge(job)
    const progress = document.createElement('wa-progress-bar')
    progress.className = 'job-progress'
    progress.setAttribute('value', String(Math.round(job.progress * 100)))
    progress.setAttribute('label', `Encoding progress ${Math.round(job.progress * 100)} percent`)
    progress.textContent = `${Math.round(job.progress * 100)}%`
    const detail = document.createElement('span')
    detail.className = 'field-hint'
    detail.textContent = `${job.options.quality} quality${job.options.width ? ` · ${job.options.width} wide` : ''}`
    elements.currentJob.append(title, badge, progress, detail)
}

/** Download one completed output through the authenticated local API. */
const downloadJob = async (job: Job): Promise<void> => {
    try {
        const response = await fetch(job.outputUrl ?? `/v1/jobs/${job.id}/output`, {
            headers: state.token ? {Authorization: `Bearer ${state.token}`} : undefined,
        })
        if (!response.ok) {
            throw new Error(`The output could not be downloaded (status ${response.status})`)
        }

        const outputUrl = URL.createObjectURL(await response.blob())
        const link = document.createElement('a')
        link.href = outputUrl
        link.download = `${job.id}.mp4`
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(outputUrl), 1000)
        showFormMessage(`Downloaded ${job.id}.mp4`)
    }
    catch (error) {
        showFormMessage(error instanceof Error ? error.message : 'The output could not be downloaded', true)
    }
}

/** Format a media position for the synchronized comparison timeline. */
const formatVideoTime = (seconds: number): string => {
    const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
    const minutes = Math.floor(safeSeconds / 60)
    const remainder = safeSeconds - minutes * 60

    return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`
}

/** Display a media filename extension as a readable format name. */
const formatNameFromFilename = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase() ?? ''
    if (!extension) {
        return 'Source'
    }

    return extension === 'webm' ? 'WebM' : extension.toUpperCase()
}

/** Update the comparison timeline from the two loaded videos. */
const updateComparisonDuration = (): void => {
    if (!elements.beforeVideo || !elements.afterVideo || !elements.comparisonTimeSlider) {
        return
    }

    const durations = [elements.beforeVideo.duration, elements.afterVideo.duration]
        .filter(duration => Number.isFinite(duration) && duration > 0)
    if (durations.length === 0) {
        return
    }

    const duration = Math.min(comparisonDurationLimit ?? Math.min(...durations), ...durations)
    elements.comparisonTimeSlider.setAttribute('max', String(duration))
    const currentTime = Math.min(elements.beforeVideo.currentTime, elements.afterVideo.currentTime, duration)
    elements.comparisonTimeSlider.value = currentTime
    if (elements.comparisonTimeLabel) {
        elements.comparisonTimeLabel.textContent = `${formatVideoTime(currentTime)} / ${formatVideoTime(duration)}`
    }
}

/** Move both videos to one exact playback position. */
const setComparisonTime = (time: number): void => {
    if (!elements.beforeVideo || !elements.afterVideo) {
        return
    }

    const durations = [elements.beforeVideo.duration, elements.afterVideo.duration]
        .filter(duration => Number.isFinite(duration) && duration > 0)
    const maximum = comparisonDurationLimit ?? (durations.length > 0 ? Math.min(...durations) : time)
    const nextTime = Math.max(0, Math.min(time, maximum))
    comparisonTimeSyncing = true
    elements.beforeVideo.currentTime = nextTime
    elements.afterVideo.currentTime = nextTime
    if (elements.comparisonTimeSlider) {
        elements.comparisonTimeSlider.value = nextTime
    }
    if (elements.comparisonTimeLabel) {
        elements.comparisonTimeLabel.textContent = `${formatVideoTime(nextTime)} / ${formatVideoTime(maximum)}`
    }
    comparisonTimeSyncing = false
}

/** Keep native video controls and the shared timeline synchronized. */
const bindComparisonVideoSync = (): void => {
    const beforeVideo = elements.beforeVideo
    const afterVideo = elements.afterVideo
    if (!beforeVideo || !afterVideo) {
        return
    }

    const syncTimeFrom = (source: HTMLVideoElement): void => {
        if (comparisonTimeSyncing) {
            return
        }
        setComparisonTime(source.currentTime)
    }
    const syncPlaybackFrom = (source: HTMLVideoElement): void => {
        const target = source === beforeVideo ? afterVideo : beforeVideo
        if (source.paused && !target.paused) {
            target.pause()
        }
        else if (!source.paused && target.paused) {
            target.currentTime = source.currentTime
            void target.play().catch(() => undefined)
        }
    }

    beforeVideo.addEventListener('loadedmetadata', updateComparisonDuration)
    afterVideo.addEventListener('loadedmetadata', updateComparisonDuration)
    beforeVideo.addEventListener('timeupdate', () => syncTimeFrom(beforeVideo))
    afterVideo.addEventListener('timeupdate', () => syncTimeFrom(afterVideo))
    beforeVideo.addEventListener('seeking', () => syncTimeFrom(beforeVideo))
    afterVideo.addEventListener('seeking', () => syncTimeFrom(afterVideo))
    beforeVideo.addEventListener('play', () => syncPlaybackFrom(beforeVideo))
    afterVideo.addEventListener('play', () => syncPlaybackFrom(afterVideo))
    beforeVideo.addEventListener('pause', () => syncPlaybackFrom(beforeVideo))
    afterVideo.addEventListener('pause', () => syncPlaybackFrom(afterVideo))
    elements.comparisonTimeSlider?.addEventListener('input', () => {
        const value = Number(elements.comparisonTimeSlider?.value ?? 0)
        setComparisonTime(value)
    })
}

/** Show two videos in the comparison dialog using an already downloaded output. */
const openComparison = (job: Job, outputUrl: string, durationLimit?: number): void => {
    const sourceUrl = state.sourceUrls.get(job.id)
    if (!sourceUrl || !elements.comparisonDialog || !elements.beforeVideo || !elements.afterVideo) {
        showFormMessage('The original video is no longer available for comparison', true)
        return
    }

    comparisonDurationLimit = durationLimit
    comparisonRequestId += 1
    elements.beforeVideo.pause()
    elements.afterVideo.pause()
    elements.beforeVideo.src = sourceUrl
    elements.afterVideo.src = outputUrl
    const sourceFormat = state.sourceFormats.get(job.id) ?? 'Source'
    if (elements.comparisonBeforeLabel) {
        elements.comparisonBeforeLabel.textContent = sourceFormat
    }
    if (elements.comparisonAfterLabel) {
        elements.comparisonAfterLabel.textContent = 'MP4'
    }
    elements.beforeVideo.load()
    elements.afterVideo.load()
    setComparisonTime(0)
    if (elements.comparisonStatus) {
        elements.comparisonStatus.textContent = 'Drag the divider to compare the image. The timeline controls both videos together.'
    }
    elements.comparisonDialog.open = true
}

/** Open the comparison dialog with the original and encoded videos for a job. */
const compareJob = async (job: Job): Promise<void> => {
    const sourceUrl = state.sourceUrls.get(job.id)
    if (!sourceUrl || !elements.comparisonDialog || !elements.beforeVideo || !elements.afterVideo) {
        showFormMessage('The original video is no longer available for comparison', true)
        return
    }

    const requestId = ++comparisonRequestId
    if (elements.comparisonStatus) {
        elements.comparisonStatus.textContent = 'Loading the encoded video...'
    }
    elements.comparisonDialog.open = true

    try {
        const response = await fetch(job.outputUrl ?? `/v1/jobs/${job.id}/output`, {
            headers: state.token ? {Authorization: `Bearer ${state.token}`} : undefined,
        })
        if (!response.ok) {
            throw new Error(`The encoded video could not be loaded (status ${response.status})`)
        }

        const outputUrl = URL.createObjectURL(await response.blob())
        if (requestId !== comparisonRequestId) {
            URL.revokeObjectURL(outputUrl)
            return
        }

        if (comparisonOutputUrl) {
            URL.revokeObjectURL(comparisonOutputUrl)
        }
        comparisonOutputUrl = outputUrl
        openComparison(job, outputUrl)
    }
    catch (error) {
        if (requestId !== comparisonRequestId) {
            return
        }

        if (elements.comparisonStatus) {
            elements.comparisonStatus.textContent = error instanceof Error
                ? error.message
                : 'The encoded video could not be loaded'
        }
    }
}

/** Create a comparison button for a completed job with a locally available source. */
const createComparisonButton = (job: Job): HTMLElement => {
    const button = document.createElement('wa-button')
    button.setAttribute('variant', 'neutral')
    button.setAttribute('appearance', 'outlined')
    button.setAttribute('type', 'button')
    button.setAttribute('aria-label', `Compare videos for job ${job.id}`)
    button.addEventListener('click', () => {
        void compareJob(job)
    })
    button.append(createIcon('eye', 'Compare'))
    button.append(document.createTextNode('Compare'))

    return button
}

/** Create a download button for a completed job. */
const createDownloadButton = (job: Job): HTMLElement => {
    const button = document.createElement('wa-button')
    button.setAttribute('variant', 'brand')
    button.setAttribute('appearance', 'outlined')
    button.setAttribute('type', 'button')
    button.addEventListener('click', () => {
        void downloadJob(job)
    })
    button.append(createIcon('download', 'Download'))

    return button
}

/** Create a cancel button for a queued or encoding job. */
const createCancelButton = (job: Job): HTMLElement => {
    const button = document.createElement('wa-button')
    button.setAttribute('variant', 'danger')
    button.setAttribute('appearance', 'plain')
    button.setAttribute('label', `Cancel job ${job.id}`)
    button.append(createIcon('xmark', 'Cancel'))
    button.addEventListener('click', () => {
        void cancelJob(job.id)
    })

    return button
}

/** Render the complete job table with safe text nodes. */
const renderJobs = (): void => {
    const jobsBody = elements.jobsBody
    if (!jobsBody) {
        return
    }

    jobsBody.replaceChildren()
    if (state.jobs.length === 0) {
        const row = document.createElement('tr')
        const cell = document.createElement('td')
        cell.className = 'table-empty'
        cell.colSpan = 5
        cell.textContent = 'No jobs yet'
        row.append(cell)
        jobsBody.append(row)
        return
    }

    state.jobs.forEach(job => {
        const row = document.createElement('tr')
        const idCell = document.createElement('td')
        idCell.className = 'job-id'
        idCell.textContent = job.id
        const statusCell = document.createElement('td')
        statusCell.append(createStatusBadge(job))
        const progressCell = document.createElement('td')
        progressCell.className = 'job-progress-cell'
        const progress = document.createElement('wa-progress-bar')
        progress.className = 'job-progress'
        progress.setAttribute('value', String(Math.round(job.progress * 100)))
        progress.setAttribute('label', `Job ${job.id} progress ${Math.round(job.progress * 100)} percent`)
        progress.textContent = `${Math.round(job.progress * 100)}%`
        progressCell.append(progress)
        const dateCell = document.createElement('td')
        dateCell.textContent = formatDate(job.createdAt)
        const actionsCell = document.createElement('td')
        if (job.status === 'completed') {
            const actions = document.createElement('div')
            actions.className = 'job-actions wa-cluster wa-gap-xs'
            actions.append(createDownloadButton(job))
            if (state.sourceUrls.has(job.id)) {
                actions.append(createComparisonButton(job))
            }
            actionsCell.append(actions)
        }
        else if (job.status === 'queued' || job.status === 'encoding') {
            actionsCell.append(createCancelButton(job))
        }
        else if (job.error) {
            actionsCell.textContent = job.error
        }
        row.append(idCell, statusCell, progressCell, dateCell, actionsCell)
        jobsBody.append(row)
    })
}

/** Render the bounded local activity log. */
const renderLogs = (): void => {
    if (!elements.logOutput) {
        return
    }

    elements.logOutput.textContent = state.logs.length === 0
        ? 'No local activity yet.'
        : state.logs.map(entry => {
            const jobSuffix = entry.jobId ? ` [${entry.jobId}]` : ''
            return `${formatDate(entry.timestamp)} ${entry.level.toUpperCase()}${jobSuffix}  ${entry.message}`
        }).join('\n')
}

/** Render all dashboard areas that derive from API state. */
const render = (): void => {
    renderConnection()
    renderStats()
    renderCurrentJob()
    renderJobs()
    renderLogs()
}

/** Load jobs and logs from the local process. */
const refresh = async (): Promise<void> => {
    try {
        const [jobsResponse, logsResponse] = await Promise.all([
            apiJson<{jobs: Job[]}>('/v1/jobs'),
            apiJson<{entries: LogEntry[]}>('/v1/logs'),
        ])
        state.jobs = jobsResponse.jobs
        state.logs = logsResponse.entries
        state.connected = true
    }
    catch (error) {
        state.connected = false
        showFormMessage(error instanceof Error ? error.message : 'The local encoder is unavailable', true)
    }
    render()
}

/** Cancel one local job through the protected API. */
const cancelJob = async (id: string): Promise<void> => {
    try {
        await apiJson<Job>(`/v1/jobs/${id}`, {method: 'DELETE'})
        await refresh()
    }
    catch (error) {
        showFormMessage(error instanceof Error ? error.message : 'The job could not be canceled', true)
    }
}


/** Read the selected value emitted by a Web Awesome dropdown. */
const dropdownValue = (event: Event): string => {
    const detail = (event as CustomEvent<{item?: HTMLElement}>).detail
    return detail?.item?.getAttribute('value') ?? ''
}

/** Read a Web Awesome form control value as a string. */
const controlValue = (element: Element | null): string => String((element as Element & {value?: string})?.value ?? '')

/** Submit a local media file to the local encoder API. */
const submitJob = async (event: Event): Promise<void> => {
    event.preventDefault()
    const file = elements.fileInput?.files?.[0]
    if (!file) {
        showFormMessage('Choose a local media file first', true)
        return
    }

    const formData = new FormData()
    formData.set('file', file)
    const width = elements.widthInput?.value ? Number(elements.widthInput.value) : undefined
    const height = elements.heightInput?.value ? Number(elements.heightInput.value) : undefined
    formData.set('options', JSON.stringify({
        quality: controlValue(elements.qualityInput),
        hardwareAcceleration: controlValue(elements.accelerationInput),
        width,
        height,
    }))

    if (elements.submitButton) {
        elements.submitButton.setAttribute('loading', '')
        elements.submitButton.setAttribute('disabled', '')
    }
    showFormMessage('Uploading to the local encoder...')

    try {
        const job = await apiJson<Job>('/v1/jobs', {method: 'POST', body: formData})
        state.sourceUrls.set(job.id, URL.createObjectURL(file))
        state.sourceFormats.set(job.id, formatNameFromFilename(file.name))
        showFormMessage(`Job ${job.id} queued locally`)
        if (elements.jobForm instanceof HTMLFormElement) {
            elements.jobForm.reset()
        }
        if (elements.fileName) {
            elements.fileName.textContent = 'Choose a local video or audio file'
        }
        if (elements.newJobDialog) {
            elements.newJobDialog.open = false
        }
        await refresh()
    }
    catch (error) {
        showFormMessage(error instanceof Error ? error.message : 'The job could not be created', true)
    }
    finally {
        if (elements.submitButton) {
            elements.submitButton.removeAttribute('loading')
            elements.submitButton.removeAttribute('disabled')
        }
    }
}

/** Initialize the local session and start dashboard polling. */
const initialize = async (): Promise<void> => {
    try {
        const session = await apiJson<{token: string}>('/v1/session')
        state.token = session.token
        await refresh()
    }
    catch (error) {
        state.connected = false
        showFormMessage(error instanceof Error ? error.message : 'The local encoder is unavailable', true)
        render()
    }

    window.setInterval(() => {
        void refresh()
    }, 1000)
}

applyTheme()
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)

elements.brandColorMenu?.addEventListener('wa-select', event => {
    const brand = dropdownValue(event)
    if (BRAND_COLORS.includes(brand as typeof BRAND_COLORS[number])) {
        writePreference(BRAND_COLOR_STORAGE_KEY, brand)
        applyTheme()
    }
})
elements.themeMenu?.addEventListener('wa-select', event => {
    const theme = dropdownValue(event)
    if (THEME_MODES.includes(theme as typeof THEME_MODES[number])) {
        writePreference(THEME_STORAGE_KEY, theme)
        applyTheme()
    }
})
elements.jobForm?.addEventListener('submit', event => {
    void submitJob(event)
})
elements.refreshButton?.addEventListener('click', () => {
    void refresh()
})
elements.fileInput?.addEventListener('change', () => {
    const file = elements.fileInput?.files?.[0]
    if (elements.fileName) {
        elements.fileName.textContent = file ? `${file.name} · ${Math.ceil(file.size / 1024 / 1024)} MB` : 'Choose a local video or audio file'
    }
})
elements.clearLogButton?.addEventListener('click', () => {
    state.logs = []
    renderLogs()
})
elements.comparisonDialog?.addEventListener('wa-after-hide', () => {
    comparisonRequestId += 1
    elements.beforeVideo?.pause()
    elements.afterVideo?.pause()
    comparisonDurationLimit = undefined
    if (comparisonOutputUrl) {
        URL.revokeObjectURL(comparisonOutputUrl)
        comparisonOutputUrl = undefined
    }
})

/** Ask for confirmation before closing the application window. */
window.addEventListener('beforeunload', event => {
    event.preventDefault()
    event.returnValue = 'Close LGS1920 Encoder and stop the local service?'
})

/** Stop the local encoder after the user confirms the window close. */
window.addEventListener('pagehide', () => {
    for (const sourceUrl of state.sourceUrls.values()) {
        URL.revokeObjectURL(sourceUrl)
    }
    if (comparisonOutputUrl) {
        URL.revokeObjectURL(comparisonOutputUrl)
    }
    if (shutdownRequestSent || !state.token) {
        return
    }

    shutdownRequestSent = true
    void fetch('/v1/shutdown', {
        method: 'POST',
        headers: {Authorization: `Bearer ${state.token}`},
        keepalive: true,
    }).catch(() => undefined)
})

bindComparisonVideoSync()
void initialize()
