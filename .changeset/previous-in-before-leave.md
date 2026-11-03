---
'@supercat1337/router': minor
---

`beforeLeave` / `afterLeave` now include `previous: Snapshot | null` —
the last committed snapshot before the current transaction.

Without it, a `beforeLeave` listener cannot know the previous URL:
`router.getSnapshot()` inside the listener already returns the _new_
snapshot (the commit happens before events fire). The only workaround was
a `lastSnapshot` closure — fragile, and easy to get wrong (save under the
new URL, restore the wrong scroll position on back).

```js
router.on('beforeLeave', ({ previous, snapshot }) => {
    if (!previous) return;
    saveUnder(previous.url); // previous.url = where we came from
    // snapshot.url = where we are going
});
```

`previous` is `null` when there is no previous commit. In practice
unreachable for `beforeLeave` — the event only fires when there is a
non-empty leave suffix, which requires a previous chain — but the type is
nullable for consistency with a future `beforeEnter` / `afterEnter`
addition (where it would be `null` on the initial commit).

Additive — existing listeners continue to work unchanged. Existing
`{ suffix, snapshot }` destructuring still compiles.
