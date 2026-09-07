# LGS1920 Encoder

LGS1920 Encoder is a local-only video encoding service intended to be launched by LGS1920 Studio. It exposes a small HTTP API on `127.0.0.1` and performs media processing on the same computer with Mediabunny, NodeAV, and FFmpeg.

The service does not accept remote media URLs. The input is uploaded from Studio to the loopback interface, stored temporarily on the local disk, encoded locally, and returned through the same local API. No media data is sent to a cloud service by this project.

The current release is `0.1.0`.

## Development

Install Bun, then install dependencies and start the service:

```bash
bun install
bun run start
```

The default endpoint is `http://127.0.0.1:47832`. At startup, the application opens a dedicated Chromium/Edge application window without navigation controls. Set `ENCODER_WINDOW_MODE=browser` when a normal browser window is preferred. It can run without a visible console when packaged for Windows. Developers can use `ENCODER_OPEN_DASHBOARD=false bun run dev` during implementation.

The local dashboard is rendered from the Eleventy template `src/ui/index.liquid`, with its interactive TypeScript bundle and CSS generated locally. It is available at `http://127.0.0.1:47832/` and shows active jobs, progress, errors, logs, and download actions. It includes the LGS1920 Web Awesome theme, persistent color mode and brand color menus, and synchronized video comparison. The independent frame demo runs from the sibling `encoder-frame-demo` application at `http://127.0.0.1:47833/`. See [Explanation and usage](docs/EXPLANATION-AND-USAGE.md) for the walkthrough and [Architecture](docs/ARCHITECTURE.md) for the detailed design.

## Standalone frame demo

The [LGS1920 Encoder Frame Demo](https://github.com/chdenat/lgs1920-encoder-frame-demo) is a separate Eleventy application that demonstrates the raw-frame API in a browser. It initializes a frame stream, captures the source one frame at a time, sends individual RGBA frames to this encoder, displays each request and the progress state, then plays the reconstructed output inside the same application.

Start the encoder first, then start the demo from its own repository:

```bash
# Terminal 1: this encoder repository
bun run start

# Terminal 2: https://github.com/chdenat/lgs1920-encoder-frame-demo
bun install
bun run start
```

The demo checks `http://127.0.0.1:47832/health` before opening its browser window and before each capture. If the encoder is not running, the demo server exits instead of starting. The demo serves its own interface on `http://127.0.0.1:47833` and proxies only its local `/encoder/*` API calls to the encoder; the encoder dashboard is not used for playback.

The demo contains multiple capture scenarios and samples at 30 fps by default. The UI supports 2, 5, 10, 15, 30, and 60 fps, along with capture size, output size, quality, acceleration, and capture pacing controls. The frame protocol used by the demo is documented below in [the raw RGBA frames API](#raw-rgba-frames-api).

## API

The health endpoint is public and does not expose the session token:

```http
GET /health
GET /v1/health
```

The local Swagger UI is available at [`/swagger`](http://127.0.0.1:47832/swagger), and its OpenAPI document is available at `/swagger/openapi.json`. Swagger UI assets are embedded in the application and served locally.

The Studio client obtains a process-scoped bearer token from the local session endpoint:

```http
GET /v1/session
```

Create an encoding job with a multipart request. The media file must be in the `file` field. Encoding options are optional JSON in the `options` field:

```bash
curl http://127.0.0.1:47832/v1/session
curl -X POST http://127.0.0.1:47832/v1/jobs \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -F 'file=@input.webm' \
  -F 'options={"quality":"high","width":1920,"durationSeconds":5}'
```

The response contains a job identifier. Poll `GET /v1/jobs/:id` for status or consume `GET /v1/jobs/:id/events` for server-sent progress events. The final file is available at `GET /v1/jobs/:id/output`. `DELETE /v1/jobs/:id` cancels a queued or active job.

### Raw RGBA frames API

The API also accepts individual raw RGBA frames. Create a frame job with `POST /v1/jobs` and a JSON body containing `type: "frames"`, an even `width` and `height`, a `frameRate`, and a `frameCount`. Send each frame as an `application/octet-stream` body to `POST /v1/jobs/:id/frames` with its zero-based `X-Frame-Index`, then call `POST /v1/jobs/:id/complete`. The job response reports `phase`, `receivedFrames`, and `progress`; frame upload uses the first half of the progress range and MP4 encoding uses the second half. Ten frames at 2 fps produce a five-second video. See [Explanation and usage](docs/EXPLANATION-AND-USAGE.md) for the complete frame protocol.

File uploads produce MP4 with AVC video and AAC audio. Frame jobs produce video-only MP4 with AVC video. Set `durationSeconds` to trim the output from the start of a file input while keeping its audio track. The encoder can prefer hardware acceleration when the local platform exposes a compatible device.

## Packaging

Bun can compile the TypeScript entry point into a standalone executable. Build each target on a compatible build host or use Bun's target option:

```bash
bun run build:windows
bun run build:windows-arm64
bun run build:macos
bun run build:macos-x64
bun run build:linux
bun run build:linux-arm64
```

The generated executable is the application the end user launches. The Windows build embeds the matching NodeAV native binding in the executable; this is required because Bun cannot resolve NodeAV's platform package from a compiled virtual filesystem. If the Windows binding is not installed locally, the build script downloads its archive directly with Bun and extracts it without invoking another package manager. When the build runs on Windows, it also writes the LGS1920 Encoder icon into the executable metadata. Cross-compiling from Linux still produces a working executable, but Bun cannot apply Windows icon metadata from Linux.

The release workflow builds all desktop variants and attaches them to a GitHub release. See [Releases and versions](docs/RELEASES-AND-VERSIONS.md) for Semantic Versioning, platform variants, preview mode, and publication commands.

## Configuration

Copy `.env.example` to `.env` for local development. `ENCODER_HOST` must remain `127.0.0.1` for the local-only security boundary. Configure the allowed Studio origins with `ENCODER_ALLOWED_ORIGINS` when integrating another Studio origin. Set `ENCODER_WINDOW_MODE=browser` only when a normal browser window is preferred.

## License

The application is licensed under the GNU Affero General Public License version 3 or later. See [LICENSE.md](LICENSE.md) and [third-party notices](docs/THIRD-PARTY-NOTICES.md). Mediabunny is distributed under its own Mozilla Public License terms, Swagger UI under Apache 2.0, and the FFmpeg and NodeAV components retain their respective licenses. Review the dependency notices before publishing packaged binaries.
