/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: app.test.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { createApp } from '../src/app'
import { createConfig } from '../src/config'
import { createJobManager } from '../src/jobs'
import { createLogger } from '../src/logger'
import type { EncoderConfig } from '../src/config'

const temporaryDirectories: string[] = []

/** Create an isolated test configuration and job manager. */
const createTestContext = async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'lgs1920-encoder-test-'))
    temporaryDirectories.push(dataDirectory)
    const logoPath = join(dataDirectory, 'logo.png')
    await Bun.write(logoPath, 'fake-png')
    const config: EncoderConfig = {
        host: '127.0.0.1',
        port: 47832,
        dataDirectory,
        maxUploadBytes: 1024 * 1024,
        token: 'test-token',
        allowedOrigins: ['http://localhost:5173'],
        openDashboard: false,
        windowMode: 'app',
    }
    const logger = createLogger()
    const jobs = createJobManager({
        dataDirectory,
        log: logger.write,
        encode: async ({outputPath, onProgress}) => {
            onProgress(0.5)
            await Bun.write(outputPath, 'fake-mp4')
            onProgress(1)
        },
        encodeFrames: async ({outputPath, onProgress}) => {
            onProgress(0.5)
            await Bun.write(outputPath, 'fake-mp4')
            onProgress(1)
        },
    })
    return {app: createApp({
        config,
        jobs,
        logger,
        uiAssets: {
            html: '<!doctype html>',
            js: '',
            css: '',
            logoSvg: '<svg></svg>',
            logoPngPath: logoPath,
            studioLogoPngPath: logoPath,
            swaggerBundle: 'window.SwaggerUIBundle = () => undefined',
            swaggerCss: '.swagger-ui {}',
        },
    }), config}
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {recursive: true, force: true})))
})

