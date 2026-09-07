# Releases and versions

## Version meaning

The project uses stable Semantic Versioning in `package.json` and Git tags:

- `MAJOR` changes can require coordinated changes in Studio or break an API contract.
- `MINOR` adds backwards-compatible capabilities, such as a new encoding option or route.
- `PATCH` fixes behavior, packaging, documentation, or UI regressions without changing the existing contract.

The initial `0.x` line identifies the prototype. During `0.x`, a minor release can still require integration work when the prototype contract changes. A `1.0.0` release means the local API and packaging contract are considered stable.

The version is maintained in `package.json`, exposed by `GET /v1/health`, included in the dashboard footer, and written into the OpenAPI document. The release script keeps these values aligned through the package version and generated build.

## Platform builds

Each stable tag creates standalone artifacts for the supported desktop targets:

| Artifact | Target | Build command |
| --- | --- | --- |
| `encoder.exe` | Windows x64 | `bun run build:windows` |
| `encoder-arm64.exe` | Windows ARM64 | `bun run build:windows-arm64` |
| `encoder-linux-x64` | Linux x64 | `bun run build:linux` |
| `encoder-linux-arm64` | Linux ARM64 | `bun run build:linux-arm64` |
| `encoder-macos-x64` | macOS Intel | `bun run build:macos-x64` |
| `encoder-macos-arm64` | macOS Apple Silicon | `bun run build:macos` |

These are platform variants of one application version. They do not represent separate API versions. The Windows build must run on Windows when the `.exe` icon metadata is required.

## Local publication command

The publication helper follows the Countdown repository convention while keeping the whole project Bun-based:

```bash
bun run publish --patch --preview
bun run publish --minor --preview
bun run publish --major --preview
```

Preview mode calculates the next version and prints the annotated tag message without changing files. With no increment, `--patch` is used.

After review, run the same command without `--preview` from a clean checkout:

```bash
bun run publish --patch
```

The command verifies a clean working tree, updates `package.json` and the current release line in `README.md`, creates a release commit, creates an annotated `vMAJOR.MINOR.PATCH` tag, and pushes `main` with its tag. It is intentionally explicit because it changes Git history and publishes a release.

The helper does not publish a JavaScript package. The public deliverable is the desktop executable attached to the GitHub release.

## Continuous publication

`.github/workflows/ci.yml` installs with Bun, runs typecheck and tests, and builds the Eleventy dashboard on pull requests and pushes to `main`.

`.github/workflows/publish.yml` starts for tags matching `v*`. It verifies that the tag matches `package.json`, runs tests, builds each platform artifact on its compatible runner, and creates a GitHub release with generated release notes. No npm command is required by CI.

## Release notes

Annotated Git tags contain a short `Changes:` section derived from changed source areas and a comparison URL. GitHub's release workflow also generates the release page notes. This keeps the repository history useful while preserving the simple release presentation used by Countdown.

## Pre-releases and development builds

Unreleased work lives on `main` and has no public version. Development executables built locally are identified by the version in the checkout and should not be treated as release artifacts. If a pre-release channel is needed later, use standard SemVer identifiers such as `0.2.0-beta.1` and add an explicit workflow rule for those tags; stable publication must continue to use `vMAJOR.MINOR.PATCH`.
