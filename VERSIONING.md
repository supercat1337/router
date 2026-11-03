# Versioning policy

`@supercat1337/router` follows [SemVer 2.0.0](https://semver.org/), with
the standard `0.x` caveat: while the major version is `0`, **minor
versions may include breaking changes**. This file records the actual
policy so version bumps are predictable, not felt-out.

## Core: `@supercat1337/router`

| Bump  | Meaning                                                                                               |
| :---- | :---------------------------------------------------------------------------------------------------- |
| Patch | Bug fix, doc-only change, internal refactor. No public API change.                                    |
| Minor | New public API (additive). Also, while `0.x`: breaking changes to edge cases (see _Breaking policy_). |
| Major | Breaking changes to the public API — behavior, signatures, required options.                          |

**`1.0.0` is the API freeze.** After `1.0.0`:

- Minor is **strictly additive** — no behavior change, no signature change, no new required options.
- Breaking changes only in Major, with a deprecation cycle (one minor release of warning before removal).

## Breaking policy under `0.x`

`0.x` is allowed to break on minor bumps, but not casually. A "breaking
change" under `0.x` must:

1. Be an **edge case** that is currently ill-defined or actively harmful
   (silent data loss, contract violation, design inconsistency).
2. Be **documented** in the changeset description and `CHANGELOG.md`.
3. Have a **fallback path** in the release notes — what users should do to
   upgrade.

Example: `0.8.0` introduces `MapValidationError('param-duplicate')`. Before
`0.8.0`, `/:id/posts/:id` silently lost the first `id` — a real bug, not a
feature. This is the kind of change that warrants a `0.x` minor break.

A **new feature** that happens to be additive is also a minor bump, but
does not break — e.g. `router.onListenerError` in `0.8.0`.

## Subpaths (`testing`, `ssr`, `scroll`)

Subpaths are part of the core package — same `package.json`, same version.
A subpath's version is **always** the core's version. `npm install
@supercat1337/router@0.8.0` gives you `/testing` at `0.8.0`. No separate
versioning, no separate release.

Subpath-level breaking changes follow the same policy as the core — they
are core-level changes for versioning purposes.

## Ecosystem packages (`router-react`, `router-vue`, `router-devtools`, `router-svelte`, `router-solid`)

Separate repos, separate `package.json`, separate versions. **Not** linked
to the core's version.

Each package declares:

```json
"peerDependencies": {
    "@supercat1337/router": ">=0.7.0 <1.0.0"
}
```

When `@supercat1337/router@1.0.0` ships, ecosystem packages must bump
their peer range (`">=1.0.0 <2.0.0"`) and release a new version — even if
their own code did not change.

When a new core minor releases (e.g. `0.8.0`), ecosystem packages do
**not** need to bump unless they use a new API. `">=0.7.0 <1.0.0"` covers
`0.8.0` — no action needed.

At `1.0.0` (core), all ecosystem packages reset to `1.0.0` for coherence
(users see `router@1.0.0` and `router-react@1.0.0` together). Same at
`2.0.0`. Between majors, versions are independent.

## Deprecation culture

Starting with `1.0.0`, deprecated APIs:

1. Emit a `console.warn` in dev (dev mode only, zero production cost).
2. Stay functional for **at least one minor release** after the warning is
   introduced.
3. Are removed only in a Major release.

Pre-`1.0.0`, deprecations may be replaced directly if the old form is a
documented legacy (e.g. `{ redirect: '/x' }` → `redirect('/x')`). New code
should always use the current form.

## Changesets

All changes that affect the public API, runtime behavior, or the published
`.d.ts` go through `npm run changeset`. This produces a markdown file in
`.changeset/` which:

- is committed alongside the code,
- is consumed at release by `npm run version-packages`,
- becomes the `CHANGELOG.md` entry.

Doc-only changes (`docs/**`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`)
do not require a changeset — they ship with the next version, no changelog
entry.

## Release flow (solo maintainer)

```bash
# 1. Write changes, then a changeset
npm run changeset

# 2. Commit code + changeset
git add . && git commit -m "feat: ..."

# 3. When ready to release:
npm run version-packages        # bumps package.json + writes CHANGELOG.md
git add . && git commit -m "chore: version packages"

# 4. Publish (runs preflight, then npm publish)
npm run publish-packages
```

No CI, no git hooks, no manual version bump. `prepublishOnly → preflight`
is the only hard gate, and it runs locally.
