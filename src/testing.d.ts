/**
 * Test helpers: in-memory `UrlAdapter` and a `createTestRouter` factory.
 * Opt-in; not part of the core router. Designed for unit and integration
 * tests — exposes test-only methods (`writeCalls`, `trigger`, `setCurrent`,
 * `reset`) that the core `UrlAdapter` interface does not include.
 *
 * @packageDocumentation
 */

import type { Router, RouterMap, ResolveMapContext, UrlAdapter } from './types.js';

import {
    Children,
    EventPayloads,
    FileMeta,
    FileNode,
    FolderNode,
    FolderOptions,
    HrefOptions,
    MatchResult,
    NavigationErrorType,
    NavigationType,
    Node,
    NotFoundContext,
    NotFoundHandler,
    NotFoundResult,
    OnListenerError,
    ParamsArgs,
    PrefetchOptions,
    PreloadContext,
    Route,
    RouteNameOf,
    RouteParamsOf,
    Snapshot,
} from './types.js';

export type {
    // Direct — appear in `createTestRouter` / `MemoryAdapter` signatures.
    Router,
    RouterMap,
    ResolveMapContext,
    UrlAdapter,
    // Transitive — api-extractor requires every type reachable through
    // the direct surface to be re-exported here. Without these, `Router`,
    // `RouterMap`, and `UrlAdapter` produce `ae-forgotten-export` warnings
    // on `Snapshot`, `EventPayloads`, `PrefetchOptions`, `Route`,
    // `RouteNameOf`, `ParamsArgs`, `RouteParamsOf`, `MatchResult`,
    // `NotFoundHandler`, `HrefOptions`, and their own transitive closure.
    //
    // `OnListenerError` is here because `Router.onListenerError(cb)`
    // references it — api-extractor reports it as forgotten without
    // this re-export.
    Children,
    EventPayloads,
    FileMeta,
    FileNode,
    FolderNode,
    FolderOptions,
    HrefOptions,
    MatchResult,
    NavigationErrorType,
    NavigationType,
    Node,
    NotFoundContext,
    NotFoundHandler,
    NotFoundResult,
    OnListenerError,
    ParamsArgs,
    PrefetchOptions,
    PreloadContext,
    Route,
    RouteNameOf,
    RouteParamsOf,
    Snapshot,
};

/**
 * One recorded `adapter.write()` call.
 *
 * @public
 */
export interface MemoryAdapterWriteCall {
    /** RRU passed to `write()`. */
    readonly url: string;
    /** Mode passed to `write()`. */
    readonly mode: 'push' | 'replace';
}

/**
 * In-memory `UrlAdapter` for tests.
 *
 * @public
 */
export interface MemoryAdapter extends UrlAdapter {
    /**
     * Every `write()` call, in order. Appended to, never cleared except by
     * `reset()`. Use `.at(-1)` for the last call, `.length` for the count.
     */
    readonly writeCalls: ReadonlyArray<MemoryAdapterWriteCall>;

    /**
     * Fire all `listen()` subscribers with an empty event object — for
     * simulating `popstate` / `hashchange`.
     */
    trigger(): void;

    /**
     * Change the current RRU without recording a `write()` call. Use to
     * set up the starting URL before firing `trigger()`.
     */
    setCurrent(url: string): void;

    /**
     * Clear `writeCalls` and history state. Current RRU is **not** changed —
     * use `setCurrent()` for that. Intended for test isolation in
     * `t.beforeEach`.
     */
    reset(): void;
}

/**
 * Create an in-memory `UrlAdapter` for tests.
 *
 * @param initial — initial RRU. Default `'/'`.
 * @public
 */
export declare function createMemoryAdapter(initial?: string): MemoryAdapter;

/**
 * Options for `createTestRouter`. `map` / `resolveMap` are mutually
 * exclusive; `state` / `getState` are mutually exclusive.
 *
 * @public
 */
export interface CreateTestRouterOptions<S = any, R extends RouterMap = RouterMap> {
    /** Static map. Shortcut for `resolveMap: () => map`. */
    map?: R;

    /** Dynamic map resolver. Mutually exclusive with `map`. */
    resolveMap?: (ctx: ResolveMapContext<S>) => R;

    /** Static state. Shortcut for `getState: () => state`. */
    state?: S;

    /** State getter. Mutually exclusive with `state`. */
    getState?: () => S;

    /** Initial RRU. Default `'/'`. */
    initial?: string;

    /** Dev flag. Default `true` (throws on classified diagnostics). */
    dev?: boolean;
}

/**
 * Create a router with an in-memory adapter, for tests.
 *
 * @public
 */
export declare function createTestRouter<S = any, R extends RouterMap = RouterMap>(
    options: CreateTestRouterOptions<S, R>
): { router: Router<S, R>; adapter: MemoryAdapter };
