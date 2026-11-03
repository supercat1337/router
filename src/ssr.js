// @ts-check

/**
 * Server-side `UrlAdapter` and SSR hydration helpers. Opt-in subpath —
 * `@supercat1337/router/ssr`. The core router is already SSR-ready (the
 * initial transaction runs on the server); this module covers the four
 * things every SSR app needs on top:
 *
 * 1. `createServerAdapter(req)` — read the request URL instead of `'/'`
 * 2. `serializeState(state)` — XSS-safe JSON for `<script>` embedding
 * 3. `readInitialState()` — read the serialized state on the client
 * 4. `assertHydration(serverSnapshot, router)` — dev check for mismatch
 *
 * Async data loading before render is **not** covered here — it is
 * app-specific. See `docs/recipes/ssr-hydration.md`.
 *
 * @packageDocumentation
 */

/**
 * @typedef {import('./types.js').UrlAdapter} UrlAdapter
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').Router} Router
 */

/**
 * @typedef {object} ServerRequest
 * @property {string} [url] - `req.url` from Node.js (path + search)
 * @property {string} [originalUrl] - Express-specific; full path including mount base. Takes precedence over `url` if present.
 */

/**
 * @typedef {object} CreateServerAdapterOptions
 * @property {string} [base] - app mount prefix. Default `'/'`. Same semantics as `createPathAdapter({ base })`.
 */

/**
 * @typedef {Pick<Snapshot, 'url' | 'status' | 'params' | 'search'>} HydrationSnapshot
 */

/**
 * @typedef {object} AssertHydrationOptions
 * @property {boolean} [dev] - when `false`, no-op. Default: `NODE_ENV !== 'production'`.
 * @property {boolean} [throw] - throw instead of `console.warn`. Default `false`.
 */

/**
 * @internal
 * @param {string} base
 * @returns {string}
 */
function validateBase(base) {
    if (typeof base !== 'string' || !base.startsWith('/')) {
        throw new TypeError(
            "adapter.base must be a pathname starting with '/', got " + JSON.stringify(base)
        );
    }
    if (base.includes('?') || base.includes('#')) {
        throw new TypeError("adapter.base must not contain '?' or '#'");
    }
    return base.endsWith('/') ? base : base + '/';
}

/**
 * Create a server-side `UrlAdapter` that reads from `req.url` (or
 * `req.originalUrl`) instead of `location`.
 *
 * Without this, `createPathAdapter().read()` returns `'/'` in SSR
 * (documented in `docs/ssr.md`), and the initial snapshot commits `/`
 * regardless of the request URL. `createServerAdapter` makes the initial
 * snapshot reflect the request — no extra `router.navigate(req.url)` call,
 * `navigationType: 'initial'` stays correct.
 *
 * `write` / `listen` / `replaceState` are no-ops — there is no history on
 * the server. `normalize` returns `null` — `attachLinks` is a no-op in SSR;
 * comparing a URL without `location` is undefined behaviour.
 *
 * **Do not use this adapter on the client.** It reads `req.url`, which does
 * not exist in the browser. Use `createPathAdapter` / `createHashAdapter`
 * on the client.
 *
 * @public
 * @param {ServerRequest} req
 * @param {CreateServerAdapterOptions} [opts]
 * @returns {UrlAdapter}
 */
export function createServerAdapter(req, opts = {}) {
    if (!req || typeof req !== 'object') {
        throw new TypeError('createServerAdapter: req must be an object');
    }

    const rawUrl = req.originalUrl ?? req.url;
    if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/')) {
        throw new TypeError(
            'createServerAdapter: req.url must be a pathname starting with /, got ' +
                JSON.stringify(rawUrl)
        );
    }

    const resolvedBase = validateBase(opts.base ?? '/');
    const parsed = new URL(rawUrl, 'http://localhost');
    const pathname = parsed.pathname;
    const search = parsed.search;

    /** @type {string} */
    let rru;
    if (!pathname.startsWith(resolvedBase)) {
        rru = '/';
    } else {
        rru = '/' + pathname.slice(resolvedBase.length) + search;
        // Defensive — `URL.pathname` and `URL.search` never contain '#',
        // but mirrors the path adapter's contract.
        if (rru.includes('#')) {
            rru = '/';
        }
    }

    return {
        base: resolvedBase,

        read() {
            return rru;
        },

        write(_url, _mode) {
            // No history on the server.
        },

        listen(_cb) {
            return () => {};
        },

        normalize(_href) {
            // `attachLinks` is a no-op in SSR — comparing a URL without
            // `location` is undefined behaviour. Return null (meaning
            // "not a router URL — let the caller handle it").
            return null;
        },

        href(rru, _opts) {
            if (typeof rru !== 'string' || !rru.startsWith('/')) {
                throw new TypeError(
                    "adapter.href: expected RRU starting with '/', got " + JSON.stringify(rru)
                );
            }
            return resolvedBase + rru.slice(1);
        },

        historyState() {
            return null;
        },

        replaceState(_state) {
            // No history on the server.
        },
    };
}

