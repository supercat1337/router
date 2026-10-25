/**
 * Optional `attachLinks` module: delegated click interception for
 * `[data-router-link]` elements. Opt-in; no global side effects on import.
 *
 * @packageDocumentation
 */

/**
 * Attach a single delegated click listener on `document` that intercepts
 * clicks on `[data-router-link]` elements and routes them through the SPA
 * router. `[data-router-link="replace"]` uses `replace`; any other value
 * (including empty) uses `navigate`.
 *
 * Returns a `detach` function. SSR-safe: outside the browser returns a no-op.
 *
 * Accepts structurally — only `adapter`, `navigate`, and `replace` are
 * used. A full `Router` satisfies this type; so does any object with the
 * same three members.
 *
 * @public
 */
export declare function attachLinks(
router: {
    readonly adapter: UrlAdapter;
    navigate(url: string): unknown;
    replace(url: string): unknown;
},
options?: AttachLinksOptions
): () => void;

/**
 * Options for `attachLinks`. `navigate` / `replace` receive an RRU, not an
 * `href`; `attachLinks` normalizes before calling them.
 *
 * @public
 */
export declare interface AttachLinksOptions {
    /** Override for the navigate action. Default: `router.navigate`. */
    navigate?: (rru: string) => unknown;
    /** Override for the replace action. Default: `router.replace`. */
    replace?: (rru: string) => unknown;
}

/**
 * Attach preload-on-hover/focus to `[data-router-link]` elements. When the
 * user hovers or focuses a link, normalizes its `href` and calls
 * `options.preload(leaf)` for the matched leaf node. Intended to warm a
 * user-owned cache that `afterEnter` reads from.
 *
 * Each element preloads at most once (`WeakSet`). Errors from `preload`
 * are swallowed — preload is opportunistic. SSR-safe: outside the browser
 * returns a no-op.
 *
 * @public
 */
export declare function attachPreload(
router: {
    readonly adapter: UrlAdapter;
    getSnapshot(): Snapshot;
},
options?: AttachPreloadOptions
): () => void;

/**
 * Options for `attachPreload`. `preload` receives the matched leaf node —
 * a `Node` (narrow with `isFile` if you need `.name` / `.load`). Return
 * value is ignored; a returned Promise is awaited and its rejection is
 * swallowed (preload is opportunistic).
 *
 * @public
 */
export declare interface AttachPreloadOptions {
    /**
     * Called when the user hovers or focuses a `[data-router-link]`.
     * Receives the matched leaf node. Default:
     * `leaf.preload?.() ?? leaf.load?.()`.
     */
    preload?: (leaf: Node_2) => void | Promise<unknown>;
}

/**
 * Valid children of a `folder` node or of a top-level map.
 *
 * Keys are URL-segment patterns: literal (`[A-Za-z0-9._~-]+`), `:name`,
 * `*`, or the reserved `index`.
 *
 * @public
 */
declare type Children = Record<string, FileNode | FolderNode>;

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
declare interface FileMeta {
    /** Unique route name; used by `url(name)`. */
    name: string;
    /** Optional human-readable title. */
    title?: string;
    /** Optional layout identifier (app-owned). */
    layout?: string;
    /** Application-owned metadata; passed through unchanged. */
    [key: string]: any;
}

/**
 * A leaf node created by `file(meta)`. Branded and frozen; not constructible
 * outside `file()`.
 *
 * @public
 */
declare interface FileNode<M = FileMeta> {
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
declare interface FolderNode<O = FolderOptions, C = Children> {
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
declare interface FolderOptions {
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
declare type MatchResult = {
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
declare type NavigationErrorType = 'invalid-rru' | 'resolver-null' | 'resolver-promise' | 'resolver-throw' | 'resolver-invalid' | 'notFound-promise' | 'notFound-throw' | 'redirect-loop';

/**
 * Either kind of route node.
 *
 * @public
 */
declare type Node_2 = FileNode | FolderNode;

/**
 * Context passed to a `notFound` handler.
 *
 * `chain` contains nodes (not URL prefixes); it is the partial match before
 * the failure and may be empty. `state` is intentionally not provided — the
 * resolver has already run and the map is chosen.
 *
 * @public
 */
declare interface NotFoundContext {
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
declare type NotFoundHandler = (ctx: NotFoundContext) => NotFoundResult;

/**
 * Return value of a `notFound` handler. Can be any render value;
 * `redirect(url)` is a special branded object recognised by `isRedirect`.
 *
 * @public
 */
declare type NotFoundResult = unknown;

/**
 * A router map produced by `createMap`. Immutable; do not construct by hand.
 *
 * `RouteName` is inferred by `createMap` from the data literal; it defaults
 * to `string` for hand-constructed / unknown maps.
 *
 * @public
 */
declare interface RouterMap<RouteName extends string = string> {
    /** Global fallback handler for URLs that match nothing in this map. */
    readonly notFound: NotFoundHandler;
    /**
     * Build a canonical RRU for a named route.
     *
     * @throws {TypeError} when `name` is unknown, a `:name` param is missing
     *   or invalid, or the route is a `*` wildcard.
     */
    url(name: RouteName, params?: Record<string, string>): string;
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
declare interface Snapshot {
    /** Transaction identifier; monotonic; not a history position. */
    readonly navigationId: number;
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
    /** Base directory (path mode) or base pathname (hash mode). */
    readonly base?: string;
}

export { }
