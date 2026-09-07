/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: encoding.test.ts
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
import { describe, expect, it } from 'bun:test'
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny'
import { encodeFrames } from '../src/encoding'

describe('frame encoding', () => {
    it('encodes ten RGBA frames into five seconds of MP4', async () => {
        const dataDirectory = await mkdtemp(join(tmpdir(), 'lgs1920-encoder-frames-'))
        const inputPath = join(dataDirectory, 'frames.rgba')
        const outputPath = join(dataDirectory, 'frames.mp4')
        const frameWidth = 16
        const frameHeight = 16
        const frameCount = 10
        const frameBytes = frameWidth * frameHeight * 4
        const input = new Uint8Array(frameBytes * frameCount)
        const progress: number[] = []

        for (let index = 0; index < frameCount; index += 1) {
            input.fill(index * 20, index * frameBytes, (index + 1) * frameBytes)
            for (let pixel = index * frameBytes; pixel < (index + 1) * frameBytes; pixel += 4) {
                input[pixel + 3] = 255
            }
        }

        try {
            await Bun.write(inputPath, input)
            await encodeFrames({
                inputPath,
                outputPath,
                options: {
                    frameWidth,
                    frameHeight,
                    frameRate: 2,
                    frameCount,
                    quality: 'low',
                    hardwareAcceleration: 'no-preference',
                },
                signal: new AbortController().signal,
                onProgress: value => progress.push(value),
            })

            expect(await Bun.file(outputPath).exists()).toBe(true)
            expect(await Bun.file(outputPath).size).toBeGreaterThan(0)
            const output = new Input({source: new FilePathSource(outputPath), formats: ALL_FORMATS})
            try {
                expect(await output.computeDuration()).toBeCloseTo(5, 1)
            }
            finally {
                output.dispose()
            }
            expect(progress.at(-1)).toBe(1)
            expect(progress).toHaveLength(frameCount)
        }
        finally {
            await rm(dataDirectory, {recursive: true, force: true})
        }
    })
})