/**
 * XSS-safe JSON serialization for embedding in an HTML `<script>` tag.
 *
 * `JSON.stringify` alone is unsafe — a `</script>` in the payload closes
 * the script tag early, and `<!--` opens an HTML comment. `\u2028` and
 * `\u2029` (line / paragraph separators) are legal in JSON strings but
 * break JS parsing in older engines.
 *
 * This function escapes the six problematic sequences. The output is a
 * valid JS expression when embedded inside a `<script>` tag and parsed as
 * JSON. Round-trips with `JSON.parse` unchanged.
 *
 * @public
 * @param {unknown} state
 * @returns {string}
 */
export function serializeState(state) {
    const json = JSON.stringify(state);
    if (json === undefined) {
        throw new TypeError('serializeState: state is not JSON-serializable');
    }
    return json
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

/**
 * Read the state serialized by `serializeState` on the client. Reads from
 * `globalThis.__INITIAL_STATE__`, the conventional key for the embedded
 * script. Returns `null` outside the browser or when the key is unset.
 *
 * @public
 * @template T
 * @returns {T | null}
 */
export function readInitialState() {
    if (typeof window === 'undefined') {
        return null;
    }
    const state = /** @type {any} */ (window).__INITIAL_STATE__;
    return state === undefined ? null : state;
}

/**
 * Dev-only hydration check. Compares the server's initial snapshot with
 * the client router's committed snapshot. A mismatch means `resolveMap` or
 * `getState` produced different results on the two sides — the app will
 * render different content than the server sent, and hydration will fail
 * (React 18 logs a warning and discards server HTML; Vue 3 does the same).
 *
 * Only four fields are compared: `url`, `status`, `params`, `search`. Chain
 * and map are not compared — they contain different object identities on
 * server and client; structural equality is not meaningful.
 *
 * No-op in prod (`NODE_ENV === 'production'` or `options.dev === false`).
 * With `options.throw: true`, throws instead of `console.warn`.
 *
 * @public
 * @param {HydrationSnapshot} serverSnapshot
 * @param {Router} router
 * @param {AssertHydrationOptions} [options]
 * @returns {void}
 */
export function assertHydration(serverSnapshot, router, options = {}) {
    /** @type {any} */
    const runtimeGlobal = globalThis;
    const isProd =
        options.dev === false ||
        (options.dev === undefined && runtimeGlobal.process?.env?.NODE_ENV === 'production');
    if (isProd) {
        return;
    }

    if (!serverSnapshot || typeof serverSnapshot !== 'object') {
        throw new TypeError('assertHydration: serverSnapshot must be an object');
    }
    if (!router || typeof router.getSnapshot !== 'function') {
        throw new TypeError('assertHydration: router must be a Router');
    }

    const clientSnapshot = router.getSnapshot();
    /** @type {string[]} */
    const problems = [];

    if (serverSnapshot.url !== clientSnapshot.url) {
        problems.push(
            `url: server ${JSON.stringify(serverSnapshot.url)}, client ${JSON.stringify(
                clientSnapshot.url
            )}`
        );
    }
    if (serverSnapshot.status !== clientSnapshot.status) {
        problems.push(
            `status: server ${JSON.stringify(serverSnapshot.status)}, client ${JSON.stringify(
                clientSnapshot.status
            )}`
        );
    }
    const sParams = JSON.stringify(serverSnapshot.params);
    const cParams = JSON.stringify(clientSnapshot.params);
    if (sParams !== cParams) {
        problems.push(`params: server ${sParams}, client ${cParams}`);
    }
    const sSearch = JSON.stringify(serverSnapshot.search);
    const cSearch = JSON.stringify(clientSnapshot.search);
    if (sSearch !== cSearch) {
        problems.push(`search: server ${sSearch}, client ${cSearch}`);
    }

    if (problems.length === 0) {
        return;
    }

    const message =
        'SSR hydration mismatch — the client router produced a different snapshot than the server.\n' +
        problems.map(p => '  • ' + p).join('\n') +
        '\n  Usually caused by `resolveMap` or `getState` returning different data\n' +
        '  on server and client. See `docs/recipes/ssr-hydration.md`.';

    if (options.throw) {
        throw new Error(message);
    }
    if (typeof console !== 'undefined' && console.warn) {
        console.warn(message);
    }
}
