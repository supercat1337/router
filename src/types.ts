// @ts-check

// Brand symbols are declared here as local `unique symbol` constants for
// the public type surface. The runtime code uses the concrete symbols from
// `./internal/symbols.js`. See `git blame` / commit history for the
// api-extractor resolution bug that forced this split.
declare const FILE_BRAND: unique symbol;
declare const FOLDER_BRAND: unique symbol;
declare const REDIRECT_BRAND: unique symbol;

// =============================================================================
// Data model
// =============================================================================

/**
 * Metadata for a `file` node.
 *
 * `name` is required and must be unique within a map; it is the key used
 * by `RouterMap.url(name)`. Additional app-owned metadata travels with the
 * node unchanged.
 *
 * @public
 */
export interface FileMeta {
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
 * Options for a `folder` node.
 *
 * @public
 */
export interface FolderOptions {
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
 * Valid children of a `folder` node or of a top-level map.
 *
 * Keys are URL-segment patterns: literal (`[A-Za-z0-9._~-]+`), `:name`,
 * `*`, or the reserved `index`.
 *
 * @public
 */
export type Children = Record<string, FileNode | FolderNode>;

/**
 * A leaf node created by `file(meta)`. Branded and frozen; not constructible
 * outside `file()`.
 *
 * @public
 */
export interface FileNode<M = FileMeta> {
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

/**
 * An interior node created by `folder(children, options?)`. Branded and
 * frozen; not constructible outside `folder()`.
 *
 * @public
 */
export interface FolderNode<O = FolderOptions, C = Children> {
    /** Phantom brand; runtime check via `isFolder`. */
    readonly [FOLDER_BRAND]: true;

    /** Optional fallback handler for this subtree. */
    readonly notFound?: NotFoundHandler;

    /** Child nodes keyed by URL-segment pattern. */
    readonly children: Readonly<C>;
}

/**
 * Either kind of route node.
 *
 * @public
 */
export type Node = FileNode | FolderNode;

// =============================================================================
// Route-name inference
// =============================================================================

/**
 * Union of route names derivable from a `createMap` data literal.
 *
 * Walks file leaves (`M.name`) and folder subtrees recursively. Wildcard
 * (`*`) routes are not representable by `name` and are not included.
 *
 * @public
 */
export type RouteNames<Data> = {
    [K in keyof Data]: Data[K] extends FileNode<infer M>
        ? M extends { name: infer N }
            ? N extends string
                ? N
                : never
            : never
        : Data[K] extends FolderNode<any, infer C>
          ? RouteNames<C>
          : never;
}[keyof Data];

/**
 * Extract the route-name parameter from a `RouterMap<Name>`.
 * Falls back to `string` when `R` is not a parameterized map.
 *
 * @public
 */
export type RouteNameOf<R> = R extends RouterMap<infer N> ? N : string;

// =============================================================================
// NotFound, redirect
// =============================================================================

/**
 * Context passed to a `notFound` handler.
 *
 * `chain` contains nodes (not URL prefixes); it is the partial match before
 * the failure and may be empty. `state` is intentionally not provided — the
 * resolver has already run and the map is chosen.
 *
 * @public
 */
export interface NotFoundContext {
    /** Router-relative URL that failed to match. */
    readonly url: string;

    /** Partial chain of matched nodes; may be empty. */
    readonly chain: readonly Node[];

    /** Decoded query params of the URL that failed to match. */
    readonly search: Readonly<Record<string, string>>;

    /** Decoded path params along `chain`. */
    readonly partialParams: Readonly<Record<string, string>>;
}

/**
 * Return value of a `notFound` handler. Can be any render value;
 * `redirect(url)` is a special branded object recognised by `isRedirect`.
 *
 * @public
 */
export type NotFoundResult = unknown;

/**
 * Signature of a `notFound` handler. Must be synchronous; returning a
 * Promise is a contract violation diagnosed as `notFound-promise`.
 *
 * @public
 */
export type NotFoundHandler = (ctx: NotFoundContext) => NotFoundResult;

/**
 * Branded object returned by `redirect(url)`, recognised by `isRedirect`.
 *
 * @public
 */
export interface RedirectResult {
    /** Phantom brand; runtime check via `isRedirect`. */
    readonly [REDIRECT_BRAND]: true;

