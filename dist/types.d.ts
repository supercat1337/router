/**
 * Synchronous state-relative router for SPA and SSR over a tree of
 * JS objects. Core entry: maps, matching, transactions, events, URL
 * adapter interface. See `@supercat1337/router/adapters`,
 * `/links`, `/guard` for the optional subpath modules.
 *
 * @packageDocumentation
 */

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
 * Valid children of a `folder` node or of a top-level map.
 *
 * Keys are URL-segment patterns: literal (`[A-Za-z0-9._~-]+`), `:name`,
 * `*`, or the reserved `index`.
 *
 * @public
 */
export declare type Children = Record<string, FileNode | FolderNode>;

declare type Children_2 = Children;

/**
 * Options accepted by `createGuardLayer`.
 *
 * @public
 */
export declare interface CreateGuardLayerOptions {
    /** Guards to run in order. First non-`allow` stops the chain. */
    guards: Guard[];
    /** Max redirects within the guard chain. Default 10. */
    maxRedirects?: number;
    /** Diagnostic hook. Called for `guard-throw` / `guard-redirect-loop` / `invalid-rru` / `reentrancy`. */
    onError?: OnGuardError;
    /** Dev flag. When omitted, inferred from `globalThis.process.env.NODE_ENV`. */
    dev?: boolean;
}

/**
 * Create an immutable router map.
 *
 * Validates tree-wide invariants — top-level data shape, top-level key
 * syntax, `index` at root, `notFound` presence and function-ness, node
 * construction, name uniqueness. Subtree-shape is already validated by
 * `folder`; this function re-checks the branded-node predicate during
 * traversal but does not re-check key syntax inside folders.
 *
 * The returned object is frozen and branded; it exposes `notFound`, `url`,
 * and `match`. `isMap` is the only supported way to detect one.
 *
 * @param {Record<string, Node>} data
 * @param {{ notFound: NotFoundHandler }} options
 * @returns {RouterMap}
 */
export declare function createMap(data: Record<string, Node_3>, options: {
    notFound: NotFoundHandler_2;
}): RouterMap_2;

/**
 * @typedef {import('./types.js').Router} Router
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').RouterMap} RouterMap
 * @typedef {import('./types.js').UrlAdapter} UrlAdapter
 * @typedef {import('./types.js').EventPayloads} EventPayloads
 * @typedef {import('./types.js').MatchResult} MatchResult
 */
/**
 * Create a router instance and run the initial transaction.
 *
 * Throws from `createRouter` itself when the initial URL hits a classified
 * diagnostic (`invalid-rru`, `resolver-*`, `notFound-*`, `redirect-loop`,
 * `getState` / `adapter.write` throw) — bootstrap cannot continue without a
 * valid map. After construction, `navigate` / `replace` / `revalidate` never
 * throw on navigation outcomes; they return a `Snapshot` (`status: 'error'`
 * for prod diagnostics).
 *
 * Wiring order with the optional guard layer:
 *   1. `const guard = createGuardLayer({...})`
 *   2. `const router = createRouter({ adapter: guard.wrapAdapter(base), ... })`
 *   3. `guard.bind(router)`
 *   4. `const nav = guard.navigate()`
 *
 * @public
 * @param {import('./types.js').CreateRouterOptions} options
 * @returns {Router}
 */
export declare function createRouter(options: CreateRouterOptions): Router_2;

/**
 * Options accepted by `createRouter`.
 *
 * @public
 */
export declare interface CreateRouterOptions {
    /** Pure `(state, url) → RouterMap`. Must be synchronous. */
    resolveMap: (ctx: ResolveMapContext) => RouterMap;
    /** Getter for application state. Called once per transaction. */
    getState: () => any;
    /** The URL adapter. */
    adapter: UrlAdapter;
    /** Max redirects per transaction. Default 10. Independent of guard's limit. */
    maxRedirects?: number;
    /** Listener error hook. Fallback: `console.error`. */
    onListenerError?: OnListenerError;
    /** Dev flag. When omitted, inferred from `globalThis.process.env.NODE_ENV`. */
    dev?: boolean;
}

/**
 * What a single guard returns.
 *
 * @public
 */
export declare type Decision = 'allow' | {
    redirect: string;
} | {
    block: true;
};

/**
 * Payloads of all router events. All include `snapshot`.
 *
 * `suffix` is the divergent chain suffix in top-down order (root-most →
 * leaf), the same order as `chain`. "Bottom-up" / "top-down" is a
 * recommendation to the listener; it does not reorder the array.
 *
 * @public
 */
