/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: jobs.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import { appendFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { EncodeFileOptions, EncodeFramesOptions } from './encoding'
import type { LogLevel } from './logger'
import type { EncodeOptions, FrameJobOptions, JobStatus, PublicJob } from './types'

type InternalJob = PublicJob & {
    inputPath: string
    outputPath: string
    abortController: AbortController
    frameOptions?: FrameJobOptions
    frameWriteQueue: Promise<void>
}

export type JobEncoder = (options: EncodeFileOptions) => Promise<void>
export type FrameJobEncoder = (options: EncodeFramesOptions) => Promise<void>

export type CreateJobManagerOptions = {
    dataDirectory: string
    encode: JobEncoder
    encodeFrames: FrameJobEncoder
    log?: (level: LogLevel, message: string, jobId?: string) => void
}

/** Manage queued local encoding jobs and their lifecycle state. */
export const createJobManager = ({dataDirectory, encode, encodeFrames, log = () => undefined}: CreateJobManagerOptions) => {
    const jobs = new Map<string, InternalJob>()
    let queue = Promise.resolve()

    /** Convert an internal job into the API-safe representation. */
    const toPublicJob = (job: InternalJob): PublicJob => {
        const {
            inputPath: _inputPath,
            outputPath: _outputPath,
            abortController: _abortController,
            frameWriteQueue: _frameWriteQueue,
            ...publicJob
        } = job

        return publicJob
    }

    /** Update a job's status and optional completion timestamp. */
    const updateStatus = (job: InternalJob, status: JobStatus): void => {
        job.status = status
        job.phase = status
        if (status === 'completed' || status === 'failed' || status === 'canceled') {
            job.completedAt = new Date().toISOString()
        }
    }

    /** Run one job and release its temporary input file afterwards. */
    const runJob = async (job: InternalJob): Promise<void> => {
        if (job.status === 'canceled') {
            return
        }

        job.startedAt = new Date().toISOString()
        updateStatus(job, 'encoding')
        log('info', 'Encoding started', job.id)

        try {
            const onProgress = (progress: number): void => {
                job.progress = job.inputKind === 'frames'
                    ? 0.5 + (Math.min(1, Math.max(0, progress)) * 0.5)
                    : Math.min(1, Math.max(0, progress))
            }

            if (job.inputKind === 'frames') {
                if (!job.frameOptions) {
                    throw new Error('The frame job configuration is missing')
                }

                await encodeFrames({
                    inputPath: job.inputPath,
                    outputPath: job.outputPath,
                    options: job.frameOptions,
                    signal: job.abortController.signal,
                    onProgress,
                })
            }
            else {
                await encode({
                    inputPath: job.inputPath,
                    outputPath: job.outputPath,
                    options: job.options,
                    signal: job.abortController.signal,
                    onProgress,
                })
            }

            if (job.abortController.signal.aborted) {
                updateStatus(job, 'canceled')
                log('info', 'Encoding canceled', job.id)
                return
            }

            job.progress = 1
            job.outputUrl = `/v1/jobs/${job.id}/output`
            updateStatus(job, 'completed')
            log('info', 'Encoding completed', job.id)
        }
        catch (error) {
            if (job.abortController.signal.aborted) {
                updateStatus(job, 'canceled')
                log('info', 'Encoding canceled', job.id)
            }
            else {
                job.error = error instanceof Error ? error.message : 'Encoding failed'
                updateStatus(job, 'failed')
                log('error', job.error, job.id)
            }
        }
        finally {
            try {
                await unlink(job.inputPath)
            }
            catch {
                // The input may already have been removed during shutdown.
            }
        }
    }

    /** Add a job to the serialized encoding queue. */
    const createJob = async (file: Blob, options: EncodeOptions): Promise<PublicJob> => {
        const id = crypto.randomUUID()
        const inputPath = join(dataDirectory, `${id}.input`)
        const outputPath = join(dataDirectory, `${id}.mp4`)
        const now = new Date().toISOString()
        const job: InternalJob = {
            id,
            inputKind: 'file',
            phase: 'queued',
            status: 'queued',
            progress: 0,
            createdAt: now,
            options,
            inputPath,
            outputPath,
            abortController: new AbortController(),
            frameWriteQueue: Promise.resolve(),
        }

        await Bun.write(inputPath, file)
        jobs.set(id, job)
        log('info', 'Encoding job queued', id)
        queue = queue.then(() => runJob(job)).catch(() => undefined)

        return toPublicJob(job)
    }

    /** Create a job that waits for an ordered sequence of raw RGBA frames. */
    const createFrameJob = async (options: FrameJobOptions): Promise<PublicJob> => {
        const id = crypto.randomUUID()
        const inputPath = join(dataDirectory, `${id}.frames`)
        const outputPath = join(dataDirectory, `${id}.mp4`)
        const now = new Date().toISOString()
        const {frameWidth: _frameWidth, frameHeight: _frameHeight, frameRate: _frameRate, frameCount: _frameCount, ...encodeOptions} = options
        const job: InternalJob = {
            id,
            inputKind: 'frames',
            phase: 'receiving',
            status: 'queued',
            progress: 0,
            createdAt: now,
            options: encodeOptions,
            frameWidth: options.frameWidth,
            frameHeight: options.frameHeight,
            frameRate: options.frameRate,
            frameCount: options.frameCount,
            receivedFrames: 0,
            inputPath,
            outputPath,
            abortController: new AbortController(),
            frameWriteQueue: Promise.resolve(),
            frameOptions: options,
        }

        await Bun.write(inputPath, new Uint8Array())
        jobs.set(id, job)
        log('info', 'Frame encoding job opened', id)

        return toPublicJob(job)
    }

    /** Append the next raw RGBA frame to a frame job. */
    const appendFrame = async (id: string, index: number, frame: Uint8Array): Promise<PublicJob | undefined> => {
        const job = jobs.get(id)
        if (!job) {
            return undefined
        }

        const appendOperation = job.frameWriteQueue.then(async () => {
            if (job.inputKind !== 'frames' || !job.frameOptions) {
                throw new Error('The requested job does not accept individual frames')
            }
            if (job.phase !== 'receiving') {
                throw new Error('The frame job is no longer receiving frames')
            }
            if (index !== job.receivedFrames) {
                throw new Error(`Expected frame index ${job.receivedFrames}`)
            }

            const expectedBytes = job.frameOptions.frameWidth * job.frameOptions.frameHeight * 4
            if (frame.byteLength !== expectedBytes) {
                throw new Error(`A frame must contain exactly ${expectedBytes} RGBA bytes`)
            }

            await appendFile(job.inputPath, frame)
            job.receivedFrames += 1
            job.progress = (job.receivedFrames / job.frameOptions.frameCount) * 0.5
            log('info', `Frame ${job.receivedFrames}/${job.frameOptions.frameCount} received`, id)
        })
        job.frameWriteQueue = appendOperation.then(() => undefined, () => undefined)
        await appendOperation

        return toPublicJob(job)
    }

    /** Close a complete frame sequence and add it to the encoding queue. */
    const completeFrameJob = (id: string): PublicJob | undefined => {
        const job = jobs.get(id)
        if (!job) {
            return undefined
        }
        if (job.inputKind !== 'frames' || !job.frameOptions) {
            throw new Error('The requested job does not accept individual frames')
        }
        if (job.phase !== 'receiving') {
            throw new Error('The frame job is already closed')
        }
        if (job.receivedFrames !== job.frameOptions.frameCount) {
            throw new Error(`Expected ${job.frameOptions.frameCount} frames, received ${job.receivedFrames}`)
        }

        job.phase = 'queued'
        job.progress = 0.5
        log('info', 'Frame encoding job queued', id)
        queue = queue.then(() => runJob(job)).catch(() => undefined)

        return toPublicJob(job)
    }

    /** Return one job by identifier. */
    const getJob = (id: string): PublicJob | undefined => {
        const job = jobs.get(id)

        return job ? toPublicJob(job) : undefined
    }

    /** Return all known jobs, newest first. */
    const listJobs = (): PublicJob[] => Array.from(jobs.values())
        .sort((firstJob, secondJob) => secondJob.createdAt.localeCompare(firstJob.createdAt))
        .map(toPublicJob)

    /** Return the internal job for output and cancellation operations. */
    const getInternalJob = (id: string): InternalJob | undefined => jobs.get(id)

    /** Return a frame job's public metadata when it accepts individual frames. */
    const getFrameJob = (id: string): PublicJob | undefined => {
        const job = jobs.get(id)

        return job?.inputKind === 'frames' ? toPublicJob(job) : undefined
    }

    /** Cancel a queued or active job. */
    const cancelJob = (id: string): PublicJob | undefined => {
        const job = jobs.get(id)

        if (!job || ['completed', 'failed', 'canceled'].includes(job.status)) {
            return job ? toPublicJob(job) : undefined
        }

        job.abortController.abort()
        updateStatus(job, 'canceled')
        log('info', 'Encoding job canceled', job.id)
        if (job.startedAt === undefined) {
            void unlink(job.inputPath).catch(() => undefined)
        }

        return toPublicJob(job)
    }

    return {
        createJob,
        createFrameJob,
        appendFrame,
        completeFrameJob,
        getJob,
        listJobs,
        getInternalJob,
        getFrameJob,
        cancelJob,
    }
}
