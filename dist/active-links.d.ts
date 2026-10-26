/**
 * Optional `attachActiveLinks` module: `aria-current` marking for
 * `[data-router-link]` elements. Opt-in; no global side effects on import.
 *
 * @packageDocumentation
 */

/**
 * Attach `aria-current`-marking to `[data-router-link]` elements.
 *
 * On every committed snapshot (via `router.subscribe`), scans the DOM,
 * matches each link's `href` against `snapshot.url`, and sets
 * `aria-current="page"` (customizable via `options.ariaCurrent`) on the
 * matching one. The attribute is removed from non-matching links that
 * previously had it — but only from elements this instance touched.
 *
 * Returns `detach()` — unsubscribes and removes the attribute from any
 * element this instance touched. SSR-safe: outside the browser returns a
 * no-op. `ariaCurrent: false` also returns a no-op.
 *
 * Matching is strict RRU equality (`/profile?tab=1` is not active at
 * `/profile`). The DOM is rescanned on every commit; elements added
 * after the last commit receive `aria-current` on the next commit.
 *
 * @public
 */
export declare function attachActiveLinks(
router: {
    readonly adapter: UrlAdapter;
    getSnapshot(): Snapshot;
    subscribe(listener: (snapshot: Snapshot) => void): () => void;
},
options?: AttachActiveLinksOptions
): () => void;

/**
 * Options for `attachActiveLinks`.
 *
 * @public
 */
export declare interface AttachActiveLinksOptions {
    /**
     * ARIA `current` token applied to the active `[data-router-link]`.
     * Default `'page'`.
     *
     * - `false` — disable the module entirely (no-op `attach`).
     * - `true` — sets `aria-current="true"` (valid generic token).
     * - `'page' | 'step' | 'location' | 'date' | 'time'` — token as-is.
     *
     * @see https://www.w3.org/TR/wai-aria-1.2/#aria-current
     */
    ariaCurrent?: boolean | 'page' | 'step' | 'location' | 'date' | 'time';
}

/**
 * Valid children of a `folder` node or of a top-level map.
 *
 * Keys are URL-segment patterns: literal (`[A-Za-z0-9._~-]+`), `:name`,
 * `*`, or the reserved `index`.
 *
 * @public
 */
export declare type Children = Record<string, FileNode | FolderNode>;

declare const FILE_BRAND: unique symbol;

/**
 * Metadata for a `file` node.
 *
 * `name` is required and must be unique within a map; it is the key used
 * by `RouterMap.url(name)`. Additional app-owned metadata travels with the
 * node unchanged.
 *
 * @public
 */
export declare interface FileMeta {
    /** Unique route name; used by `url(name)`. */
    name: string;
    /** Optional human-readable title. */
    title?: string;
    /** Optional layout identifier (app-owned). */
    layout?: string;
    /**
     * View module loader — called by the user's `afterEnter` for code
     * splitting and, on hover/focus, by `attachPreload`'s default
     * `preload`. Must be signal-free: `import()` does not accept an
     * `AbortSignal`. Not validated at construction — `file()` trusts
     * the caller.
     */
    load?: () => Promise<unknown>;
    /**
     * Preload hook — called by `attachPreload` (and by user code that
     * follows the same convention) with a `PreloadContext`.
     * `ctx.signal` aborts on `attachPreload(...)` detach; forward it
     * to cancellable work. Not validated at construction.
     */
    preload?: (ctx: PreloadContext) => void | Promise<unknown>;
    /** Application-owned metadata; passed through unchanged. */
    [key: string]: any;
}

/**
 * A leaf node created by `file(meta)`. Branded and frozen; not constructible
 * outside `file()`.
 *
 * @public
 */
export declare interface FileNode<M = FileMeta> {
    /** Phantom brand; runtime check via `isFile`. */
    readonly [FILE_BRAND]: true;
    /** Unique route name; used by `RouterMap.url(name)`. */
    readonly name: string;
    /** Optional human-readable title. */
    readonly title?: string;
    /** Optional layout identifier (app-owned). */
    readonly layout?: string;
    /** Application-owned metadata; passed through unchanged. */
    readonly [key: string]: any;
}

declare const FOLDER_BRAND: unique symbol;

/**
 * An interior node created by `folder(children, options?)`. Branded and
 * frozen; not constructible outside `folder()`.
 *
 * @public
 */
export declare interface FolderNode<O = FolderOptions, C = Children> {
    /** Phantom brand; runtime check via `isFolder`. */
    readonly [FOLDER_BRAND]: true;
    /** Optional fallback handler for this subtree. */
    readonly notFound?: NotFoundHandler;
    /** Child nodes keyed by URL-segment pattern. */
    readonly children: Readonly<C>;
}

