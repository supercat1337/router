/**
 * Optional async guard layer. Runs guards before the core commits a
 * navigation, allowing auth checks, permission checks, and preloading
 * without touching the synchronous core.
 *
 * @packageDocumentation
 */

export type {
    // Transitive — api-extractor requires every type in a public signature
    // to be re-exported from this entry point.
    Children,
    CreateGuardedRouterOptions,
    // Own surface
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
 * Create an optional async guard layer.
 *
 * The core stays synchronous; guards work over proposals before the router
 * commits. Wiring order is mandatory:
 *   1. `const guard = createGuardLayer({...})`
 *   2. `const router = createRouter({ adapter: guard.wrapAdapter(base), ... })`
 *   3. `guard.bind(router)`
 *   4. `const nav = guard.navigate()`
 *   5. `attachLinks(router, { navigate: nav.navigate, replace: nav.replace })`
 *
 * See `createGuardedRouter` for the one-call variant.
 *
 * @public
 */
export declare function createGuardLayer(
    options: import('./types.js').CreateGuardLayerOptions
): import('./types.js').GuardLayer;

/**
 * Create a router with an already-wired guard layer. Replaces the mandatory
 * 5-step wiring (`createGuardLayer` → `wrapAdapter` → `createRouter` →
 * `bind` → `navigate()`) with a single call.
 *
 * `maxRedirects` applies to the router; `guardMaxRedirects` applies to the
 * guard chain. They are independent.
 *
 * @public
 */
export declare function createGuardedRouter<
    S = any,
    R extends import('./types.js').RouterMap = import('./types.js').RouterMap,
>(
    options: import('./types.js').CreateGuardedRouterOptions<S, R>
): import('./types.js').GuardedRouter<S, R>;
