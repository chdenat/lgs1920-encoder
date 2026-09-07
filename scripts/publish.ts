/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: publish.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

type VersionIncrement = 'patch' | 'minor' | 'major'

const args = Bun.argv.slice(2)
const preview = args.includes('--preview')
const incrementArguments = args.filter(argument => argument !== '--preview')
const increments: VersionIncrement[] = ['patch', 'minor', 'major']

if (incrementArguments.length > 1 || incrementArguments.some(argument => !increments.includes(argument.slice(2) as VersionIncrement) || !argument.startsWith('--'))) {
    console.error('Usage: bun run publish [--patch|--minor|--major] [--preview]')
    process.exit(1)
}

const increment = (incrementArguments[0]?.slice(2) as VersionIncrement | undefined) ?? 'patch'

/** Run a command and return its trimmed standard output. */
const output = (command: string, commandArguments: string[]): string => {
    const result = Bun.spawnSync([command, ...commandArguments], {stderr: 'pipe', stdout: 'pipe'})
    if (result.exitCode !== 0) {
        const error = new TextDecoder().decode(result.stderr).trim()
        console.error(error || `Command failed: ${command} ${commandArguments.join(' ')}`)
        process.exit(result.exitCode || 1)
    }

    return new TextDecoder().decode(result.stdout).trim()
}

/** Run a command while forwarding its output to the release operator. */
const run = async (command: string, commandArguments: string[]): Promise<void> => {
    const child = Bun.spawn([command, ...commandArguments], {stderr: 'inherit', stdout: 'inherit'})
    const exitCode = await child.exited
    if (exitCode !== 0) {
        process.exit(exitCode)
    }
}

/** Calculate the next stable semantic version. */
const nextVersion = (version: string, kind: VersionIncrement): string => {
    const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(version)
    if (!match) {
        throw new Error(`Invalid stable version in package.json: ${version}`)
    }

    let [major, minor, patch] = match.slice(1).map(Number)
    if (kind === 'major') {
        major += 1
        minor = 0
        patch = 0
    }
    else if (kind === 'minor') {
        minor += 1
        patch = 0
    }
    else {
        patch += 1
    }

    return `${major}.${minor}.${patch}`
}

/** Build concise annotated release notes from changed source areas. */
const releaseNotes = (changedFiles: string[]): string => {
    const messages: Array<[string, string]> = [
        ['src/app.ts', '- Updated the local API, Swagger documentation, or service behavior.'],
        ['src/encoding.ts', '- Updated local Mediabunny encoding behavior.'],
        ['src/jobs.ts', '- Updated local job queue and lifecycle handling.'],
        ['src/ui/', '- Updated the local dashboard, layout, or LGS1920 themes.'],
        ['scripts/', '- Updated build or publication automation.'],
        ['docs/', '- Updated architecture, usage, or release documentation.'],
        ['tests/', '- Updated automated verification.'],
    ]
    const changes = messages
        .filter(([path]) => changedFiles.some(file => file === path || file.startsWith(path)))
        .map(([, message]) => message)

    return changes.length > 0 ? changes.join('\n') : '- Updated the encoder implementation and release configuration.'
}

if (output('git', ['status', '--porcelain'])) {
    console.error('Publication stopped: the repository contains uncommitted changes.')
    process.exit(1)
}

const latestTag = output('git', ['tag', '--list', 'v*', '--sort=-version:refname']).split('\n')[0]
const releasePaths = ['src', 'scripts', 'tests', 'docs', 'README.md', 'package.json', 'bun.lock']
if (latestTag && !output('git', ['diff', '--name-only', `${latestTag}..HEAD`, '--', ...releasePaths])) {
    console.error(`Publication stopped: no release changes since ${latestTag}.`)
    process.exit(1)
}

const packageJson = await Bun.file('./package.json').json() as {version: string, [key: string]: unknown}
const version = nextVersion(packageJson.version, increment)
const readme = await Bun.file('./README.md').text()
const releaseLine = /^The current release is `[^`]+`/m
if (!releaseLine.test(readme)) {
    console.error('Publication stopped: the current release line is missing from README.md.')
    process.exit(1)
}

const changeRange = latestTag ? `${latestTag}..HEAD` : 'HEAD'
const changedFiles = output('git', ['diff', '--name-only', changeRange, '--', ...releasePaths]).split('\n').filter(Boolean)
const compareUrl = latestTag
    ? `https://github.com/lgs1920/encoder/compare/${latestTag}...v${version}`
    : `https://github.com/lgs1920/encoder/releases/tag/v${version}`
const tagMessage = `v${version}\n\nChanges:\n${releaseNotes(changedFiles)}\n\nChanges between releases: ${compareUrl}`

if (preview) {
    console.log(`Proposed release: v${version}`)
    console.log('')
    console.log(tagMessage)
    process.exit(0)
}

const updatedReadme = readme.replace(releaseLine, `The current release is \`${version}\``)
await Bun.write('./package.json', `${JSON.stringify({...packageJson, version}, null, 2)}\n`)
await Bun.write('./README.md', updatedReadme)
await run('git', ['add', 'package.json', 'README.md'])
await run('git', ['commit', '-m', `v${version}`])
await run('git', ['tag', '-a', `v${version}`, '-m', tagMessage])
await run('git', ['push', 'origin', 'main', '--follow-tags'])
console.log(`GitHub release: https://github.com/lgs1920/encoder/releases/tag/v${version}`)