/**
 * Options for a `folder` node.
 *
 * @public
 */
export declare interface FolderOptions {
    /**
     * Handler for "nothing in this subtree matched". Optional; when omitted,
     * the nearest ancestor with a `notFound` handles the miss, up to
     * `RouterMap.notFound`.
     */
    notFound?: NotFoundHandler;
    /** Application-owned metadata; passed through unchanged. */
    [key: string]: any;
}

/**
 * Options for `adapter.href()`.
 *
 * @public
 */
export declare interface HrefOptions {
    /**
     * Search string including leading `?`, or `''` for none. Only used by
     * hash-mode adapters (path-mode RRUs already carry search). When omitted,
     * hash mode reads `location.search`; in SSR this is `''`.
     */
    search?: string;
}

/**
 * Result of `RouterMap.match`. Always one of the two branches; never `null`.
 *
 * `params` is decoded (matched only). `partialParams` is decoded along the
 * partial chain (notFound only); it is the source of values for
 * `urlPrefix(:name)` during chain comparison.
 *
 * `search` is the parsed query string (decoded). Duplicate keys keep the
 * last value; use `URLSearchParams` directly for multi-value queries.
 *
 * @public
 */
export declare type MatchResult = {
    /** The URL matched a leaf. */
    status: 'matched';
    /** Full chain from root to leaf. */
    chain: Node_2[];
    /** Decoded `:name` params. */
    params: Record<string, string>;
    /** Decoded query params. */
    search: Record<string, string>;
    /** `normalizeRRU(input)`. */
    url: string;
} | {
    /** The URL matched nothing in this map. */
    status: 'notFound';
    /** Partial chain of matched nodes; may be empty. */
    chain: Node_2[];
    /** Decoded params along `chain`. */
    partialParams: Record<string, string>;
    /** Decoded query params. */
    search: Record<string, string>;
    /** Handler to invoke (nearest folder or map). */
    handler: NotFoundHandler;
    /** `normalizeRRU(input)`. */
    url: string;
};

/**
 * Diagnostic types for contract violations. Emitted through
 * `navigationError` (prod) or thrown (dev). Not navigation outcomes.
 *
 * `reentrancy` is intentionally absent; that is a `GuardErrorType` in the
 * optional guard layer, not a core event.
 *
 * @public
 */
export declare type NavigationErrorType = 'invalid-rru' | 'resolver-null' | 'resolver-promise' | 'resolver-throw' | 'resolver-invalid' | 'notFound-promise' | 'notFound-throw' | 'redirect-loop';

/**
 * How the transaction that produced a `Snapshot` was initiated.
 *
 * - `'initial'` — the first commit inside `createRouter`.
 * - `'push'` — `router.navigate(...)`.
 * - `'replace'` — `router.replace(...)`.
 * - `'pop'` — a `popstate` / `hashchange` from the browser (back / forward).
 * - `'revalidate'` — `router.revalidate()` (recomputes the active map
 *   without moving the browser URL).
 *
 * `navigationType` describes **what triggered** the commit, not a history
 * position. It is not a direction indicator: a guard that redirects during
 * a `popstate` commits via `router.replace(...)`, so `navigationType` is
 * `'replace'`, not `'pop'`. For back/forward direction, track
 * `history.state` yourself or use a companion adapter — `Snapshot` stays
 * a pure function of `(state, url)` plus the transaction source.
 *
 * @public
 */
declare type NavigationType_2 = 'initial' | 'push' | 'replace' | 'pop' | 'revalidate';
export { NavigationType_2 as NavigationType }

/**
 * Either kind of route node.
 *
 * @public
 */
declare type Node_2 = FileNode | FolderNode;
export { Node_2 as Node }

/**
 * Context passed to a `notFound` handler.
 *
 * `chain` contains nodes (not URL prefixes); it is the partial match before
 * the failure and may be empty. `state` is intentionally not provided — the
 * resolver has already run and the map is chosen.
 *
 * @public
 */
export declare interface NotFoundContext {
    /** Router-relative URL that failed to match. */
    readonly url: string;
    /** Partial chain of matched nodes; may be empty. */
    readonly chain: readonly Node_2[];
    /** Decoded query params of the URL that failed to match. */
    readonly search: Readonly<Record<string, string>>;
    /** Decoded path params along `chain`. */
    readonly partialParams: Readonly<Record<string, string>>;
}

/**
 * Signature of a `notFound` handler. Must be synchronous; returning a
 * Promise is a contract violation diagnosed as `notFound-promise`.
 *
 * @public
 */
