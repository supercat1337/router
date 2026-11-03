# Contributing

Thanks for considering a contribution. This is a solo-maintained project —
I'll be honest about what gets merged and what doesn't.

## Before you start

**Read [`AGENTS.md`](./AGENTS.md).** It's written as a function reference
for AI assistants, but the "Common mistakes — Do / Don't" section is the
fastest way for a human to understand the project's non-goals. If you find
yourself proposing something on the "doesn't have" list — it's probably
intentional.

## What this project is (and isn't)

Synchronous state-relative router. Framework-agnostic. Opinionated about
synchronous transactions — no `await` in `resolveMap` or `notFound`, ever.
The public surface is small on purpose; every addition is a commitment.

If you need async loaders, lazy routes, or framework-bound ergonomics out
of the box — this is not the router for you. That's fine. TanStack Router
and Vue Router exist for a reason.

## Setup

```sh
git clone https://github.com/supercat1337/router.git
cd router
npm ci
npm test              # typecheck + tests (AVA)
```

**No CI. No git hooks.** This is deliberate — the package can be mirrored
on any git host (gitverse, gitlab, sourcehut), and the workflow shouldn't
depend on GitHub Actions. Everything runs locally.

## What's welcome

- **Bug reports** with a reproducer. A failing test is even better.
- **Documentation fixes** — typos, unclear wording, missing examples.
- **Tests** for existing behavior that isn't covered.
- **Type-level improvements** that don't change runtime.
- **Bug fixes** with a regression test.

## What needs discussion first

Open an issue **before** writing code for:

- **New public API.** The surface is intentionally small. Additions have
  to earn their place.
- **Performance optimizations.** Bench first (`npm run bench`), then show
  the delta. Use the existing 12-scenario harness — don't invent new ones.
- **New subpath exports.** These expand the maintenance surface.
- **New runtime dependencies.** One (`@supercat1337/event-emitter`) is the
  design; dev deps are negotiable.

## What gets closed

- **"Add framework X support"** — core is framework-agnostic by design.
  Ecosystem packages (when they exist) live in separate repos.
- **PRs that add CI** — see "Setup" above.
- **PRs without tests** — every behavior needs a test.
- **PRs that touch the public API without a spec or issue.**

## Workflow

```sh
git checkout -b fix/my-thing
# ... code ...
npm test                                # must pass
npm run lint                            # must pass
npm run build                           # dist/
npm run bench                           # (optional) if perf-related
npm run bundle-size                     # if src/** or package.json deps changed
git add .
git commit -m "fix: short description"
```

Open a PR. Describe **what** and **why**. Link the issue if there is one.

Before committing changes that affect bundle size (`src/**`, `package.json`
deps): `npm run build && npm run bundle-size` — this rewrites the size
table in `README.md`. Commit both together.

## Testing conventions

- **AVA**, files in `tests/**/*.test.js`.
- **`test.serial` is required** for any test that touches `globalThis`:
  `installDom()`, `document`, `history`, `location`,
  `__SUPERCAT_ROUTER_DEVTOOLS__`. AVA runs tests concurrently within a
  file; a `dom.teardown()` from one test can delete `document` while
  another is still running. This is the #1 source of flaky tests in this
  repo.
- **No `test.serial`** for pure logic (matching, data-model, snapshot).
  Concurrent execution is faster and they don't mutate globals.
- **One behavior per test.** Prefer many small tests over a few large ones.

## Pre-publish gate

`npm publish` runs `prepublishOnly` → `preflight`:

```
build → bundle-size:check → test → check-links
```

If any step fails, publish is aborted. Contributors don't publish — the
maintainer does. But `npm run preflight` is the same check, and running it
before a PR is a good idea.

## Communication

- **Issues** — bugs, proposals, questions. No SLA; I respond when I can.
- **PRs** — small, focused, with a test. Large refactors get closed.
- **Discussions** — not enabled yet. Ask in an issue.

## License

MIT. By contributing, you agree your changes are licensed under the same
terms. No CLA, no sign-off — just a PR.