    /** Target Router-relative URL. */
    readonly url: string;
}

// =============================================================================
// Map, MatchResult
// =============================================================================

/**
 * A router map produced by `createMap`. Immutable; do not construct by hand.
 *
 * `RouteName` is inferred by `createMap` from the data literal; it defaults
 * to `string` for hand-constructed / unknown maps.
 *
 * @public
 */
export interface RouterMap<RouteName extends string = string> {
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
export type MatchResult =
    | {
          /** The URL matched a leaf. */
          status: 'matched';
          /** Full chain from root to leaf. */
          chain: Node[];
          /** Decoded `:name` params. */
          params: Record<string, string>;
          /** Decoded query params. */
          search: Record<string, string>;
          /** `normalizeRRU(input)`. */
          url: string;
      }
    | {
          /** The URL matched nothing in this map. */
          status: 'notFound';
          /** Partial chain of matched nodes; may be empty. */
          chain: Node[];
          /** Decoded params along `chain`. */
          partialParams: Record<string, string>;
          /** Decoded query params. */
          search: Record<string, string>;
          /** Handler to invoke (nearest folder or map). */
          handler: NotFoundHandler;
          /** `normalizeRRU(input)`. */
          url: string;
      };

// =============================================================================
// Snapshot, errors
// =============================================================================

/**
 * Diagnostic types for contract violations. Emitted through
 * `navigationError` (prod) or thrown (dev). Not navigation outcomes.
 *
 * `reentrancy` is intentionally absent; that is a `GuardErrorType` in the
 * optional guard layer, not a core event.
 *
 * @public
 */
export type NavigationErrorType =
    | 'invalid-rru'
    | 'resolver-null'
    | 'resolver-promise'
    | 'resolver-throw'
    | 'resolver-invalid'
    | 'notFound-promise'
    | 'notFound-throw'
    | 'redirect-loop';

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
export type NavigationType = 'initial' | 'push' | 'replace' | 'pop' | 'revalidate';

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
export interface Snapshot {
    /** Transaction identifier; monotonic; not a history position. */
    readonly navigationId: number;

    /**
     * How the transaction that produced this snapshot was initiated.
     * Not a history position and not a direction — see `NavigationType`.
     */
    readonly navigationType: NavigationType;

    /** The committed map; on error, the previous committed map. */
    readonly map: RouterMap;

    /** Outcome of the transaction. */
    readonly status: 'matched' | 'notFound' | 'error';

    /** Full chain (matched), partial chain (notFound), prev chain (error). */
    readonly chain: readonly Node[];

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
    readonly leaf: Node | undefined;

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
        readonly partialChain: readonly Node[];

        /** Decoded params along `partialChain`. */
        readonly partialParams: Readonly<Record<string, string>>;
    };
}

// =============================================================================
// Events
// =============================================================================

/**
 * Payloads of all router events. All include `snapshot`.
 *
 * `suffix` is the divergent chain suffix in top-down order (root-most →
 * leaf), the same order as `chain`. "Bottom-up" / "top-down" is a
 * recommendation to the listener; it does not reorder the array.
 *
 * @public
 */
export interface EventPayloads {
    /** Fires once per transaction, before `afterLeave`. Suffix = divergent tail. */
    beforeLeave: { suffix: Node[]; snapshot: Snapshot };

    /** Fires once per transaction, after `beforeLeave`. */
    afterLeave: { suffix: Node[]; snapshot: Snapshot };

    /** Fires once per transaction, before `afterEnter`. */
    beforeEnter: { suffix: Node[]; snapshot: Snapshot };

    /** Fires once per transaction, after `beforeEnter`. */
    afterEnter: { suffix: Node[]; snapshot: Snapshot };

    /** Fires before `mapChanged`; opens the leave phase. */
    mapWillChange: { oldMap: RouterMap; newMap: RouterMap; snapshot: Snapshot };