export declare type NotFoundHandler = (ctx: NotFoundContext) => NotFoundResult;

/**
 * Return value of a `notFound` handler. Can be any render value;
 * `redirect(url)` is a special branded object recognised by `isRedirect`.
 *
 * @public
 */
export declare type NotFoundResult = unknown;

/**
 * Argument tuple for `url(...)` and `Route.url(...)`.
 *
 * - `Record<string, string>` (unparameterized map, fallback): `[params?]` — optional.
 * - `{}` (route without `:name`): `[params?]` — optional.
 * - `{ id: string }` (route with params): `[params]` — **required**.
 *
 * Rest-of-single-tuple is used so callers can spread `...args` without
 * a `[] | [P]` union — TS treats this as "0 or 1 argument" cleanly.
 *
 * @public
 */
export declare type ParamsArgs<P extends Record<string, string>> = string extends keyof P ? [params?: Record<string, string>] : [keyof P] extends [never] ? [params?: Record<string, string>] : [params: P];

/**
 * Context passed to a preload function.
 *
 * `signal` aborts when `attachPreload(...)` is detached. Forward it to
 * any cancellable work (`fetch`, custom loaders). It is not tied to a
 * navigation transaction — abort happens on detach only.
 *
 * @public
 */
export declare interface PreloadContext {
    /** Aborts when `attachPreload(...)` is detached. */
    readonly signal: AbortSignal;
}

/**
 * A handle to a single named route inside a `RouterMap`.
 *
 * `Route` is immutable, branded (`isRoute`), and cached per `RouterMap` —
 * `map.route(name) === map.route(name)`.
 *
 * **Do not store a `Route` across map boundaries.** When the active map
 * changes (auth, tenant, feature flag), routes of the previous map may
 * not exist in the new one — call `router.route(name)` again to get a
 * handle bound to the current map.
 *
 * @public
 */
export declare interface Route<N extends string = string, P extends Record<string, string> = Record<string, string>> {
    /** Route name; the key used by `RouterMap.url(name)`. */
    readonly name: N;
    /**
     * `:name` parameter keys extracted from the tree, in path order.
     * Empty for routes without params.
     */
    readonly params: readonly (keyof P & string)[];
    /**
     * Build the canonical RRU for this route.
     *
     * @throws {TypeError} when a `:name` param is missing or invalid.
     */
    url(...args: ParamsArgs<P>): string;
}

/**
 * Extract params for a specific route name from a `RouterMap`.
 * Falls back to `Record<string, string>` for hand-built / unparameterized maps.
 *
 * @public
 */
export declare type RouteParamsOf<R, N extends string> = R extends RouterMap<any, infer P> ? N extends keyof P ? P[N] : Record<string, string> : Record<string, string>;

/**
 * A router map produced by `createMap`. Immutable; do not construct by hand.
 *
 * `RouteName` is inferred by `createMap` from the data literal; it defaults
 * to `string` for hand-constructed / unknown maps.
 *
 * @public
 */
export declare interface RouterMap<RouteName extends string = string, ParamsMap extends Record<string, Record<string, string>> = Record<string, Record<string, string>>> {
    /**
     * Global fallback handler for URLs that match nothing in this map.
     * Used when no folder along the partial chain provides its own
     * `notFound`.
     */
    readonly notFound: NotFoundHandler;
    /**
     * Build a canonical RRU for a named route.
     *
     * @throws {TypeError} when `name` is unknown, a `:name` param is
     *   missing or invalid, or the route is a `*` wildcard.
     */
    url<N extends RouteName>(name: N, ...args: ParamsArgs<RouteParamsOf<this, N>>): string;
    /**
     * Handle to a named route. Cached — the same object is returned for
     * repeated calls with the same name.
     *
     * @throws {TypeError} when `name` is unknown or the route is a `*`
     *   wildcard.
     */
    route<N extends RouteName>(name: N): Route<N, RouteParamsOf<this, N>>;
    /**
     * Match a **normalized** RRU against this map. Caller must call
     * `normalizeRRU(url)` first; behavior on non-normalized input is
     * undefined.
     */
    match(url: string): MatchResult;
}

/**
 * The committed state of the router after a transaction.
 *
 * `url` is a Router-relative URL (RRU), not `location.pathname + search`.
 * `map` is always a `RouterMap`; on error it points to the previous
 * committed map. `chain` on error also points to the previous committed
 * chain (never the partial chain of the failed attempt); diagnostic
 * partial data lives under `error.partialChain` / `error.partialParams`.
 *
 * The snapshot is deeply frozen at runtime (except `notFoundResult` and
 * `error.error`, which are app-owned).
 *
 * @public
 */
