// @ts-check

/**
 * Single normalization for RRU. Used by the transaction before matching,
 * before history write, and by `RouterMap.match`. Idempotent.
 *
 * Strips **all** trailing slashes except for the root `/`. Does not
 * percent-decode, does not normalize case, does not touch search, does not
 * touch leading slashes or internal `//`. Empty string stays empty — the
 * caller (transaction) rejects it as invalid RRU.
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeRRU(url) {
    const q = url.indexOf('?');
    const pathname = q >= 0 ? url.slice(0, q) : url;
    const search = q >= 0 ? url.slice(q) : '';
    let stripped = pathname;
    while (stripped.length > 1 && stripped.endsWith('/')) {
        stripped = stripped.slice(0, -1);
    }
    return stripped + search;
}

/**
 * Validity check for Router-relative URLs.
 *
 * A valid RRU starts with `/`, contains no `#`, and is not empty. Form
 * beyond that is not constrained here — trailing slashes, empty segments,
 * and percent-encoding are handled downstream (by `normalizeRRU` and
 * `match`).
 *
 * @internal
 * @param {string} url
 * @returns {boolean}
 */
function isValidRRU(url) {
    if (typeof url !== 'string') return false;
    if (url.length === 0) return false;
    if (!url.startsWith('/')) return false;
    if (url.includes('#')) return false;
    return true;
}

// @ts-check


/**
 * @typedef {import('./types.js').GuardLayer} GuardLayer
 * @typedef {import('./types.js').Guard} Guard
 * @typedef {import('./types.js').GuardErrorType} GuardErrorType
 * @typedef {import('./types.js').Decision} Decision
 * @typedef {import('./types.js').NavResult} NavResult
 * @typedef {import('./types.js').Router} Router
 * @typedef {import('./types.js').UrlAdapter} UrlAdapter
 * @typedef {import('./types.js').Snapshot} Snapshot
 */

/**
 * @typedef {import('./types.js').CreateGuardLayerOptions} CreateGuardLayerOptions
 * @typedef {import('./types.js').OnGuardError} OnGuardError
 */

/**
 * Create an optional async guard layer.
 *
 * The core stays synchronous; guards work over proposals before the router
 * commits. The only integration point into the core is
 * `wrapAdapter(adapter).listen` — for `popstate`, where the browser has
 * already changed the URL and the guards must run before `cb(e)` is fired.
 *
 * Wiring order is mandatory:
 *   1. `const guard = createGuardLayer({...})`
 *   2. `const router = createRouter({ adapter: guard.wrapAdapter(base), ... })`
 *   3. `guard.bind(router)`
 *   4. `const nav = guard.navigate()`
 *   5. `attachLinks(router, { navigate: nav.navigate, replace: nav.replace })`
 *
 * @param {CreateGuardLayerOptions} options
 * @returns {GuardLayer}
 */
