/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: encoding.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import { open } from 'node:fs/promises'
import { registerMediabunnyServer } from '@mediabunny/server'
import {
    ALL_FORMATS,
    Conversion,
    FilePathSource,
    FilePathTarget,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
    VideoSample,
    VideoSampleSource,
} from 'mediabunny'
import type { EncodeOptions, FrameJobOptions, HardwareAcceleration } from './types'

let mediaRuntimeRegistered = false

/** Register Mediabunny's native server codecs once per process. */
const ensureMediaRuntime = (hardwareAcceleration: HardwareAcceleration): void => {
    if (mediaRuntimeRegistered) {
        return
    }

    registerMediabunnyServer({
        hardwareContext: hardwareAcceleration === 'prefer-hardware' ? undefined : null,
    })
    mediaRuntimeRegistered = true
}

export type EncodeFileOptions = {
    inputPath: string
    outputPath: string
    options: EncodeOptions
    signal: AbortSignal
    onProgress: (progress: number) => void
}

export type EncodeFramesOptions = {
    inputPath: string
    outputPath: string
    options: FrameJobOptions
    signal: AbortSignal
    onProgress: (progress: number) => void
}

/** Encode one local media file to an MP4 file with Mediabunny. */
export const encodeFile = async ({
    inputPath,
    outputPath,
    options,
    signal,
    onProgress,
}: EncodeFileOptions): Promise<void> => {
    ensureMediaRuntime(options.hardwareAcceleration)

    const input = new Input({
        source: new FilePathSource(inputPath),
        formats: ALL_FORMATS,
    })
    const output = new Output({
        format: new Mp4OutputFormat(),
        target: new FilePathTarget(outputPath),
    })
    let conversion: Conversion | undefined

    const cancelConversion = (): void => {
        void conversion?.cancel()
    }

    signal.addEventListener('abort', cancelConversion, {once: true})

    try {
        conversion = await Conversion.init({
            input,
            output,
            tracks: 'primary',
            trim: options.durationSeconds === undefined ? undefined : {end: options.durationSeconds},
            video: {
                codec: 'avc',
                width: options.width,
                height: options.height,
                quality: new Quality(options.quality),
                hardwareAcceleration: options.hardwareAcceleration,
            },
            audio: {
                codec: 'aac',
                quality: new Quality(options.quality),
            },
        })

        conversion.onProgress = progress => onProgress(progress)

        if (signal.aborted) {
            await conversion.cancel()
        }

        await conversion.execute()
    }
    finally {
        signal.removeEventListener('abort', cancelConversion)
        input.dispose()
    }
}

/** Encode a sequence of raw RGBA frames into an MP4 video. */
export const encodeFrames = async ({
    inputPath,
    outputPath,
    options,
    signal,
    onProgress,
}: EncodeFramesOptions): Promise<void> => {
    ensureMediaRuntime(options.hardwareAcceleration)

    const frameBytes = options.frameWidth * options.frameHeight * 4
    const frameDuration = 1 / options.frameRate
    const input = await open(inputPath, 'r')
    const output = new Output({
        format: new Mp4OutputFormat(),
        target: new FilePathTarget(outputPath),
    })
    const source = new VideoSampleSource({
        codec: 'avc',
        quality: new Quality(options.quality),
        transform: options.width || options.height
            ? {width: options.width, height: options.height}
            : undefined,
    })
    let finalized = false

    try {
        output.addVideoTrack(source, {frameRate: options.frameRate})
        await output.start()

        const buffer = Buffer.alloc(frameBytes)
        for (let index = 0; index < options.frameCount; index += 1) {
            if (signal.aborted) {
                await output.cancel()
                return
            }

            const {bytesRead} = await input.read(buffer, 0, frameBytes, index * frameBytes)
            if (bytesRead !== frameBytes) {
                throw new Error(`Frame ${index} is incomplete`)
            }

            const sample = new VideoSample(buffer, {
                format: 'RGBA',
                codedWidth: options.frameWidth,
                codedHeight: options.frameHeight,
                timestamp: index * frameDuration,
                duration: frameDuration,
            })

            await source.add(sample)
            sample.close()
            onProgress((index + 1) / options.frameCount)
        }

        source.close()
        await output.finalize()
        finalized = true
    }
    finally {
        await input.close()
        if (!finalized && !signal.aborted) {
            await output.cancel().catch(() => undefined)
        }
    }
}
