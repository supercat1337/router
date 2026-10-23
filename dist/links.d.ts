/**
 * Optional `attachLinks` module: delegated click interception for
 * `[data-router-link]` elements. Opt-in; no global side effects on import.
 *
 * @packageDocumentation
 */

export declare function attachLinks(
router: Router,
options?: AttachLinksOptions
): () => void;

/**
 * Options for `attachLinks`. `navigate` / `replace` receive an RRU, not an
 * `href`; `attachLinks` normalizes before calling them.
 *
 * @public
 */
declare interface AttachLinksOptions {
    /** Override for the navigate action. Default: `router.navigate`. */
    navigate?: (rru: string) => unknown;
    /** Override for the replace action. Default: `router.replace`. */
    replace?: (rru: string) => unknown;
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

/**
 * Payloads of all router events. All include `snapshot`.
 *
 * `suffix` is the divergent chain suffix in top-down order (root-most →
 * leaf), the same order as `chain`. "Bottom-up" / "top-down" is a
 * recommendation to the listener; it does not reorder the array.
 *
 * @public
 */
declare interface EventPayloads {
    /** Fires once per transaction, before `afterLeave`. Suffix = divergent tail. */
    beforeLeave: {
        suffix: Node_2[];
        snapshot: Snapshot;
    };
    /** Fires once per transaction, after `beforeLeave`. */
    afterLeave: {
        suffix: Node_2[];
        snapshot: Snapshot;
    };
    /** Fires once per transaction, before `afterEnter`. */
    beforeEnter: {
        suffix: Node_2[];
        snapshot: Snapshot;
    };
    /** Fires once per transaction, after `beforeEnter`. */
    afterEnter: {
        suffix: Node_2[];
        snapshot: Snapshot;
    };
    /** Fires before `mapChanged`; opens the leave phase. */
    mapWillChange: {
        oldMap: RouterMap;
        newMap: RouterMap;
        snapshot: Snapshot;
    };
    /** Fires after `mapWillChange` and `afterLeave`; closes leave, opens enter. */
    mapChanged: {
        oldMap: RouterMap;
        newMap: RouterMap;
        snapshot: Snapshot;
    };
    /** Fires on contract-violation errors in prod (throws in dev). */
    navigationError: {
        /** Diagnostic type. */
        type: NavigationErrorType;
        /** Original exception for resolver/notFound throws. */
        error: unknown;
        /** RRU or raw input (for `invalid-rru`). */
        attemptedUrl: string;
        /** `redirectPath` (normalized RRUs) for `redirect-loop`. */
        path?: string[];
        /** Error snapshot (`status: 'error'`). */
        snapshot: Snapshot;
    };
}

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
 * An interior node created by `folder(options, children)`. Branded and
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
 * @public
 */
declare type MatchResult = {
    /** The URL matched a leaf. */
    status: 'matched';
    /** Full chain from root to leaf. */
    chain: Node_2[];
    /** Decoded `:name` params. */
    params: Record<string, string>;
    /** `normalizeRRU(input)`. */
    url: string;
} | {
    /** The URL matched nothing in this map. */
    status: 'notFound';
    /** Partial chain of matched nodes; may be empty. */
    chain: Node_2[];
    /** Decoded params along `chain`. */
    partialParams: Record<string, string>;
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
    url: string;
    /** Partial chain of matched nodes; may be empty. */
    chain: Node_2[];
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
 * The router instance produced by `createRouter`.
 *
 * `navigate` / `replace` do not throw on navigation outcomes
 * (`matched` / `notFound` / `error`) — they return a `Snapshot`. Contract
 * violations (dev) throw; in prod they return an error snapshot.
 *
 * @public
 */
declare interface Router {
    /** The URL adapter passed to `createRouter`. */
    readonly adapter: UrlAdapter;
    /** New transaction, history push. */
    navigate(url: string): Snapshot;
    /** New transaction, history replace. */
    replace(url: string): Snapshot;
    /** Recompute the current RRU. Always increments `navigationId`. */
    revalidate(): Snapshot;
    /** History back (delegates to `history.back`). */
    back(): void;
    /** History forward (delegates to `history.forward`). */
    forward(): void;
    /** Delegates to the active map's `url`. */
    url(name: string, params?: Record<string, string>): string;
    /** The most recently committed snapshot. */
    getSnapshot(): Snapshot;
    /** The application state getter passed to `createRouter`. */
    getState(): any;
    /** `getSnapshot().navigationId === id`. */
    isCurrent(navigationId: number): boolean;
    /** Subscribe to an event. Returns an idempotent unsubscribe. */
    on<E extends keyof EventPayloads>(event: E, listener: (payload: EventPayloads[E]) => void): () => void;
    /** Remove a listener by identity. No-op if not found. */
    off<E extends keyof EventPayloads>(event: E, listener: (payload: EventPayloads[E]) => void): void;
    /** Subscribe for a single emit. Returns an idempotent unsubscribe. */
    once<E extends keyof EventPayloads>(event: E, listener: (payload: EventPayloads[E]) => void): () => void;
}

/**
 * A router map produced by `createMap`. Immutable; do not construct by hand.
 *
 * @public
 */
declare interface RouterMap {
    /** Global fallback handler for URLs that match nothing in this map. */
    readonly notFound: NotFoundHandler;
    /**
     * Build a canonical RRU for a named route.
     *
     * @throws {TypeError} when `name` is unknown, a `:name` param is missing
     *   or invalid, or the route is a `*` wildcard.
     */
    url(name: string, params?: Record<string, string>): string;
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
 * @public
 */
declare interface Snapshot {
    /** Transaction identifier; monotonic; not a history position. */
    navigationId: number;
    /** The committed map; on error, the previous committed map. */
    map: RouterMap;
    /** Outcome of the transaction. */
    status: 'matched' | 'notFound' | 'error';
    /** Full chain (matched), partial chain (notFound), prev chain (error). */
    chain: Node_2[];
    /** Decoded params; `{}` unless `status === 'matched'`. */
    params: Record<string, string>;
    /**
     * Decoded params along `chain`. `{}` for matched,
     * `matchResult.partialParams` for notFound, `chainParams(prev)` for
     * error. Source for `urlPrefix(:name)` in chain comparison.
     */
    partialParams: Record<string, string>;
    /** RRU at commit time: `normalizeRRU(adapter.read())`. */
    url: string;
    /** Render value returned by the `notFound` handler; only for notFound. */
    notFoundResult?: unknown;
    /** Diagnostic payload; only for `status === 'error'`. */
    error?: {
        /** Diagnostic type. */
        type: NavigationErrorType;
        /** Original exception for `resolver-throw` / `notFound-throw`; else undefined. */
        error: unknown;
        /** RRU for most types; raw input for `invalid-rru` (input). */
        attemptedUrl: string;
        /** `redirectPath` (normalized RRUs) for `redirect-loop`. */
        path?: string[];
        /** Partial chain of the last LOOP iteration (diagnostic). */
        partialChain: Node_2[];
        /** Decoded params along `partialChain`. */
        partialParams: Record<string, string>;
    };
}

/**
 * The only layer that knows about Browser URLs (BU). The core works in
 * Router-relative URLs (RRU). `read()` must return a valid RRU (starts
 * with `/`, no `#`, non-empty).
 *
 * @public
 */
declare interface UrlAdapter {
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
