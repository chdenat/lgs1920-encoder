/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: build-windows.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import {tmpdir} from 'node:os'

type WindowsArchitecture = 'x64' | 'arm64'

const projectRoot = resolve(import.meta.dir, '..')
const nodeAvBindingFile = join(projectRoot, 'node_modules', 'node-av', 'dist', 'lib', 'binding.js')

/** Run a process and fail the build when it exits unsuccessfully. */
const run = async (command: string[], cwd: string): Promise<string> => {
    const process = Bun.spawn(command, {
        cwd,
        stderr: 'inherit',
        stdout: 'pipe',
    })
    const output = await new Response(process.stdout).text()
    const exitCode = await process.exited

    if (exitCode !== 0) {
        throw new Error(`Command failed with exit code ${exitCode}: ${command.join(' ')}`)
    }

    return output
}

/** Read the installed NodeAV version used by Mediabunny Server. */
const readNodeAvVersion = async (): Promise<string> => {
    const packageFile = join(projectRoot, 'node_modules', 'node-av', 'package.json')
    const packageData = JSON.parse(await readFile(packageFile, 'utf8')) as {version?: string}

    if (!packageData.version) {
        throw new Error(`Could not read the NodeAV version from ${packageFile}`)
    }

    return packageData.version
}

/** Read a binary file from the public package registry without invoking a package manager. */
const downloadPackageArchive = async (packageName: string, version: string): Promise<Uint8Array> => {
    const encodedName = packageName.replace('/', '%2f')
    const metadataResponse = await fetch(`https://registry.npmjs.org/${encodedName}/${version}`)
    if (!metadataResponse.ok) {
        throw new Error(`Could not read package metadata for ${packageName}@${version}: ${metadataResponse.status}`)
    }

    const metadata = await metadataResponse.json() as {dist?: {tarball?: string}}
    const tarballUrl = metadata.dist?.tarball
    if (!tarballUrl) {
        throw new Error(`Package metadata does not contain a tarball URL for ${packageName}@${version}`)
    }

    const archiveResponse = await fetch(tarballUrl)
    if (!archiveResponse.ok) {
        throw new Error(`Could not download ${packageName}@${version}: ${archiveResponse.status}`)
    }

    return new Uint8Array(await archiveResponse.arrayBuffer())
}

/** Read an octal tar header field. */
const readTarNumber = (bytes: Uint8Array, start: number, length: number): number => {
    const value = new TextDecoder().decode(bytes.slice(start, start + length)).replaceAll('\0', '').trim()
    return value ? Number.parseInt(value, 8) : 0
}

/** Extract one file from a gzip-compressed tar archive. */
const extractTarFile = (archive: Uint8Array, fileName: string): Uint8Array => {
    const tar = Bun.gunzipSync(archive)
    const decoder = new TextDecoder()

    for (let offset = 0; offset + 512 <= tar.length; offset += 512) {
        const name = decoder.decode(tar.slice(offset, offset + 100)).replaceAll('\0', '').trim()
        if (!name) {
            break
        }

        const size = readTarNumber(tar, offset + 124, 12)
        const contentStart = offset + 512
        const contentEnd = contentStart + size
        if (name === fileName) {
            return tar.slice(contentStart, contentEnd)
        }

        offset += Math.ceil(size / 512) * 512
    }

    throw new Error(`Could not find ${fileName} in the downloaded NodeAV package`)
}

/** Download the platform package and extract its native addon into a staging file. */
const downloadNativeBinding = async (packageName: string, version: string, outputFile: string): Promise<void> => {
    const archive = await downloadPackageArchive(packageName, version)
    const nativeBinding = extractTarFile(archive, 'package/node-av.node')
    await writeFile(outputFile, nativeBinding)
}

/** Download and extract the Windows NodeAV binding when it is not installed locally. */
const resolveNativeBinding = async (architecture: WindowsArchitecture, version: string): Promise<{
    file: string
    temporaryDirectory?: string
}> => {
    const packageName = `@seydx/node-av-win32-${architecture}-msvc`
    const installedFile = join(projectRoot, 'node_modules', ...packageName.split('/'), 'node-av.node')

    try {
        await readFile(installedFile)
        return {file: installedFile}
    }
    catch {
        // The host package manager may have installed only the current platform.
    }

    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lgs1920-node-av-'))
    const extractedFile = join(temporaryDirectory, 'node-av.node')
    await downloadNativeBinding(packageName, version, extractedFile)

    return {
        file: extractedFile,
        temporaryDirectory,
    }
}

/** Patch NodeAV for the duration of the compile so Bun embeds its native addon. */
const patchNodeAvBinding = async (nativeFile: string): Promise<string> => {
    const originalSource = await readFile(nodeAvBindingFile, 'utf8')
    const importStatement = `import bundledNativeBinding from ${JSON.stringify(nativeFile.replaceAll('\\', '/'))}\n`
    const patchedSource = `${importStatement}${originalSource.replace(
        'function loadBinding() {',
        'function loadBinding() {\n    return bundledNativeBinding\n',
    )}`

    await writeFile(nodeAvBindingFile, patchedSource)

    return originalSource
}

/** Restore the package file after the compile has consumed the temporary patch. */
const restoreNodeAvBinding = async (originalSource: string): Promise<void> => {
    await writeFile(nodeAvBindingFile, originalSource)
}

/** Parse the requested Windows architecture. */
const readArchitecture = (): WindowsArchitecture => {
    const value = process.argv[2] ?? 'x64'

    if (value !== 'x64' && value !== 'arm64') {
        throw new Error(`Unsupported Windows architecture: ${value}`)
    }

    return value
}

/** Build the standalone Windows executable with its native NodeAV binding embedded. */
const build = async (): Promise<void> => {
    const architecture = readArchitecture()
    const version = await readNodeAvVersion()
    const nativeBinding = await resolveNativeBinding(architecture, version)
    const buildDirectory = join(projectRoot, '.build', `windows-${architecture}`)
    const embeddedNativeFile = join(buildDirectory, 'node-av.node')
    const outputFile = join(projectRoot, 'dist', architecture === 'x64' ? 'encoder.exe' : 'encoder-arm64.exe')
    const iconFile = join(projectRoot, 'public', 'assets', 'logo', 'lgs1920-encoder-icon.ico')
    const windowsMetadataArguments = process.platform === 'win32'
        ? [`--windows-icon=${iconFile}`]
        : []

    if (process.platform !== 'win32') {
        console.warn('Bun applies Windows executable icons only when compiling on Windows')
    }

    await mkdir(buildDirectory, {recursive: true})
    await mkdir(join(projectRoot, 'dist'), {recursive: true})
    await copyFile(nativeBinding.file, embeddedNativeFile)
    await run(['bun', 'run', 'build:ui'], projectRoot)

    const originalSource = await patchNodeAvBinding(embeddedNativeFile)
    try {
        await run([
            'bun',
            'build',
            'src/index.ts',
            '--compile',
            '--minify',
            '--sourcemap',
            '--windows-hide-console',
            ...windowsMetadataArguments,
            `--target=bun-windows-${architecture}`,
            `--outfile=${outputFile}`,
        ], projectRoot)
    }
    finally {
        await restoreNodeAvBinding(originalSource)
    }

    await rm(buildDirectory, {force: true, recursive: true})
    if (nativeBinding.temporaryDirectory) {
        await rm(nativeBinding.temporaryDirectory, {force: true, recursive: true})
    }

    console.log(`Windows ${architecture} executable written to ${outputFile}`)
}

void build().catch(error => {
    console.error('Windows build failed', error)
    process.exitCode = 1
})