describe('local encoder API', () => {
    it('refuses a non-loopback host configuration', () => {
        expect(() => createConfig({ENCODER_HOST: '0.0.0.0'})).toThrow('local-only')
    })

    it('reports that the service is local-only without authentication', async () => {
        const {app} = await createTestContext()
        const response = await app.handle(new Request('http://127.0.0.1/v1/health'))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.localOnly).toBe(true)
    })

    it('exposes the short health check used by standalone clients', async () => {
        const {app} = await createTestContext()
        const response = await app.handle(new Request('http://127.0.0.1/health'))

        expect(response.status).toBe(200)
        expect((await response.json()).localOnly).toBe(true)
    })

    it('serves the dashboard from the local process', async () => {
        const {app} = await createTestContext()
        const response = await app.handle(new Request('http://127.0.0.1/'))

        expect(response.status).toBe(200)
        expect(response.headers.get('content-security-policy')).toContain("connect-src 'self'")
    })

    it('serves the Swagger UI and OpenAPI document locally', async () => {
        const {app} = await createTestContext()
        const pageResponse = await app.handle(new Request('http://127.0.0.1/swagger'))
        const specResponse = await app.handle(new Request('http://127.0.0.1/swagger/openapi.json'))

        expect(pageResponse.status).toBe(200)
        expect(await pageResponse.text()).toContain('/assets/swagger-ui-bundle.js')
        expect(pageResponse.headers.get('content-security-policy')).toContain("connect-src 'self'")
        expect(specResponse.status).toBe(200)
        expect((await specResponse.json()).info.title).toBe('LGS1920 Encoder API')
    })

    it('serves the local brand assets', async () => {
        const {app} = await createTestContext()
        const svgResponse = await app.handle(new Request('http://127.0.0.1/assets/logo/lgs1920-encoder-icon.svg'))
        const studioLogoResponse = await app.handle(new Request('http://127.0.0.1/assets/logo/lgs1920-studio.png'))
        const pngResponse = await app.handle(new Request('http://127.0.0.1/assets/logo/lgs1920-mark.png'))

        expect(svgResponse.status).toBe(200)
        expect(await svgResponse.text()).toBe('<svg></svg>')
        expect(studioLogoResponse.status).toBe(200)
        expect(pngResponse.status).toBe(200)
        expect(pngResponse.headers.get('content-type')).toContain('image/png')
    })

    it('rejects protected requests without the process token', async () => {
        const {app} = await createTestContext()
        const response = await app.handle(new Request('http://127.0.0.1/v1/jobs'))

        expect(response.status).toBe(401)
    })

    it('accepts uploads from the local dashboard origin', async () => {
        const {app} = await createTestContext()
        const sessionResponse = await app.handle(new Request('http://127.0.0.1/v1/session', {
            headers: {origin: 'http://127.0.0.1:47832'},
        }))
        const {token} = await sessionResponse.json()
        const formData = new FormData()
        formData.set('file', new File(['local-media'], 'input.webm', {type: 'video/webm'}))
        const response = await app.handle(new Request('http://127.0.0.1/v1/jobs', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${token}`,
                origin: 'http://127.0.0.1:47832',
            },
            body: formData,
        }))

        expect(sessionResponse.status).toBe(200)
        expect(sessionResponse.headers.get('cache-control')).toBe('no-store')
        expect(response.status).toBe(202)
    })

    it('returns CORS headers for a local dashboard preflight', async () => {
        const {app} = await createTestContext()
        const response = await app.handle(new Request('http://127.0.0.1/v1/jobs', {
            method: 'OPTIONS',
            headers: {
                origin: 'http://localhost:47832',
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'authorization, content-type',
            },
        }))

        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:47832')
        expect(response.headers.get('access-control-allow-headers')).toContain('Authorization')
    })

    it('creates and completes an uploaded local job', async () => {
        const {app, config} = await createTestContext()
        const sessionResponse = await app.handle(new Request('http://127.0.0.1/v1/session', {
            headers: {origin: 'http://localhost:5173'},
        }))
        const {token} = await sessionResponse.json()
        const formData = new FormData()
        formData.set('file', new File(['local-media'], 'input.webm', {type: 'video/webm'}))
        formData.set('options', JSON.stringify({quality: 'low', width: 640, durationSeconds: 5}))
        const response = await app.handle(new Request('http://127.0.0.1/v1/jobs', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${token}`,
                origin: 'http://localhost:5173',
            },
            body: formData,
        }))
        const job = await response.json()

        expect(response.status).toBe(202)
        expect(job.status).toBe('queued')
        expect(job.options.durationSeconds).toBe(5)

        let finalJob
        let attempts = 0
        while (attempts < 20) {
            await Bun.sleep(5)
            const statusResponse = await app.handle(new Request(`http://${config.host}/v1/jobs/${job.id}`, {
                headers: {authorization: `Bearer ${token}`},
            }))
            finalJob = await statusResponse.json()
            if (finalJob.status === 'completed') {
                break
            }
            attempts += 1
        }

        expect(finalJob.status).toBe('completed')
        const outputResponse = await app.handle(new Request(`http://${config.host}/v1/jobs/${job.id}/output`, {
            headers: {authorization: `Bearer ${token}`},
        }))
        expect(outputResponse.status).toBe(200)
        expect(await outputResponse.text()).toBe('fake-mp4')
    })

    it('streams job state through server-sent events', async () => {
        const {app} = await createTestContext()
        const formData = new FormData()
        formData.set('file', new File(['local-media'], 'input.webm', {type: 'video/webm'}))
        const response = await app.handle(new Request('http://127.0.0.1/v1/jobs', {
            method: 'POST',
            headers: {authorization: 'Bearer test-token'},
            body: formData,
        }))
        const job = await response.json()
        const eventResponse = await app.handle(new Request(`http://127.0.0.1/v1/jobs/${job.id}/events`, {
            headers: {authorization: 'Bearer test-token'},
        }))
        const eventBody = await eventResponse.text()

        expect(eventResponse.status).toBe(200)
        expect(eventResponse.headers.get('content-type')).toContain('text/event-stream')
        expect(eventBody).toContain('event: job')
        expect(eventBody).toContain(job.id)
    })

    it('returns local job logs to the dashboard', async () => {
        const {app} = await createTestContext()
        const response = await app.handle(new Request('http://127.0.0.1/v1/logs', {
            headers: {authorization: 'Bearer test-token'},
        }))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.entries).toEqual([])
    })

    it('accepts ten ordered frames for a five-second frame job and reports progress', async () => {
        const {app} = await createTestContext()
        const frameJobResponse = await app.handle(new Request('http://127.0.0.1/v1/jobs', {
            method: 'POST',
            headers: {
                authorization: 'Bearer test-token',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                type: 'frames',
                width: 2,
                height: 2,
                frameRate: 2,
                frameCount: 10,
                options: {quality: 'low', hardwareAcceleration: 'no-preference'},
            }),
        }))
        const frameJob = await frameJobResponse.json()

        expect(frameJobResponse.status).toBe(202)
        expect(frameJob.inputKind).toBe('frames')
        expect(frameJob.phase).toBe('receiving')
        expect(frameJob.frameCount).toBe(10)

        for (let index = 0; index < 10; index += 1) {
            const frame = new Uint8Array(16).fill(index * 10)
            const response = await app.handle(new Request(`http://127.0.0.1/v1/jobs/${frameJob.id}/frames`, {
                method: 'POST',
                headers: {
                    authorization: 'Bearer test-token',
                    'content-type': 'application/octet-stream',
                    'x-frame-index': String(index),
                },
                body: frame,
            }))
            const progress = await response.json()

            expect(response.status).toBe(202)
            expect(progress.receivedFrames).toBe(index + 1)
        }

        const completeResponse = await app.handle(new Request(`http://127.0.0.1/v1/jobs/${frameJob.id}/complete`, {
            method: 'POST',
            headers: {authorization: 'Bearer test-token'},
        }))
        const queuedJob = await completeResponse.json()

        expect(completeResponse.status).toBe(202)
        expect(queuedJob.phase).toBe('queued')
        expect(queuedJob.progress).toBe(0.5)

        let finalJob
        let attempts = 0
        while (attempts < 20) {
            await Bun.sleep(5)
            const response = await app.handle(new Request(`http://127.0.0.1/v1/jobs/${frameJob.id}`, {
                headers: {authorization: 'Bearer test-token'},
            }))
            finalJob = await response.json()
            if (finalJob.phase === 'completed') {
                break
            }
            attempts += 1
        }

        expect(finalJob.phase).toBe('completed')
        expect(finalJob.receivedFrames).toBe(10)
        expect(finalJob.progress).toBe(1)

        const logsResponse = await app.handle(new Request('http://127.0.0.1/v1/logs', {
            headers: {authorization: 'Bearer test-token'},
        }))
        const logs = await logsResponse.json()

        expect(logs.entries.some((entry: {message: string}) => entry.message === 'Frame 10/10 received')).toBe(true)
    })
})