function createGuardLayer(options) {
    if (!options || typeof options !== 'object') {
        throw new TypeError('createGuardLayer: options must be an object');
    }

    const guards = options.guards;
    const maxRedirects = options.maxRedirects ?? 10;
    const onError = options.onError;
    const dev = options.dev;

    if (!Array.isArray(guards)) {
        throw new TypeError('createGuardLayer: guards must be an array');
    }
    if (typeof maxRedirects !== 'number' || maxRedirects < 0) {
        throw new TypeError('createGuardLayer: maxRedirects must be a non-negative number');
    }
    if (onError !== undefined && typeof onError !== 'function') {
        throw new TypeError('createGuardLayer: onError must be a function');
    }

    /** @type {any} */
    const runtimeGlobal = globalThis;
    const isDev =
        dev !== undefined ? !!dev : !(runtimeGlobal.process?.env?.NODE_ENV === 'production');

    /** @type {Router | null} */
    let boundRouter = null;
    /** @type {UrlAdapter | null} */
    let wrappedAdapter = null;
    /** @type {AbortController | null} */
    let currentAbort = null;
    /** @type {{ url: string, since: number } | null} */
    let pendingState = null;
    /** Guard is in its synchronous frame — reentrancy window. */
    let syncInGuard = false;

    /**
     * Facade for `ctx.router`. Deliberately lacks `navigate` / `replace` /
     * `revalidate` / `dryMatch`: reentrancy through it is impossible by API.
     * @returns {Pick<Router, "getSnapshot" | "getState" | "isCurrent" | "url">}
     */
    function makeFacade() {
        const r = /** @type {Router} */ (boundRouter);
        return {
            getSnapshot: () => r.getSnapshot(),
            getState: () => r.getState(),
            isCurrent: id => r.isCurrent(id),
            url: (name, params) => r.url(name, params),
        };
    }

    /**
     * @param {unknown} e
     * @returns {boolean}
     */
    function isCancelError(e) {
        if (!(e instanceof Error)) return false;
        return e.name === 'CancelError' || (e.constructor && e.constructor.name === 'CancelError');
    }

    /**
     * Run guards sequentially. Only the synchronous frame of each guard sees
     * `syncInGuard = true`; once the guard awaits, the flag is cleared and
     * concurrent `nav.*` from outside is allowed (last-write-wins).
     *
     * @param {string} url
     * @param {AbortSignal} signal
     * @param {Snapshot} from
     * @returns {Promise<Decision>}
     */
    async function runGuards(url, signal, from) {
        const facade = makeFacade();
        for (const guard of guards) {
            if (signal.aborted) return { block: true };
            /** @type {Decision} */
            let decision;
            syncInGuard = true;
            try {
                const promise = guard({ url, from, signal, router: facade });
                syncInGuard = false;
                decision = await promise;
            } catch (e) {
                syncInGuard = false;
                if (isCancelError(e)) return { block: true };
                onError?.({ type: 'guard-throw', error: e }, { url, from });
                return { block: true };
            }
            if (signal.aborted) return { block: true };
            if (decision !== 'allow') return decision;
        }
        return 'allow';
    }

    /**
     * Walk the guard chain from `startUrl`, following redirects. Aborts any
     * previous in-flight run. Returns the terminal decision.
     *
     * @param {string} startUrl
     * @returns {Promise<
     *   | { decision: 'allow', url: string, hadRedirect: boolean,
     *       redirectPath: string[], aborted: false }
     *   | { decision: 'block', aborted: boolean }
     * >}
     */
    async function runGuardChain(startUrl) {
        if (currentAbort) currentAbort.abort();
        let controller = new AbortController();
        currentAbort = controller;

        const pendingSince = performance.now();
        pendingState = { url: startUrl, since: pendingSince };

        /** @type {string[]} */
        const redirectPath = [];
        let currentUrl = startUrl;
        let hadRedirect = false;

        try {
            for (;;) {
                /* c8 ignore next 3 -- unreachable: no await between `currentAbort = controller`
       and this check, so an external abort cannot interleave. */
                if (controller.signal.aborted) {
                    return { decision: 'block', aborted: true };
                }
                const from = /** @type {Router} */ (boundRouter).getSnapshot();
                const decision = await runGuards(currentUrl, controller.signal, from);
                if (controller.signal.aborted) {
                    return { decision: 'block', aborted: true };
                }

                if (decision === 'allow') {
                    return {
                        decision: 'allow',
                        url: currentUrl,
                        hadRedirect,
                        redirectPath,
                        aborted: false,
                    };
                }

                if (typeof decision === 'object' && decision !== null && 'block' in decision) {
                    return { decision: 'block', aborted: false };
                }

                if (typeof decision === 'object' && decision !== null && 'redirect' in decision) {
                    const target = decision.redirect;
                    if (!isValidRRU(target)) {
                        if (isDev) {
                            throw new TypeError(
                                `guard-layer: invalid redirect target ${JSON.stringify(target)}`
                            );
                        }
                        onError?.({ type: 'invalid-rru', target }, { url: currentUrl, from });
                        return { decision: 'block', aborted: false };
                    }
                    const normalized = normalizeRRU(target);
                    if (redirectPath.length >= maxRedirects || redirectPath.includes(normalized)) {
                        if (isDev) {
                            throw new TypeError(
                                `guard-layer: redirect loop ${redirectPath.join(' → ')}`
                            );
                        }
                        onError?.(
                            {
                                type: 'guard-redirect-loop',
                                path: redirectPath.slice(),
                            },
                            { url: currentUrl, from }
                        );
                        return { decision: 'block', aborted: false };
                    }
                    redirectPath.push(normalized);
                    currentUrl = normalized;
                    hadRedirect = true;
                    pendingState = { url: normalized, since: pendingSince };
                    controller.abort();
                    controller = new AbortController();
                    currentAbort = controller;
                    continue;
                }

                return { decision: 'block', aborted: false };
            }
        } finally {
            pendingState = null;
            if (currentAbort === controller) currentAbort = null;
        }
    }

    /**
     * @param {string} url
     * @param {'navigate' | 'replace'} mode
     * @returns {Promise<NavResult>}
     */
    async function runGuarded(url, mode) {
        if (syncInGuard) {
            if (isDev) {
                throw new TypeError('guard-layer: reentrancy — nav.* called from within a guard');
            }
            onError?.(
                { type: 'reentrancy' },
                {
                    url,
                    from: /** @type {Router} */ (boundRouter).getSnapshot(),
                }
            );
            return { status: 'blocked' };
        }

        const result = await runGuardChain(url);
        if (result.aborted) return { status: 'blocked' };
        if (result.decision === 'block') return { status: 'blocked' };

        const finalMode = result.hadRedirect ? 'replace' : mode;
        const router = /** @type {Router} */ (boundRouter);
        const snapshot =
            finalMode === 'replace' ? router.replace(result.url) : router.navigate(result.url);
        return { status: 'committed', snapshot };
    }

    /**
     * @param {string} targetUrl
     * @param {Snapshot} from
     * @param {any} e
     * @param {(e: any) => void} cb
     * @returns {Promise<void>}
     */
    async function handlePopstateAsync(targetUrl, from, e, cb) {
        const result = await runGuardChain(targetUrl);
        if (result.aborted) return;

        const router = /** @type {Router} */ (boundRouter);
        const wrapped = /** @type {UrlAdapter} */ (wrappedAdapter);

        if (result.decision === 'allow') {
            if (!result.hadRedirect) {
                cb(e);
            } else {
                router.replace(result.url);
            }
            return;
        }

        wrapped.write(from.url, 'replace');
    }

    /**
     * @param {UrlAdapter} adapter
     * @returns {UrlAdapter}
     */
    function wrapAdapter(adapter) {
        wrappedAdapter = {
            base: adapter.base,
            read: () => adapter.read(),
            write: (url, mode) => adapter.write(url, mode),
            normalize: href => adapter.normalize(href),
            listen(cb) {
                return adapter.listen(e => {
                    if (!boundRouter) {
                        cb(e);
                        return;
                    }
                    const from = boundRouter.getSnapshot();
                    const targetUrl = adapter.read();
                    handlePopstateAsync(targetUrl, from, e, cb).catch(err => {
                        onError?.({ type: 'guard-throw', error: err }, { url: targetUrl, from });
                        adapter.write(from.url, 'replace');
                    });
                });
            },
        };
        return wrappedAdapter;
    }

    /**
     * @param {Router} router
     */
    function bind(router) {
        boundRouter = router;
    }

    /**
     * @returns {{
     *   navigate: (url: string) => Promise<NavResult>,
     *   replace: (url: string) => Promise<NavResult>,
     * }}
     */
    function navigate() {
        if (!boundRouter) {
            throw new TypeError('guard.navigate(): bind not called');
        }
        return {
            navigate: url => runGuarded(url, 'navigate'),
            replace: url => runGuarded(url, 'replace'),
        };
    }

    function pending() {
        if (!pendingState) return null;
        return { url: pendingState.url, since: pendingState.since };
    }

    return {
        wrapAdapter,
        bind,
        navigate,
        pending,
    };
}

export { createGuardLayer };
