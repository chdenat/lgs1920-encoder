/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: config.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type EncoderConfig = {
    host: string
    port: number
    dataDirectory: string
    maxUploadBytes: number
    token: string
    allowedOrigins: string[]
    openDashboard: boolean
    windowMode: 'app' | 'browser'
}

const LOOPBACK_HOST = '127.0.0.1'

/** Parse the dashboard launch mode. */
const parseWindowMode = (value: string | undefined): 'app' | 'browser' => value === 'browser' ? 'browser' : 'app'

/** Parse a positive integer environment setting. */
const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
    const parsedValue = Number(value)

    return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

/** Create the local encoder configuration from environment variables. */
export const createConfig = (environment: NodeJS.ProcessEnv = process.env): EncoderConfig => {
    const host = environment.ENCODER_HOST ?? LOOPBACK_HOST
    if (host !== LOOPBACK_HOST) {
        throw new Error('ENCODER_HOST must remain 127.0.0.1 because the encoder is local-only')
    }

    const allowedOrigins = (environment.ENCODER_ALLOWED_ORIGINS
        ?? 'http://localhost:5173,http://127.0.0.1:5173,https://lgs1920.fr,https://www.lgs1920.fr')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)

    return {
        host,
        port: parsePositiveInteger(environment.ENCODER_PORT, 47832),
        dataDirectory: environment.ENCODER_DATA_DIR || join(tmpdir(), 'lgs1920-encoder'),
        maxUploadBytes: parsePositiveInteger(environment.ENCODER_MAX_UPLOAD_BYTES, 1024 * 1024 * 1024),
        token: environment.ENCODER_TOKEN || crypto.randomUUID(),
        allowedOrigins,
        openDashboard: environment.ENCODER_OPEN_DASHBOARD !== 'false',
        windowMode: parseWindowMode(environment.ENCODER_WINDOW_MODE),
    }
}
