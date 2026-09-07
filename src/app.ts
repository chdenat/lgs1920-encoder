/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: app.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import type { EncoderConfig } from './config'
import { createJobManager } from './jobs'
import type { LogEntry } from './logger'
import type { UiAssets } from './ui-assets'
import type { EncodeOptions, FrameJobOptions, HardwareAcceleration, QualityName } from './types'
import { QUALITY_VALUES } from './types'
import { APP_VERSION } from './version'

const HARDWARE_VALUES: HardwareAcceleration[] = ['no-preference', 'prefer-hardware', 'prefer-software']
const TERMINAL_STATUSES = ['completed', 'failed', 'canceled']

type AppOptions = {
    config: EncoderConfig
    jobs: ReturnType<typeof createJobManager>
    logger: {list: () => LogEntry[]}
    uiAssets: UiAssets
    shutdown?: () => void
}

type ResponseSet = {
    headers: Record<string, string | number>
    status?: number | string
}

/** Create the local-only HTTP API for the encoder application. */
export const createApp = ({config, jobs, logger, uiAssets, shutdown}: AppOptions): Elysia => {
    const app = new Elysia()

    /** Serve one embedded dashboard asset with a restrictive content policy. */
    const serveUiAsset = (content: string, contentType: string): Response => new Response(content, {
        headers: {
            'cache-control': 'no-store',
            'content-security-policy': "default-src 'self'; connect-src 'self' https://ka-f.fontawesome.com; media-src 'self' blob:; script-src 'self'; style-src 'self'",
            'content-type': contentType,
        },
    })

    /** Serve the embedded dashboard document with the local content policy. */
    const serveUiDocument = (): Response => serveUiAsset(uiAssets.html, 'text/html; charset=utf-8')

    /** Serve a binary UI asset embedded in the compiled application. */
    const serveUiFile = (path: string, contentType: string): Response => new Response(Bun.file(path), {
        headers: {
            'cache-control': 'no-store',
            'content-security-policy': "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'",
            'content-type': contentType,
        },
    })

    /** Serve the bundled Swagger UI without loading assets from a CDN. */
    const serveSwaggerDocument = (): Response => {
        const nonce = crypto.randomUUID().replaceAll('-', '')
        const document = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LGS1920 Encoder API</title>
    <link rel="stylesheet" href="/assets/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="/assets/swagger-ui-bundle.js"></script>
<script nonce="${nonce}">
window.onload = () => window.ui = SwaggerUIBundle({url: '/swagger/openapi.json', dom_id: '#swagger-ui'})
</script>
</body>
</html>`

        return new Response(document, {
            headers: {
                'cache-control': 'no-store',
                'content-security-policy': `default-src 'self'; connect-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self'; img-src 'self' data:`,
                'content-type': 'text/html; charset=utf-8',
            },
        })
    }

    /** Set restrictive CORS headers for an approved Studio origin. */
    const setCorsHeaders = (request: Request, set: ResponseSet): boolean => {
        const origin = request.headers.get('origin')

        if (!origin) {
            return true
        }

        const requestOrigin = new URL(request.url).origin
        const localServiceOrigins = new Set([
            `http://${config.host}:${config.port}`,
            `http://127.0.0.1:${config.port}`,
            `http://localhost:${config.port}`,
        ])

        if (origin !== requestOrigin && !config.allowedOrigins.includes(origin) && !localServiceOrigins.has(origin)) {
            return false
        }

        set.headers['access-control-allow-origin'] = origin
        set.headers['access-control-allow-headers'] = 'Accept, Authorization, Content-Type'
        set.headers['access-control-allow-methods'] = 'GET, POST, DELETE, OPTIONS'
        set.headers.vary = 'Origin'

        return true
    }

    /** Check the bearer token issued for this local process. */
    const isAuthorized = (request: Request): boolean => request.headers.get('authorization') === `Bearer ${config.token}`

    /** Validate an API request and return a response when it must be rejected. */
    const rejectUnauthorized = (request: Request, set: ResponseSet): Response | undefined => {
        if (!setCorsHeaders(request, set)) {
            set.status = 403
            return Response.json({error: {code: 'origin_not_allowed', message: 'The request origin is not allowed'}})
        }

        if (!isAuthorized(request)) {
            set.status = 401
            return Response.json({error: {code: 'unauthorized', message: 'A local encoder session token is required'}})
        }

        return undefined
    }

    /** Validate one optional output dimension. */
    const validateDimension = (value: unknown, name: string, required = false): number | undefined => {
        if (value === undefined || value === null) {
            if (required) {
                throw new Error(`${name} is required`)
            }

            return undefined
        }

        if (!Number.isInteger(value) || Number(value) < 2 || Number(value) > 7680 || Number(value) % 2 !== 0) {
            throw new Error(`${name} must be an even integer between 2 and 7680`)
        }

        return Number(value)
    }

    /** Parse and validate an encoding options object. */
    const parseOptionsObject = (parsedOptions: Record<string, unknown>): EncodeOptions => {
        const quality = parsedOptions.quality ?? 'medium'
        const hardwareAcceleration = parsedOptions.hardwareAcceleration ?? 'no-preference'
        const width = parsedOptions.width
        const height = parsedOptions.height
        const durationSeconds = parsedOptions.durationSeconds

        if (!QUALITY_VALUES.includes(quality as QualityName)) {
            throw new Error(`quality must be one of: ${QUALITY_VALUES.join(', ')}`)
        }

        if (!HARDWARE_VALUES.includes(hardwareAcceleration as HardwareAcceleration)) {
            throw new Error(`hardwareAcceleration must be one of: ${HARDWARE_VALUES.join(', ')}`)
        }

        const validateDuration = (value: unknown): number | undefined => {
            if (value === undefined || value === null) {
                return undefined
            }

            if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 86400) {
                throw new Error('durationSeconds must be a positive number no greater than 86400')
            }

            return value
        }

        return {
            quality: quality as QualityName,
            hardwareAcceleration: hardwareAcceleration as HardwareAcceleration,
            width: validateDimension(width, 'width'),
            height: validateDimension(height, 'height'),
            durationSeconds: validateDuration(durationSeconds),
        }
    }

    /** Parse and validate the JSON options supplied with an uploaded media job. */
    const parseOptions = (rawOptions: FormDataEntryValue | null): EncodeOptions => {
        let parsedOptions: Record<string, unknown> = {}

        if (typeof rawOptions === 'string' && rawOptions.trim()) {
            const decodedOptions = JSON.parse(rawOptions)
            if (!decodedOptions || typeof decodedOptions !== 'object' || Array.isArray(decodedOptions)) {
                throw new Error('The options field must contain a JSON object')
            }
            parsedOptions = decodedOptions as Record<string, unknown>
        }

        return parseOptionsObject(parsedOptions)
    }

    /** Parse a frame-job request containing dimensions, cadence, and encoding options. */
    const parseFrameJobOptions = (payload: unknown): FrameJobOptions => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('A frame job must contain a JSON object')
        }

        const values = payload as Record<string, unknown>
        if (values.type !== 'frames') {
            throw new Error('The JSON job type must be "frames"')
        }
        const rawOptions = values.options
        if (rawOptions !== undefined && (!rawOptions || typeof rawOptions !== 'object' || Array.isArray(rawOptions))) {
            throw new Error('The options field must contain a JSON object')
        }

        const frameRate = values.frameRate
        const frameCount = values.frameCount
        if (typeof frameRate !== 'number' || !Number.isFinite(frameRate) || frameRate <= 0 || frameRate > 240) {
            throw new Error('frameRate must be a positive number no greater than 240')
        }
        if (!Number.isInteger(frameCount) || Number(frameCount) < 1 || Number(frameCount) > 100000) {
            throw new Error('frameCount must be an integer between 1 and 100000')
        }

        const options = parseOptionsObject((rawOptions ?? {}) as Record<string, unknown>)
        return {
            ...options,
            frameWidth: validateDimension(values.width, 'width', true) as number,
            frameHeight: validateDimension(values.height, 'height', true) as number,
            frameRate,
            frameCount: Number(frameCount),
        }
    }

    /** Create a server-sent event stream that follows one job until completion. */
    const createJobEventStream = (id: string): ReadableStream<Uint8Array> => {
        const encoder = new TextEncoder()
        let interval: ReturnType<typeof setInterval> | undefined

        return new ReadableStream({
            start(controller) {
                let lastPayload = ''

                /** Publish the current job state and close after a terminal state. */
                const publish = (): void => {
                    const job = jobs.getJob(id)
                    if (!job) {
                        controller.enqueue(encoder.encode('event: error\ndata: {"code":"job_not_found"}\n\n'))
                        controller.close()
                        if (interval) {
                            clearInterval(interval)
                        }
                        return
                    }

                    const payload = JSON.stringify(job)
                    if (payload !== lastPayload) {
                        controller.enqueue(encoder.encode(`event: job\ndata: ${payload}\n\n`))
                        lastPayload = payload
                    }

                    if (TERMINAL_STATUSES.includes(job.status)) {
                        controller.close()
                        if (interval) {
                            clearInterval(interval)
                        }
                    }
                }

                interval = setInterval(publish, 250)
                publish()
            },
            cancel() {
                if (interval) {
                    clearInterval(interval)
                }
            },
        })
    }

    app.onRequest(({request, set}) => {
        if (request.method === 'GET' && new URL(request.url).pathname === '/swagger') {
            return serveSwaggerDocument()
        }

        if (request.method !== 'OPTIONS') {
            return undefined
        }

        if (!setCorsHeaders(request, set)) {
            set.status = 403
            return Response.json({error: {code: 'origin_not_allowed', message: 'The request origin is not allowed'}})
        }

        set.status = 204
        return new Response(null, {status: 204})
    })

    app.use(swagger({
        provider: 'swagger-ui',
        path: '/swagger',
        specPath: '/swagger/openapi.json',
        documentation: {
            info: {
                title: 'LGS1920 Encoder API',
                description: 'Loopback-only API for local video encoding jobs',
                version: APP_VERSION,
            },
            tags: [
                {name: 'service', description: 'Local service and session information'},
                {name: 'jobs', description: 'Create, monitor, cancel, and download encoding jobs'},
                {name: 'frames', description: 'Submit ordered raw RGBA video frames for MP4 encoding'},
                {name: 'logs', description: 'Local process activity logs'},
            ],
        },
    }))

    app.get('/', () => serveUiDocument())
    app.get('/assets/main.js', () => serveUiAsset(uiAssets.js, 'text/javascript; charset=utf-8'))
    app.get('/assets/main.css', () => serveUiAsset(uiAssets.css, 'text/css; charset=utf-8'))
    app.get('/assets/swagger-ui-bundle.js', () => serveUiAsset(uiAssets.swaggerBundle, 'text/javascript; charset=utf-8'))
    app.get('/assets/swagger-ui.css', () => serveUiAsset(uiAssets.swaggerCss, 'text/css; charset=utf-8'))
    app.get('/assets/logo/lgs1920-encoder-icon.svg', () => serveUiAsset(uiAssets.logoSvg ?? '', 'image/svg+xml'))
    app.get('/assets/logo/lgs1920-studio.png', () => uiAssets.studioLogoPngPath
        ? serveUiFile(uiAssets.studioLogoPngPath, 'image/png')
        : new Response(null, {status: 404}))
    app.get('/assets/logo/lgs1920-mark.png', () => uiAssets.logoPngPath
        ? serveUiFile(uiAssets.logoPngPath, 'image/png')
        : new Response(null, {status: 404}))
    app.get('/assets/test/lgs1920-encoder-test.webm', () => uiAssets.testVideoPath
        ? serveUiFile(uiAssets.testVideoPath, 'video/webm')
        : new Response(null, {status: 404}))

    app.get('/health', ({request, set}) => {
        if (!setCorsHeaders(request, set)) {
            set.status = 403
            return {error: {code: 'origin_not_allowed', message: 'The request origin is not allowed'}}
        }

        return {
            name: 'LGS1920 Encoder',
            version: APP_VERSION,
            apiVersion: '1',
            localOnly: true,
            host: config.host,
            port: config.port,
            capabilities: {
                input: ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'],
                output: ['mp4'],
                codecs: ['avc', 'aac'],
            },
        }
    })

    app.get('/v1/health', ({request, set}) => {
        if (!setCorsHeaders(request, set)) {
            set.status = 403
            return {error: {code: 'origin_not_allowed', message: 'The request origin is not allowed'}}
        }

        return {
            name: 'LGS1920 Encoder',
            version: APP_VERSION,
            apiVersion: '1',
            localOnly: true,
            host: config.host,
            port: config.port,
            capabilities: {
                input: ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'],
                output: ['mp4'],
                codecs: ['avc', 'aac'],
            },
        }
    })

    app.get('/v1/session', ({request, set}) => {
        if (!setCorsHeaders(request, set)) {
            set.status = 403
            return {error: {code: 'origin_not_allowed', message: 'The request origin is not allowed'}}
        }

        set.headers['cache-control'] = 'no-store'

        return {
            token: config.token,
            expires: 'process',
        }
    })

    app.get('/v1/jobs', ({request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        return {jobs: jobs.listJobs()}
    })

    app.get('/v1/logs', ({request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        return {entries: logger.list()}
    })

    app.post('/v1/shutdown', ({request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        if (!shutdown) {
            set.status = 501
            return {error: {code: 'shutdown_unavailable', message: 'The running process does not expose shutdown control'}}
        }

        set.status = 202
        shutdown()
        return {accepted: true}
    })

    app.get('/v1/jobs/:id/events', ({params, request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        if (!jobs.getJob(params.id)) {
            set.status = 404
            return {error: {code: 'job_not_found', message: 'The requested job does not exist'}}
        }

        set.headers['content-type'] = 'text/event-stream'
        set.headers['cache-control'] = 'no-cache'
        set.headers.connection = 'keep-alive'
        return new Response(createJobEventStream(params.id))
    })

    app.get('/v1/jobs/:id', ({params, request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        const job = jobs.getJob(params.id)
        if (!job) {
            set.status = 404
            return {error: {code: 'job_not_found', message: 'The requested job does not exist'}}
        }

        return job
    })

    app.post('/v1/jobs', async ({request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        const contentType = request.headers.get('content-type')?.split(';', 1)[0]
        if (contentType === 'application/json') {
            try {
                const job = await jobs.createFrameJob(parseFrameJobOptions(await request.json()))
                set.status = 202
                return job
            }
            catch (error) {
                set.status = 400
                return {error: {code: 'invalid_frame_job', message: error instanceof Error ? error.message : 'Invalid frame job'}}
            }
        }

        const contentLength = Number(request.headers.get('content-length') ?? 0)
        if (contentLength > config.maxUploadBytes) {
            set.status = 413
            return {error: {code: 'upload_too_large', message: `The upload exceeds ${config.maxUploadBytes} bytes`}}
        }

        try {
            const formData = await request.formData()
            const file = formData.get('file')
            if (!(file instanceof File) || file.size === 0) {
                set.status = 400
                return {error: {code: 'file_required', message: 'A non-empty file form field is required'}}
            }

            if (file.size > config.maxUploadBytes) {
                set.status = 413
                return {error: {code: 'upload_too_large', message: `The upload exceeds ${config.maxUploadBytes} bytes`}}
            }

            const job = await jobs.createJob(file, parseOptions(formData.get('options')))
            set.status = 202
            return job
        }
        catch (error) {
            set.status = 400
            return {error: {code: 'invalid_request', message: error instanceof Error ? error.message : 'Invalid request'}}
        }
    })

    app.post('/v1/jobs/:id/frames', async ({params, request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        const frameJob = jobs.getFrameJob(params.id)
        if (!frameJob) {
            set.status = 404
            return {error: {code: 'frame_job_not_found', message: 'The requested frame job does not exist'}}
        }

        if (request.headers.get('content-type')?.split(';', 1)[0] !== 'application/octet-stream') {
            set.status = 415
            return {error: {code: 'frame_content_type_required', message: 'Frames must use application/octet-stream'}}
        }

        const index = Number(request.headers.get('x-frame-index'))
        if (!Number.isSafeInteger(index) || index < 0) {
            set.status = 400
            return {error: {code: 'frame_index_required', message: 'A non-negative X-Frame-Index header is required'}}
        }

        const contentLength = Number(request.headers.get('content-length') ?? 0)
        const expectedBytes = (frameJob.frameWidth ?? 0) * (frameJob.frameHeight ?? 0) * 4
        if (contentLength > config.maxUploadBytes || contentLength > expectedBytes) {
            set.status = 413
            return {error: {code: 'frame_too_large', message: 'The frame exceeds the configured frame size'}}
        }

        try {
            const frameData = new Uint8Array(await request.arrayBuffer())
            if (frameData.byteLength > config.maxUploadBytes || frameData.byteLength > expectedBytes) {
                set.status = 413
                return {error: {code: 'frame_too_large', message: 'The frame exceeds the configured frame size'}}
            }

            const job = await jobs.appendFrame(params.id, index, frameData)
            if (!job) {
                set.status = 404
                return {error: {code: 'frame_job_not_found', message: 'The requested frame job does not exist'}}
            }

            set.status = 202
            return job
        }
        catch (error) {
            set.status = 409
            return {error: {code: 'frame_rejected', message: error instanceof Error ? error.message : 'Frame rejected'}}
        }
    })

    app.post('/v1/jobs/:id/complete', ({params, request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        try {
            const job = jobs.completeFrameJob(params.id)
            if (!job) {
                set.status = 404
                return {error: {code: 'frame_job_not_found', message: 'The requested frame job does not exist'}}
            }

            set.status = 202
            return job
        }
        catch (error) {
            set.status = 409
            return {error: {code: 'frame_job_incomplete', message: error instanceof Error ? error.message : 'Frame job is incomplete'}}
        }
    })

    app.delete('/v1/jobs/:id', ({params, request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        const job = jobs.cancelJob(params.id)
        if (!job) {
            set.status = 404
            return {error: {code: 'job_not_found', message: 'The requested job does not exist'}}
        }

        return job
    })

    app.get('/v1/jobs/:id/output', async ({params, request, set}) => {
        const rejection = rejectUnauthorized(request, set)
        if (rejection) {
            return rejection
        }

        const job = jobs.getInternalJob(params.id)
        if (!job) {
            set.status = 404
            return {error: {code: 'job_not_found', message: 'The requested job does not exist'}}
        }

        if (job.status !== 'completed') {
            set.status = 409
            return {error: {code: 'output_not_ready', message: 'The encoding job has not completed'}}
        }

        const outputFile = Bun.file(job.outputPath)
        if (!await outputFile.exists()) {
            set.status = 410
            return {error: {code: 'output_missing', message: 'The encoded output is no longer available'}}
        }

        set.headers['content-type'] = 'video/mp4'
        set.headers['content-disposition'] = 'attachment'
        return new Response(outputFile)
    })

    return app
}
