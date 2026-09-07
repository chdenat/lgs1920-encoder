---
name: lgs-1920-encoder-maintenance
description: Maintain the LGS1920 Encoder local-only Bun/Elysia service, media jobs, Web Awesome dashboard, tests, documentation, and platform packaging.
---

# LGS1920 Encoder maintenance

Use this skill for changes inside the `encoder` repository. Read the repository's
`PROJECT_RULES.md` before editing and inspect the relevant implementation, tests,
and documentation before choosing a change.

## Choose the affected boundary

- For HTTP behavior, inspect `src/app.ts`, `src/config.ts`, the job manager, and
  `tests/app.test.ts`. Preserve loopback binding, bearer-token authorization,
  origin validation, upload limits, restrictive headers, and the existing job
  response model.
- For encoding behavior, inspect `src/encoding.ts`, `src/jobs.ts`, and
  `src/types.ts`. Keep progress, cancellation, temporary-file cleanup, output
  ownership, and hardware-acceleration preferences consistent across queued and
  active jobs.
- For dashboard behavior, inspect `src/ui/index.liquid`, `src/ui/main.ts`,
  `src/ui/styles.css`, and the local Web Awesome theme. Prefer existing Web
  Awesome components and native events, and preserve keyboard access, visible
  focus, responsive layouts, and local preference persistence.
- For packaging or release behavior, inspect `scripts/`, `docs/RELEASES-AND-VERSIONS.md`,
  the CI workflows, and the NodeAV/native-binding handling before editing. Keep
  platform-specific work explicit and do not run publication commands during
  ordinary validation.
- For documentation, update the English Markdown source in `README.md` or
  `docs/` and keep examples aligned with the current routes, environment
  variables, and build commands.

## Implementation workflow

1. Identify the observable contract and the smallest affected modules.
2. Validate untrusted input at the boundary and keep local-only security checks
   close to the HTTP boundary.
3. Reuse existing types, job lifecycle helpers, Web Awesome components, theme
   tokens, and response conventions before adding new abstractions.
4. Add or update focused tests for the behavior that changed. Prefer API-level
   assertions and deterministic fake encoders over implementation-detail tests.
5. Run the relevant checks, then the full baseline when the change affects more
   than one boundary:

   ```bash
   bun run typecheck
   bun test
   bun run build:ui
   ```

6. Report changed files, validation commands, and any platform-specific check
   that could not be run.

Never broaden the service beyond loopback, accept remote media URLs, expose
secrets in logs or errors, or claim a platform build was verified without
running it.