export declare interface EventPayloads {
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

/**
 * @typedef {import('./types.js').FileMeta} FileMeta
 * @typedef {import('./types.js').FolderOptions} FolderOptions
 * @typedef {import('./types.js').FileNode} FileNode
 * @typedef {import('./types.js').FolderNode} FolderNode
 * @typedef {import('./types.js').Children} Children
 * @typedef {import('./types.js').NotFoundHandler} NotFoundHandler
 */
/**
 * @typedef {{ kind: 'wildcard' }
     *   | { kind: 'index' }
     *   | { kind: 'param', name: string }
     *   | { kind: 'literal' }} ParsedKey
 */
/**
 * Create a `file` node.
 *
 * Validates metadata only: `name` non-empty string, `title`/`layout`
 * strings when provided. Uniqueness of `name` across the map is enforced
 * by `createMap`. Returns a frozen branded object; mutation is a contract
 * violation and is not defended against after freeze.
 *
 * @template {FileMeta} M
 * @param {M} meta
 * @returns {import('./types.js').FileNode<M>}
 */
export declare function file<M extends FileMeta_2>(meta: M): FileNode<M>;

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
    /** Application-owned metadata; passed through unchanged. */
    [key: string]: any;
}

declare type FileMeta_2 = FileMeta;

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

declare type FileNode_2 = FileNode;

/**
 * Create a `folder` node.
 *
 * Validates the **subtree** — `options` shape, `notFound` (best-effort
 * sync check), `children` keys, `index`/`*` must be files, `:name`
 * collisions. Tree-wide invariants (name uniqueness, top-level `index`,
 * node construction) are enforced by `createMap`.
 *
 * `notFound` async-ness is checked best-effort via `AsyncFunction`
 * toString inspection; a plain function returning a Promise is not
 * detected here and will surface at runtime as `notFound-promise`.
 *
 * @template {FolderOptions} O
 * @template {Children} C
 * @param {O} options
 * @param {C} children
 * @returns {import('./types.js').FolderNode<O, C>}
 */
export declare function folder<O extends FolderOptions_2, C extends Children_2>(options: O, children: C): FolderNode<O, C>;

declare const FOLDER_BRAND: unique symbol;

/**
 * An interior node created by `folder(options, children)`. Branded and
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

declare type FolderNode_2 = FolderNode;

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

declare type FolderOptions_2 = FolderOptions;

/**
 * A guard: sync or async, returns `Decision`.
 *
 * @public
 */
export declare type Guard = (ctx: GuardContext) => Decision | Promise<Decision>;

/**
 * Context passed to a guard. `router` is a facade without `navigate` /
 * `replace` / `revalidate` / `dryMatch` — reentrancy through it is
 * impossible by API.
 *
 * @public
 */
export declare type GuardContext = {
    /** The proposed Router-relative URL. */
    url: string;
    /** Last committed snapshot. */
    from: Snapshot;
    /** Aborted when a newer nav starts or a redirect-iteration begins. */
    signal: AbortSignal;
    /** Facade for read-only router methods. */
    router: Pick<Router, 'getSnapshot' | 'getState' | 'isCurrent' | 'url'>;
};

/**
 * Diagnostic types for the guard layer's `onError`. Distinct from
 * `NavigationErrorType`: the core does not know about guards.
 *
 * @public
 */
export declare type GuardErrorType = 'reentrancy' | 'guard-redirect-loop' | 'invalid-rru' | 'guard-throw';

/**
 * The object returned by `createGuardLayer`.
 *
 * @public
 */
export declare interface GuardLayer {
    /** Wrap a base adapter. Only integration point into the core. */
    wrapAdapter(adapter: UrlAdapter): UrlAdapter;
    /** Bind to a router. Must be called before `navigate()`. */
    bind(router: Router): void;
    /** Build the guarded navigate/replace pair. Throws if `bind` was not called. */
    navigate(): {
        navigate(url: string): Promise<NavResult>;
        replace(url: string): Promise<NavResult>;
    };
    /** Current in-flight guard state; `null` when idle. */
    pending(): {
        url: string;
        since: number;
    } | null;
}

/**
 * Brand check for a `file` node.
 *
 * @param {unknown} x
 * @returns {x is FileNode}
 */
export declare function isFile(x: unknown): x is FileNode_2;

/**
 * Brand check for a `folder` node.
 *
 * @param {unknown} x
 * @returns {x is FolderNode}
 */
export declare function isFolder(x: unknown): x is FolderNode_2;

/**
 * Brand check for a `RouterMap`.
 *
 * @param {unknown} x
 * @returns {x is RouterMap}
 */
export declare function isMap(x: unknown): x is RouterMap_2;

/**
 * Brand check for `RedirectResult`. Runtime narrowing, not a structural
 * check: an object shaped like `{ url }` but without the symbol is not a
 * redirect.
 *
 * @param {unknown} x
 * @returns {x is RedirectResult}
 */
export declare function isRedirect(x: unknown): x is RedirectResult_2;

/**
 * Thrown by `createMap` when a tree-wide invariant is violated.
 *
 * `code` identifies the invariant; `path` locates the offending node
 * (`/admin/users/:id`) or key (`:id`); `''` when the violation is at the
 * map level with no specific path. Subtree-shape violations are thrown by
 * `folder` as plain `TypeError` and never reach `createMap`.
 */