    /** Fires after `mapWillChange` and `afterLeave`; closes leave, opens enter. */
    mapChanged: { oldMap: RouterMap; newMap: RouterMap; snapshot: Snapshot };

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

    /**
     * Fires exactly once per committed snapshot — after `afterEnter` for
     * normal transactions, after `navigationError` for prod error snapshots.
     * This is the single "something changed" event; `Router.subscribe` is a
     * thin alias over it. Does not fire for no-op `navigate` / `replace`.
     */
    commit: { snapshot: Snapshot };
}

// =============================================================================
// URL adapter
// =============================================================================

/**
 * The only layer that knows about Browser URLs (BU). The core works in
 * Router-relative URLs (RRU). `read()` must return a valid RRU (starts
 * with `/`, no `#`, non-empty).
 *
 * @public
 */
export interface UrlAdapter {
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

// =============================================================================
// Router
// =============================================================================

/**
 * The router instance produced by `createRouter`.
 *
 * `navigate` / `replace` do not throw on navigation outcomes
 * (`matched` / `notFound` / `error`) — they return a `Snapshot`. Contract
 * violations (dev) throw; in prod they return an error snapshot.
 *
 * `S` — application state type; `R` — map type (drives `url()` route-name
 * completion when the map is a `createMap<...>` result).
 *
 * @public
 */
export interface Router<S = any, R extends RouterMap = RouterMap> {
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
    url(name: RouteNameOf<R>, params?: Record<string, string>): string;

    /** The most recently committed snapshot. */
    getSnapshot(): Snapshot;

    /** The application state getter passed to `createRouter`. */
    getState(): S;

    /** `getSnapshot().navigationId === id`. */
    isCurrent(navigationId: number): boolean;

    /**
     * Subscribe to committed snapshots — the single "something changed"
     * hook for framework integrations (`useSyncExternalStore` in React,
     * `shallowRef` + `watch` in Vue).
     *
     * Fires on every commit, including `revalidate()` and prod error
     * snapshots. Does **not** fire for the initial commit (which happens
     * inside `createRouter` before this method exists) nor for no-op
     * `navigate` / `replace` calls. Thin alias of `on('commit', ...)`.
     */
    subscribe(listener: (snapshot: Snapshot) => void): () => void;

    /** Subscribe to an event. Returns an idempotent unsubscribe. */
    on<E extends keyof EventPayloads>(
        event: E,
        listener: (payload: EventPayloads[E]) => void
    ): () => void;

    /** Remove a listener by identity. No-op if not found. */
    off<E extends keyof EventPayloads>(
        event: E,
        listener: (payload: EventPayloads[E]) => void
    ): void;

    /** Subscribe for a single emit. Returns an idempotent unsubscribe. */
    once<E extends keyof EventPayloads>(
        event: E,
        listener: (payload: EventPayloads[E]) => void
    ): () => void;

    // ---- dev-only: always present at runtime, stripped from public .d.ts ----

    /**
     * Last N committed snapshots. N is implementation-defined.
     * @internal
     */
    getHistory(): Snapshot[];

    /**
     * "Where does this lead" without side effects. Normalizes `url` inside.
     * @internal
     */
    dryMatch(url: string, opts?: { state?: S; map?: RouterMap }): MatchResult;

    /** The map of the most recently committed snapshot. @internal */
    getActiveMap(): RouterMap;

    /** Resolve a map for the current state and given RRU. @internal */
    resolveMapFor(url: string): RouterMap;

    /** `redirectPath` of the last transaction. @internal */
    getRedirectPath(): string[] | undefined;
}

/**
 * Options accepted by `createRouter`.
 *
 * @public
 */
export interface CreateRouterOptions<S = any, R extends RouterMap = RouterMap> {
    /** Pure `(state, url) → RouterMap`. Must be synchronous. */
    resolveMap: (ctx: ResolveMapContext<S>) => R;