export declare interface Snapshot {
    /** Transaction identifier; monotonic; not a history position. */
    readonly navigationId: number;
    /**
     * How the transaction that produced this snapshot was initiated.
     * Not a history position and not a direction — see `NavigationType`.
     */
    readonly navigationType: NavigationType_2;
    /** The committed map; on error, the previous committed map. */
    readonly map: RouterMap;
    /** Outcome of the transaction. */
    readonly status: 'matched' | 'notFound' | 'error';
    /** Full chain (matched), partial chain (notFound), prev chain (error). */
    readonly chain: readonly Node_2[];
    /** Decoded params; `{}` unless `status === 'matched'`. */
    readonly params: Readonly<Record<string, string>>;
    /**
     * Decoded params along `chain`. `{}` for matched,
     * `matchResult.partialParams` for notFound, `chainParams(prev)` for
     * error. Source for `urlPrefix(:name)` in chain comparison.
     */
    readonly partialParams: Readonly<Record<string, string>>;
    /**
     * Decoded query params. For matched/notFound — parsed from the committed
     * URL. For error — inherited from the previous committed snapshot
     * (consistent with `chain` / `map` / `leaf`).
     */
    readonly search: Readonly<Record<string, string>>;
    /** RRU at commit time: `normalizeRRU(adapter.read())`. */
    readonly url: string;
    /**
     * The URL that triggered a `redirect()` chain, if any. On a successful
     * redirect, `redirectedFrom` is the **original** requested URL (not the
     * target). For multi-hop chains (`/a → /b → /c`), it is the first URL
     * (`/a`); the internal redirect path is available via the dev-only
     * `getRedirectPath()`. Absent when there was no redirect. Never set on
     * error snapshots — use `snapshot.error.path` for `redirect-loop`.
     */
    readonly redirectedFrom?: string;
    /**
     * Last element of `chain`; `undefined` when `chain` is empty
     * (notFound/error at the root). Convenience for the common
     * `snapshot.chain[snapshot.chain.length - 1]` pattern.
     */
    readonly leaf: Node_2 | undefined;
    /** Render value returned by the `notFound` handler; only for notFound. */
    readonly notFoundResult?: unknown;
    /** Diagnostic payload; only for `status === 'error'`. */
    readonly error?: {
        /** Diagnostic type. */
        readonly type: NavigationErrorType;
        /** Original exception for `resolver-throw` / `notFound-throw`; else undefined. */
        readonly error: unknown;
        /** RRU for most types; raw input for `invalid-rru` (input). */
        readonly attemptedUrl: string;
        /** `redirectPath` (normalized RRUs) for `redirect-loop`. */
        readonly path?: readonly string[];
        /** Partial chain of the last LOOP iteration (diagnostic). */
        readonly partialChain: readonly Node_2[];
        /** Decoded params along `partialChain`. */
        readonly partialParams: Readonly<Record<string, string>>;
    };
}

/**
 * The only layer that knows about Browser URLs (BU). The core works in
 * Router-relative URLs (RRU). `read()` must return a valid RRU (starts
 * with `/`, no `#`, non-empty).
 *
 * @public
 */
export declare interface UrlAdapter {
    /** Current RRU. Valid: starts with `/`, no `#`, non-empty. */
    read(): string;
    /** Write RRU to BU. `mode` = push or replace. */
    write(url: string, mode: 'push' | 'replace'): void;
    /** Subscribe to BU changes; returns an unsubscribe. */
    listen(cb: (event: PopStateEvent | HashChangeEvent) => void): () => void;
    /** BU or href → RRU. `null` — not a router URL; let the browser handle it. */
    normalize(href: string): string | null;
    /**
     * Build a Browser URL (BU) from an RRU. Required — used by `<Link>`
     * components and SSR. Path mode: `base + rru.slice(1)`. Hash mode:
     * `base + search + '#' + rru`, where `search` defaults to
     * `location.search` and can be overridden via `opts.search` (SSR).
     *
     * @throws {TypeError} if `rru` does not start with `/`.
     */
    href(rru: string, opts?: HrefOptions): string;
    /**
     * Read `history.state` (or adapter equivalent). Optional — for
     * scroll restoration. Returns `null` when unavailable (SSR, non-browser
     * contexts, adapters that do not track history state).
     */
    historyState(): unknown;
    /**
     * Replace `history.state` **without changing the URL**. Optional —
     * for scroll restoration and app-level per-history-entry state.
     */
    replaceState(state: unknown): void;
    /** Base directory (path mode) or base pathname (hash mode). */
    readonly base?: string;
}

export { }
