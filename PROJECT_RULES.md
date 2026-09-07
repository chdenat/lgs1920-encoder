# Project rules

This is the canonical source for the LGS1920 Encoder's AI-agent and development rules.

## 1. Core directives

- **Conversation language:** Conversational responses must be in French.
- **Repository language:** Code comments, JSDoc, documentation, API descriptions, and issue content must be in English.
- **Scope:** Keep changes focused on the requested encoder behavior. Do not add unrelated product features or broaden the network surface.
- **Autonomy:** Make routine, reversible implementation choices from repository conventions and evidence. Ask only when missing information materially changes the behavior, scope, or external contract.
- **Working tree:** Preserve existing uncommitted changes. Never reset, discard, or overwrite user work without explicit authorization.
- **Git:** Do not stage, commit, push, publish, or create releases unless explicitly requested.
- **Stable fixes:** Replace a workaround when validation shows that it is unreliable. Do not hand off a known unstable fix.

## 2. Runtime and architecture

- Use Bun for runtime, dependency management, scripts, testing, and packaging.
- Use Elysia for the HTTP service and keep the existing route and response contracts stable unless the request explicitly changes them.
- Keep the encoder local-only. `ENCODER_HOST` must remain `127.0.0.1`; do not expose the service on a wildcard or LAN address.
- Treat the process bearer token, origin allow-list, upload-size limit, restrictive content policies, and temporary-file cleanup as security boundaries.
- Never resolve input media from user-provided remote URLs. Media is uploaded to the local process and encoded on the same machine.
- Keep media-processing behavior in the job and encoding modules rather than duplicating it in HTTP handlers or dashboard code.
- Preserve the job state model (`queued`, `encoding`, `completed`, `failed`, `canceled`) and the semantics of progress events, cancellation, and output downloads.
- Keep Swagger UI assets embedded and served locally. Do not introduce CDN dependencies for the dashboard or API documentation.

## 3. TypeScript and source style

- Do not use semicolons.
- Use named exports for application modules. Default exports are allowed only where a third-party asset declaration requires them.
- Use arrow functions for functions, except class constructors.
- Add concise professional English JSDoc to functions and methods, especially exported functions, route helpers, encoding callbacks, and non-obvious asynchronous logic.
- Prefer explicit types at public boundaries and validate untrusted request data before passing it to the job manager or encoder.
- Keep new files focused and below 1500 lines. Split an existing oversized file only when the requested change makes that necessary.
- Preserve the existing LGS1920 source-file copyright header format and update the modified date when changing source files.

## 4. Dashboard and styling

- Use Web Awesome 3.12.0 components and Font Awesome icons already provided by the project. Do not add another component library or CSS framework.
- Prefer Web Awesome components, native component events, and project theme tokens before writing custom controls.
- Keep the dashboard usable with keyboard navigation, visible focus, accessible names, disabled/loading/error states, and usable narrow layouts.
- Preserve the existing LGS1920 theme, brand-color preferences, color-mode preferences, and local-storage behavior unless the request changes them.
- Use the existing CSS custom properties and Web Awesome tokens. Every new CSS custom property must have an English comment explaining its purpose.
- Keep browser-only behavior in `src/ui/main.ts` and presentation in `src/ui/index.liquid` and `src/ui/styles.css`.

## 5. Tests, documentation, and validation

- Test observable behavior at the API boundary and use deterministic local fixtures for media jobs.
- For route changes, cover authorization, origin handling, malformed input, size limits, response status, and relevant headers.
- For job or encoding changes, cover progress, terminal states, cancellation, cleanup, and output access when applicable.
- For dashboard changes, cover the relevant user-visible state and keep accessibility behavior intact.
- Never weaken an assertion merely to make a test pass.
- Run the smallest relevant checks first, then the full applicable verification:
  - `bun run typecheck`
  - `bun test`
  - `bun run build:ui`
- Run a platform packaging command only when packaging code, native bindings, release scripts, or target-specific assets are affected.
- Keep implementation and architecture documentation in `docs/` and update it when public behavior, configuration, packaging, or API contracts change.
- Do not claim a build or platform artifact was validated unless that command actually ran successfully.

## 6. Release and dependency boundaries

- Do not change the supported Bun, Web Awesome, Elysia, Mediabunny, NodeAV, or FFmpeg assumptions without checking the affected build, runtime, and documentation paths.
- When changing dependencies, review `docs/THIRD-PARTY-NOTICES.md` and update dependency documentation when the inventory or license obligations change.
- Treat `scripts/publish.ts` as an explicit release workflow. Inspect it before changing release behavior and never invoke it as part of ordinary feature validation.
- Do not log bearer tokens, environment secrets, uploaded media contents, temporary paths that reveal sensitive data, or full request bodies.
