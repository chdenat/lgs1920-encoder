/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: types.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

export const QUALITY_VALUES = ['low', 'medium', 'high', 'very-high'] as const

export type QualityName = typeof QUALITY_VALUES[number]

export type HardwareAcceleration = 'no-preference' | 'prefer-hardware' | 'prefer-software'

export type EncodeOptions = {
    width?: number
    height?: number
    durationSeconds?: number
    quality: QualityName
    hardwareAcceleration: HardwareAcceleration
}

export type FrameJobOptions = EncodeOptions & {
    frameWidth: number
    frameHeight: number
    frameRate: number
    frameCount: number
}

export type JobStatus = 'queued' | 'encoding' | 'completed' | 'failed' | 'canceled'

export type JobInputKind = 'file' | 'frames'

export type JobPhase = 'receiving' | 'queued' | 'encoding' | 'completed' | 'failed' | 'canceled'

export type PublicJob = {
    id: string
    inputKind: JobInputKind
    phase: JobPhase
    status: JobStatus
    progress: number
    createdAt: string
    options: EncodeOptions
    frameWidth?: number
    frameHeight?: number
    frameRate?: number
    frameCount?: number
    receivedFrames?: number
    startedAt?: string
    completedAt?: string
    error?: string
    outputUrl?: string
}
