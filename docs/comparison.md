# Comparison with other routers

| Feature                          | `@supercat1337/router`                                | TanStack Router (React) | React Router v7 (React) | Vue Router (Vue) |
| :------------------------------- | :---------------------------------------------------- | :---------------------- | :---------------------- | :--------------- |
| Framework-agnostic               | ✅                                                    | ❌                      | ❌                      | ❌               |
| Synchronous navigation           | ✅                                                    | ❌                      | ❌                      | ❌               |
| State-relative maps              | ✅                                                    | ❌                      | ❌                      | ❌               |
| Typed route names                | ✅ `RouteNames<T>`                                    | ✅ full inference       | ⚠️ partial              | ⚠️ partial       |
| Typed params                     | ⚠️ `{ [N]: Record<string, string> }` per route (0.6+) | ✅ full inference       | ⚠️ partial              | ⚠️ partial       |
| Built-in loaders / cache         | ❌ (write in `afterEnter`)                            | ✅                      | ✅ (v7)                 | ⚠️ guards        |
| Built-in code splitting          | ❌                                                    | ✅                      | ✅                      | ✅               |
| Cancellation in guards           | ✅ `AbortSignal`                                      | ⚠️ via redirect only    | ❌                      | ❌               |
| Framework subscription hook      | ✅ `router.subscribe`                                 | ✅                      | ✅                      | ✅               |
| Scroll restoration / transitions | ❌ (app responsibility)                               | ⚠️ partial              | ✅                      | ✅               |
| Ecosystem / third-party          | ⚠️ small                                              | ✅ large                | ✅ very large           | ✅ very large    |
| Bun / Deno / Node native         | ✅ ESM, zero deps                                     | ✅                      | ✅                      | ⚠️ Vue runtime   |
| SSR                              | ✅ (synchronous core)                                 | ✅                      | ✅                      | ✅               |

## Choose `@supercat1337/router` if…

- You need **framework-agnostic** routing with a synchronous core.
- You're building a **state-relative** app — multiple auth / tenant / feature-flag contexts are first-class.
- You're prepared to write ~30–50 lines of glue per framework (`router.subscribe` + `getSnapshot`).
- You value **predictable, synchronous commit** over built-in loaders and code splitting.

## Choose TanStack Router if…

- You're on React and want typed params + loaders + guards with the least code.
- You need built-in **code splitting and loader cache** in the core.
- You want **full inference** on route params, not just route names.

## Choose React Router v7 / Vue Router if…

- You're on React / Vue and want a large ecosystem and third-party integrations.
- You don't mind **async navigation** (loaders / suspense).
- You want **built-in scroll restoration, transitions, and framework-specific ergonomics** (`useParams`, `<Link to>`, `useLoaderData`).

## What `@supercat1337/router` trades away

| Feature                                 | Why it's absent                                                                                      |
| :-------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| Built-in loaders                        | Would break synchronous commit. Write in `afterEnter` (see [data loading](recipes/data-loading.md)). |
| Lazy route tree                         | Would break `resolveMap` sync contract. Use `file({ load })` + `afterEnter`.                         |
| Framework hooks (`useParams`, `<Link>`) | Framework-agnostic core. Write ~30–50 lines of glue per framework.                                   |
| Scroll restoration                      | Deliberately app responsibility — the router doesn't own DOM.                                        |
| Cross-map redirects                     | Violates state-relative model. Use `resolveMap` or guards.                                           |
| Global route registry                   | Multiple maps are the intended pattern.                                                              |

These are **non-goals**, not missing features. If you need them, TanStack Router (React) or Vue Router (Vue) is the better fit.

## See also

- [`README.md`](../README.md) — the short "Why this router" table.
- [When NOT to use this router](../README.md#when-not-to-use-this-router) — the honest self-assessment.
- [`AGENTS.md`](../AGENTS.md) — non-goals table for AI assistants.
