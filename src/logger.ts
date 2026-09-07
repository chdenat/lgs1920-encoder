/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: logger.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

export type LogLevel = 'info' | 'warn' | 'error'

export type LogEntry = {
    timestamp: string
    level: LogLevel
    message: string
    jobId?: string
}

/** Keep a bounded in-memory log for the local dashboard. */
export const createLogger = (maximumEntries = 500) => {
    const entries: LogEntry[] = []

    /** Add a structured entry to the local log. */
    const write = (level: LogLevel, message: string, jobId?: string): LogEntry => {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            jobId,
        }

        entries.push(entry)
        if (entries.length > maximumEntries) {
            entries.splice(0, entries.length - maximumEntries)
        }

        const logContext = jobId ? {jobId} : undefined
        if (level === 'error') {
            logContext ? console.error(message, logContext) : console.error(message)
        }
        else {
            logContext ? console.log(message, logContext) : console.log(message)
        }

        return entry
    }

    /** Return the newest local log entries first. */
    const list = (): LogEntry[] => [...entries].reverse()

    return {
        write,
        list,
    }
}
