---
'@supercat1337/router': minor
---

Add `router.onListenerError(cb)` — post-construction subscription to listener errors.

The constructor-level `onListenerError` option remains; the new method is additive. Both fire when both are provided. Returns an idempotent unsubscribe. A throwing error listener is reported via `console.error` and does not break navigation.

Motivated by `router-react`'s `useListenerError` hook, which needs post-mount subscription — a hook cannot provide a callback at `createRouter` time.
