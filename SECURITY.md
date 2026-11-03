# Security policy

## Reporting a vulnerability

Email **albert.bazaleev@gmail.com** with:

- a description of the issue,
- the affected version(s),
- a minimal reproduction if possible.

You will receive an acknowledgment within **5 business days** and a status
update within **30 days**. If the issue is confirmed, a fix and a public
advisory are targeted within **90 days** of the initial report. Public
disclosure before that window is not coordinated — please wait.

No bug bounty. Credit in the advisory if you want it.

## Supported versions

Only the latest minor release of the current major receives security
fixes. Under `0.x`, this means the latest `0.x.y` only — backports are not
maintained. Once `1.0.0` ships, the latest `1.x.y` receives fixes; `0.x`
becomes unsupported at that point.

## Attack surface

This package runs in the browser (and in Node.js during SSR) as part of
the application. It does **not** itself make network requests, parse
untrusted HTML, or evaluate user-controlled code. The documented attack
surface is small:

### `globalThis.__SUPERCAT_ROUTER_DEVTOOLS__`

Read by `createRouter` in dev mode (`dev: true`, or `NODE_ENV !== 'production'`).
If a third-party script sets this global **before** `createRouter` runs, it
receives every router instance via `register(router)`. The router has the
full runtime surface (`navigate`, `getSnapshot`, `adapter`, internal
dev-only `getHistory` / `dryMatch`).

**Impact:** a hostile script that already runs on your page can hijack
navigation. This is not a new capability — such a script could call
`history.pushState` or overwrite `router.navigate` directly. The hook is a
**convenience**, not a privilege escalation.

**Mitigation:** the hook is dev-only. `dev: false` (production) never reads
it. Ensure `NODE_ENV=production` (or pass `dev: false`) in builds.

### `history.state` and SSR hydration

`adapter.replaceState(state)` writes arbitrary application state to
`history.state` without validation. `adapter.historyState()` reads it back.
The router does **not** sanitize this state — it is opaque application
data.

**Impact:** if the app reads `history.state` during hydration and injects
it into the DOM without sanitization (e.g. `innerHTML = state.title`), a
malicious value planted before navigation can cause XSS.

**Mitigation:** this is app-level XSS, not router-level — the router never
inserts `history.state` into the DOM. Treat `history.state` like any
other user-controlled data: sanitize before rendering. If you serialize
application state into the HTML for hydration (e.g.
`<script>window.__INITIAL_STATE__ = ...</script>`), follow standard
HTML-escaping practices for the JSON payload.

### `adapter.normalize(href)`

Converts a Browser URL to a Router-relative URL. Returns `null` for
out-of-scope URLs. Does **not** fetch, does not follow redirects, does not
execute anything.

**Impact:** `normalize` is used by `attachLinks` / `attachPreload` /
`attachActiveLinks` to decide whether a click should be intercepted. A
crafted `href` that normalizes to an RRU could trigger a navigation — but
this is the intended behavior (that's what a link is for). No known
escape from the `null` / RRU distinction.

### Guard layer

`@supercat1337/router/guard` runs application-supplied async guards before
commit. **It is not a security boundary.** A user can disable JS, call
`router.navigate()` directly (which bypasses guards), or manipulate the URL
via `history.pushState`. Use server-side access control for anything that
matters.

## Out of scope

- **Application-level bugs.** If your `notFound` handler returns unsanitized
  HTML, that's your XSS, not the router's.
- **Denial of service via redirect loops.** `maxRedirects` (default `10`) limits
  the loop; if you set it very high, a misbehaving `notFound` handler can
  produce a long chain. This is a configuration issue, not a vulnerability.
- **`.d.ts` type-level confusion.** If a type is unsound and allows
  "impossible" values at runtime, that's a bug (report it), not a
  security issue unless it enables remote code execution.
