/**
 * Synchronous state-relative router for SPA and SSR over a tree of
 * JS objects. Core entry: maps, matching, transactions, events, URL
 * adapter interface. See `@supercat1337/router/adapters`,
 * `/links`, `/guard` for the optional subpath modules.
 *
 * @packageDocumentation
 */

import type {
    Children,
    CreateRouterOptions,
    EventPayloads,
    FileMeta,
    FileNode,
    FolderNode,
    FolderOptions,
    GuardContext,
    GuardErrorPayload,
    GuardErrorType,
    HrefOptions,
    MapValidationErrorCode,
    MatchResult,
    NavigationErrorType,
    NavigationType,
    NavResult,
    Node,
    NotFoundHandler,
    OnListenerError,
    ParamsArgs,
    ParamNameOf,
    PreloadContext,
    RedirectResult,
    ResolveMapContext,
    Route,
    RouteNames,
    RouteParamsFor,
    RouteParamsForName,
    RouteParamsOf,
    Router,
    RouterMap,
    Snapshot,
    UrlAdapter,
} from './types.js';

export type {
    AttachActiveLinksOptions,
    AttachLinksOptions,
    AttachPreloadOptions,
    Children,
    CreateGuardedRouterOptions,
    CreateGuardLayerOptions,
    CreateRouterOptions,
    Decision,
    EventPayloads,
    FileMeta,
    FileNode,
    FolderNode,
    FolderOptions,
    Guard,
    GuardContext,
    GuardedRouter,
    GuardErrorPayload,
    GuardErrorType,
    GuardLayer,
    HrefOptions,
    MapValidationErrorCode,
    MatchResult,
    NavigationErrorType,
    NavigationType,
    NavResult,
    Node,
    NotFoundContext,
    NotFoundHandler,
    NotFoundResult,
    OnGuardError,
    OnListenerError,
    ParamsArgs,
    ParamNameOf,
    PreloadContext,
    RedirectResult,
    ResolveMapContext,
    Route,
    RouteNameOf,
    RouteNames,
    RouteParamsFor,
    RouteParamsForName,
    RouteParamsOf,
    Router,
    RouterMap,
    Snapshot,
    UrlAdapter,
} from './types.js';

/**
 * Create a `file` node.
 *
 * Validates metadata only: `name` non-empty string, `title`/`layout`
 * strings when provided. Uniqueness of `name` across the map is enforced
 * by `createMap`. Returns a frozen branded object; mutation is a contract
 * violation and is not defended against after freeze.
 *
 * The `const` type parameter preserves the literal `name` in the inferred
 * `FileNode<M>`, which feeds `RouteNames<T>` in `createMap`.
 *
 * @public
 */
export declare function file<const M extends FileMeta>(meta: M): FileNode<M>;

/**
 * Create a `folder` node.
 *
 * Validates the **subtree** — `children` shape and keys (literal, `:name`,
 * `*`, `index`), `index`/`*` must be files, `:name` collisions; and
 * `options.notFound` (best-effort sync check). Tree-wide invariants are
 * enforced by `createMap`.
 *
 * @public
 */
export declare function folder<const C extends Children>(
    children: C,
    options?: FolderOptions
): FolderNode<FolderOptions, C>;

/**
 * Create an immutable router map.
 *
 * Validates tree-wide invariants and returns a frozen, branded `RouterMap`.
 * `RouteNames<T>` is inferred from the data literal, so `map.url(name)`
 * gets compile-time completion and rejects typos.
 *
 * @public
 */
export declare function createMap<const T extends Record<string, Node>>(
    data: T,
    options: { notFound: NotFoundHandler }
): RouterMap<RouteNames<T>, RouteParamsFor<T>>;

/**
 * Brand check for a `file` node.
 *
 * @public
 */
export declare function isFile(x: unknown): x is FileNode;

/**
 * Brand check for a `folder` node.
 *
 * @public
 */
export declare function isFolder(x: unknown): x is FolderNode;

/**
 * Brand check for a `RouterMap`.
 *
 * @public
 */
export declare function isMap(x: unknown): x is RouterMap;

/**
 * Check whether a route with a canonical URL exists for `name` in `map`.
 *
 * Returns `true` iff `map.url(name, ...)` would not throw for the reason
 * "route not found" — i.e. there is a non-wildcard leaf with
 * `name === name`. Parameter validity is **not** checked: `hasRoute` may
 * return `true` while `url(name)` still throws for missing or invalid
 * `:name` params.
 *
 * Wildcard-only routes (`*`) have no canonical URL and return `false`.
 * Non-map / non-string / empty-string inputs return `false`.
 *
 * Intended for one-shot validation of route names from config / feature
 * flags / external sources at data-load time. O(N) in tree size;
 * no memoization — do not call per render.
 *
 * @public
 */
export declare function hasRoute(map: RouterMap, name: string): boolean;

/**
 * Thrown by `createMap` when a tree-wide invariant is violated.
 *
 * `code` identifies the invariant; `path` locates the offending node
 * (`/admin/users/:id`) or key (`:id`); `''` when the violation is at the
 * map level with no specific path.
 *
 * @public
 */
export declare class MapValidationError extends Error {
    /** Identifier of the violated invariant. */
    code: MapValidationErrorCode;

    /** Node or key path; `''` for map-level violations. */
    path: string;

    /**
     * @param code — identifier of the violated invariant
     * @param path — node or key path
     * @param message — optional override; default is `Invalid map at {path}: {code}`
     */
    constructor(code: MapValidationErrorCode, path: string, message?: string);
}

/**
 * Construct a branded redirect result. Returned from a `notFound` handler
 * or a guard to signal "do not commit this URL; go to `url` instead".
 *
 * @public
 */
export declare function redirect(url: string): RedirectResult;

/**
 * Brand check for `RedirectResult`.
 *
 * @public
 */
export declare function isRedirect(x: unknown): x is RedirectResult;

/**
 * Single normalization for Router-relative URLs (RRU). Idempotent.
 *
 * Strips all trailing slashes except for the root `/`. Does not
 * percent-decode, does not normalize case, does not touch search.
 *
 * @public
 */
export declare function normalizeRRU(url: string): string;

/**
 * Create a router instance and run the initial transaction.
 *
 * Throws from `createRouter` itself when the initial URL hits a classified
 * diagnostic — bootstrap cannot continue without a valid map. After
 * construction, `navigate` / `replace` / `revalidate` never throw on
 * navigation outcomes; they return a `Snapshot`.
 *
 * `S` — application state type; `R` — map type (drives `url()` route-name
 * completion when the map is a `createMap<...>` result).
 *
 * @public
 */
export declare function createRouter<S = any, R extends RouterMap = RouterMap>(
    options: CreateRouterOptions<S, R>
): Router<S, R>;

/**
 * Brand check for a `Router`. The only supported way to detect one at
 * runtime — `instanceof` will not work, and structural lookalikes return
 * `false`. The brand is a private `Symbol` set by `createRouter`.
 *
 * @public
 */
export declare function isRouter(x: unknown): x is Router;

/**
 * Brand check for a `Route`. The only supported way to detect one at
 * runtime — `instanceof` will not work, and structural lookalikes
 * return `false`.
 *
 * @public
 */
export declare function isRoute(x: unknown): x is Route;