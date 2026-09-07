/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: index.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from './app'
import { createConfig } from './config'
import { encodeFile, encodeFrames } from './encoding'
import { createJobManager } from './jobs'
import { createLogger } from './logger'
import { uiAssets } from './ui-assets'

/** Return the first executable found on the local system path or standard install paths. */
const findExecutable = async (names: string[]): Promise<string | undefined> => {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which'

    for (const name of names) {
        const result = Bun.spawnSync([finder, name], {stderr: 'ignore', stdout: 'pipe'})
        if (result.exitCode === 0) {
            const path = new TextDecoder().decode(result.stdout).trim().split(/\r?\n/)[0]
            if (path) {
                return path
            }
        }
    }

    const windowsRoots = [
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        process.env.LOCALAPPDATA,
    ].filter((path): path is string => Boolean(path))
    const windowsPaths = windowsRoots.flatMap(root => [
        `${root}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${root}\\Google\\Chrome\\Application\\chrome.exe`,
        `${root}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
        `${root}\\Vivaldi\\Application\\vivaldi.exe`,
        `${root}\\Opera\\launcher.exe`,
    ])

    for (const path of windowsPaths) {
        if (await Bun.file(path).exists()) {
            return path
        }
    }

    return undefined
}

/** Open a URL in a browser window without browser navigation controls when possible. */
const openDashboard = async (url: string, mode: 'app' | 'browser'): Promise<void> => {
    if (mode === 'app') {
        const profileDirectory = join(tmpdir(), 'lgs1920-encoder-window')
        await mkdir(profileDirectory, {recursive: true})

        if (process.platform === 'darwin') {
            const applications = ['Google Chrome', 'Microsoft Edge', 'Brave Browser']
            for (const application of applications) {
                const availability = Bun.spawnSync(['open', '-Ra', application], {stderr: 'ignore', stdout: 'ignore'})
                if (availability.exitCode === 0) {
                    Bun.spawn(['open', '-a', application, '--args', `--app=${url}`], {stderr: 'ignore', stdout: 'ignore'})
                    return
                }
            }
        }
        else {
            const browser = await findExecutable(process.platform === 'win32'
                ? ['msedge.exe', 'chrome.exe', 'brave.exe', 'vivaldi.exe', 'opera.exe']
                : ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'msedge', 'brave', 'vivaldi', 'opera'])
            if (browser) {
                try {
                    Bun.spawn([
                        browser,
                        `--user-data-dir=${profileDirectory}`,
                        '--no-first-run',
                        '--no-default-browser-check',
                        `--app=${url}`,
                    ], {stderr: 'ignore', stdout: 'ignore'})
                    return
                }
                catch {
                    // Continue to the explicit no-window error below.
                }
            }
        }

        console.error('No Chromium-compatible browser was found for app mode. Install Edge, Chrome, Chromium, Brave, Vivaldi, or Opera, or set ENCODER_WINDOW_MODE=browser.')
        return
    }

    const command = process.platform === 'win32'
        ? ['cmd.exe', '/c', 'start', '', url]
        : process.platform === 'darwin'
            ? ['open', url]
            : ['xdg-open', url]

    try {
        Bun.spawn(command, {
            stdout: 'ignore',
            stderr: 'ignore',
        })
    }
    catch {
        // The API remains available when no graphical browser is installed.
    }
}

/** Start the local encoder service without opening a user-facing console. */
const start = async (): Promise<void> => {
    const config = createConfig()
    await mkdir(config.dataDirectory, {recursive: true})
    const logger = createLogger()
    logger.write('info', 'LGS1920 Encoder started')

    const jobs = createJobManager({
        dataDirectory: config.dataDirectory,
        encode: encodeFile,
        encodeFrames,
        log: (level, message, jobId) => logger.write(level, message, jobId),
    })
    let shutdownRequested = false
    const app = createApp({
        config,
        jobs,
        logger,
        uiAssets,
        shutdown: () => {
            if (shutdownRequested) {
                return
            }

            shutdownRequested = true
            setTimeout(() => {
                server.stop(true)
                process.exit(0)
            }, 0)
        },
    })
    const server = app.listen({hostname: config.host, port: config.port})

    const dashboardUrl = `http://${config.host}:${server.server?.port}`
    console.log(`LGS1920 Encoder is running at ${dashboardUrl}`)
    if (config.openDashboard) {
        await openDashboard(dashboardUrl, config.windowMode)
    }
}

void start().catch(error => {
    console.error('LGS1920 Encoder could not start', error)
    process.exitCode = 1
})