    /** Getter for application state. Called once per transaction. */
    getState: () => S;

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
 * Context passed to `resolveMap`.
 *
 * @public
 */
export interface ResolveMapContext<S = any> {
    /** Application state from `getState()`. */
    state: S;

    /** Normalized RRU. */
    url: string;
}

/**
 * Hook for listener errors.
 *
 * @public
 */
export type OnListenerError = (
    err: unknown,
    info: { event: keyof EventPayloads; snapshot: Snapshot }
) => void;

// =============================================================================
// MapValidationError
// =============================================================================

/**
 * Codes for `MapValidationError`. Tree-wide invariants only; subtree-shape
 * violations are `TypeError` thrown by `folder`.
 *
 * @public
 */
export type MapValidationErrorCode =
    | 'data-not-object'
    | 'data-key-invalid'
    | 'index-at-root'
    | 'notFound-missing'
    | 'notFound-invalid'
    | 'name-duplicate'
    | 'node-not-constructed';

// =============================================================================
// Guard layer
// =============================================================================

/**
 * Diagnostic types for the guard layer's `onError`. Distinct from
 * `NavigationErrorType`: the core does not know about guards.
 *
 * @public
 */
export type GuardErrorType = 'reentrancy' | 'guard-redirect-loop' | 'invalid-rru' | 'guard-throw';

/**
 * Discriminated payload passed to `OnGuardError`. Narrow on `.type`.
 *
 * @public
 */
export type GuardErrorPayload =
    | {
          /** Guard threw a non-CancelError exception. */
          type: 'guard-throw';
          error: unknown;
      }
    | {
          /** Guard redirect cycle detected (dev: throws, prod: `onError`). */
          type: 'guard-redirect-loop';
          path: string[];
      }
    | {
          /** Guard returned `{ redirect }` / `redirect()` with a non-RRU target. */
          type: 'invalid-rru';
          target: string;
      }
    | {
          /** `nav.navigate` / `nav.replace` called from inside a guard's sync frame. */
          type: 'reentrancy';
      };

/**
 * Hook for guard-layer diagnostics.
 *
 * @public
 */
export type OnGuardError = (err: GuardErrorPayload, ctx: { url: string; from: Snapshot }) => void;

/**
 * What a single guard returns.
 *
 * `RedirectResult` (from `redirect()`) is preferred; the legacy
 * `{ redirect: string }` shape is still accepted at runtime and in types
 * for backward compatibility.
 *
 * @public
 */
export type Decision = 'allow' | RedirectResult | { redirect: string } | { block: true };

/**
 * Context passed to a guard. `router` is a facade without `navigate` /
 * `replace` / `revalidate` / `dryMatch` — reentrancy through it is
 * impossible by API.
 *
 * @public
 */
export type GuardContext = {
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
 * A guard: sync or async, returns `Decision`.
 *
 * @public
 */
export type Guard = (ctx: GuardContext) => Decision | Promise<Decision>;

/**
 * Result of `nav.navigate` / `nav.replace`.
 *
 * @public
 */
export type NavResult =
    | {
          /** Guards allowed; the router committed. */
          status: 'committed';
          /** The committed snapshot. */
          snapshot: Snapshot;
      }
    | {
          /** A guard blocked, or guard-layer diagnosed an error. */
          status: 'blocked';
      };

/**
 * The object returned by `createGuardLayer`.
 *
 * @public
 */
export interface GuardLayer {
    /** Wrap a base adapter. Only integration point into the core. */
    wrapAdapter(adapter: UrlAdapter): UrlAdapter;

    /** Bind to a router. Must be called before `navigate()`. */
    bind(router: Router): void;

    /** Build the guarded navigate/replace pair. Throws if `bind` was not called. */
    navigate(): {
        navigate(url: string): Promise<NavResult>;
        replace(url: string): Promise<NavResult>;
    };

    /**
     * Current in-flight guard state; `null` when idle. `signal` is the
     * `AbortSignal` of the in-flight run — aborts when a newer navigation
     * starts, or a redirect-iteration begins. Use it to cancel in-flight
     * work when the user triggers a new navigation.
     */
    pending(): { url: string; since: number; signal: AbortSignal } | null;
}

/**
 * Options accepted by `createGuardLayer`.
 *
 * @public
 */
export interface CreateGuardLayerOptions {
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
 * Options accepted by `createGuardedRouter` — merges `CreateRouterOptions`
 * with `CreateGuardLayerOptions`. `maxRedirects` is the router limit;
 * `guardMaxRedirects` is the guard limit.
 *
 * @public
 */
export interface CreateGuardedRouterOptions<S = any, R extends RouterMap = RouterMap> {
    /** Pure `(state, url) → RouterMap`. Must be synchronous. */
    resolveMap: (ctx: ResolveMapContext<S>) => R;

    /** Getter for application state. Called once per transaction. */
    getState: () => S;

    /** The base (unwrapped) URL adapter. Wired through `guard.wrapAdapter`. */
    adapter: UrlAdapter;

    /** Router max redirects per transaction. Default 10. */
    maxRedirects?: number;

    /** Router listener error hook. Fallback: `console.error`. */
    onListenerError?: OnListenerError;

    /** Guards to run in order. First non-`allow` stops the chain. */
    guards: Guard[];

    /** Guard-chain max redirects. Default 10. Independent of `maxRedirects`. */
    guardMaxRedirects?: number;

    /** Guard diagnostic hook. */
    onGuardError?: OnGuardError;

    /** Dev flag for both router and guard layer. */
    dev?: boolean;
}

/**
 * Result of `createGuardedRouter` — router, guard, and pre-built
 * `nav.navigate` / `nav.replace`. Already wired; no `bind()` needed.
 *
 * @public
 */
export interface GuardedRouter<S = any, R extends RouterMap = RouterMap> {
    /** The core router (already bound to the guard layer). */
    router: Router<S, R>;

    /** The guard layer, for `pending()` and manual `wrapAdapter` reuse. */
    guard: GuardLayer;

    /** Guarded navigate/replace pair; ready for `attachLinks` overrides. */
    nav: {
        navigate(url: string): Promise<NavResult>;
        replace(url: string): Promise<NavResult>;
    };
}

// =============================================================================
// attachLinks
// =============================================================================

/**
 * Options for `attachLinks`. `navigate` / `replace` receive an RRU, not an
 * `href`; `attachLinks` normalizes before calling them.
 *
 * @public
 */
export interface AttachLinksOptions {
    /** Override for the navigate action. Default: `router.navigate`. */
    navigate?: (rru: string) => unknown;

    /** Override for the replace action. Default: `router.replace`. */
    replace?: (rru: string) => unknown;
}

/**
 * Context passed to a preload function.
 *
 * `signal` aborts when `attachPreload(...)` is detached. Forward it to
 * any cancellable work (`fetch`, custom loaders). It is not tied to a
 * navigation transaction — abort happens on detach only.
 *
 * @public
 */
export interface PreloadContext {
    /** Aborts when `attachPreload(...)` is detached. */
    readonly signal: AbortSignal;
}

/**
 * Options for `attachPreload`. `preload` receives the matched leaf node —
 * a `Node` (narrow with `isFile` if you need `.name` / `.load`). Return
 * value is ignored; a returned Promise is awaited and its rejection is
 * swallowed (preload is opportunistic).
 *
 * @public
 */
export interface AttachPreloadOptions {
    /**
     * Called when the user hovers or focuses a `[data-router-link]`.
     * Receives the matched leaf node and a `PreloadContext` with an
     * `AbortSignal` that aborts on `detach()`. Return value is ignored;
     * a returned Promise is awaited and its rejection is swallowed.
     *
     * Default: `leaf.preload?.(ctx) ?? leaf.load?.()` — `leaf.preload`
     * receives `ctx`, `leaf.load` is called without arguments
     * (`import()` does not accept an `AbortSignal`).
     */
    preload?: (leaf: Node, ctx: PreloadContext) => void | Promise<unknown>;
}

/**
 * Options for `attachActiveLinks`.
 *
 * @public
 */
export interface AttachActiveLinksOptions {
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