export declare class MapValidationError extends Error {
    /**
     * @param {MapValidationErrorCode} code
     * @param {string} path
     * @param {string} [message]
     */
    constructor(code: MapValidationErrorCode_2, path: string, message?: string);
    /** @type {MapValidationErrorCode} */
    code: MapValidationErrorCode_2;
    /** @type {string} */
    path: string;
}

/**
 * Codes for `MapValidationError`. Tree-wide invariants only; subtree-shape
 * violations are `TypeError` thrown by `folder`.
 *
 * @public
 */
export declare type MapValidationErrorCode = 'data-not-object' | 'data-key-invalid' | 'index-at-root' | 'notFound-missing' | 'notFound-invalid' | 'name-duplicate' | 'node-not-constructed';

declare type MapValidationErrorCode_2 = MapValidationErrorCode;

/**
 * Result of `RouterMap.match`. Always one of the two branches; never `null`.
 *
 * `params` is decoded (matched only). `partialParams` is decoded along the
 * partial chain (notFound only); it is the source of values for
 * `urlPrefix(:name)` during chain comparison.
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
export declare type NavigationErrorType = 'invalid-rru' | 'resolver-null' | 'resolver-promise' | 'resolver-throw' | 'resolver-invalid' | 'notFound-promise' | 'notFound-throw' | 'redirect-loop';

/**
 * Result of `nav.navigate` / `nav.replace`.
 *
 * @public
 */
export declare type NavResult = {
    /** Guards allowed; the router committed. */
    status: 'committed';
    /** The committed snapshot. */
    snapshot: Snapshot;
} | {
    /** A guard blocked, or guard-layer diagnosed an error. */
    status: 'blocked';
};

/**
 * Either kind of route node.
 *
 * @public
 */
declare type Node_2 = FileNode | FolderNode;
export { Node_2 as Node }

declare type Node_3 = Node_2;

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
export declare function normalizeRRU(url: string): string;

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
export declare type NotFoundHandler = (ctx: NotFoundContext) => NotFoundResult;

declare type NotFoundHandler_2 = NotFoundHandler;

/**
 * Return value of a `notFound` handler. Can be any render value;
 * `redirect(url)` is a special branded object recognised by `isRedirect`.
 *
 * @public
 */
export declare type NotFoundResult = unknown;

/**
 * Hook for guard-layer diagnostics.
 *
 * @public
 */
export declare type OnGuardError = (err: {
    type: GuardErrorType;
    [k: string]: any;
}, ctx: {
    url: string;
    from: Snapshot;
}) => void;

/**
 * Hook for listener errors.
 *
 * @public
 */
export declare type OnListenerError = (err: unknown, info: {
    event: keyof EventPayloads;
    snapshot: Snapshot;
}) => void;

/**
 * @typedef {import('./types.js').RedirectResult} RedirectResult
 */
/**
 * Construct a branded redirect result. Returned from a `notFound` handler
 * to signal "do not commit this URL; go to `url` instead".
 *
 * The returned object is frozen and carries an internal brand symbol;
 * consumers narrow with `isRedirect` before reading `.url`. Branding
 * distinguishes an intentional redirect from a render value that happens
 * to have a `url` field.
 *
 * The cast goes through `unknown` because the runtime symbol in
 * `symbols.js` and the phantom type symbol in `types.ts` are distinct
 * `unique symbol`s by design — see `types.ts` header for rationale.
 *
 * @param {string} url
 * @returns {RedirectResult}
 */
export declare function redirect(url: string): RedirectResult_2;

declare const REDIRECT_BRAND: unique symbol;

/**
 * Branded object returned by `redirect(url)`, recognised by `isRedirect`.
 *
 * @public
 */
export declare interface RedirectResult {
    /** Phantom brand; runtime check via `isRedirect`. */
    readonly [REDIRECT_BRAND]: true;
    /** Target Router-relative URL. */
    readonly url: string;
}

declare type RedirectResult_2 = RedirectResult;

/**
 * Context passed to `resolveMap`.
 *
 * @public
 */
export declare interface ResolveMapContext {
    /** Application state from `getState()`. */
    state: any;
    /** Normalized RRU. */
    url: string;
}

/**
 * The router instance produced by `createRouter`.
 *
 * `navigate` / `replace` do not throw on navigation outcomes
 * (`matched` / `notFound` / `error`) — they return a `Snapshot`. Contract
 * violations (dev) throw; in prod they return an error snapshot.
 *
 * @public
 */
export declare interface Router {
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

declare type Router_2 = Router;

/**
 * A router map produced by `createMap`. Immutable; do not construct by hand.
 *
 * @public
 */
export declare interface RouterMap {
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

declare type RouterMap_2 = RouterMap;

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
export declare interface Snapshot {
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
