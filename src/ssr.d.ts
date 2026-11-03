/**
 * Server-side `UrlAdapter` and SSR hydration helpers. Opt-in subpath —
 * `@supercat1337/router/ssr`. See `docs/api/ssr.md` for the full pattern.
 *
 * @packageDocumentation
 */

import type {
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
    Router,
    RouterMap,
    Snapshot,
    UrlAdapter,
} from './types.js';

export type {
    // Direct — in public signatures.
    Router,
    Snapshot,
    UrlAdapter,
    // Transitive — api-extractor requires every reachable type to be
    // re-exported. Without these, `Snapshot` / `Router` / `UrlAdapter`
    // produce `ae-forgotten-export` errors on their closure.
    //
    // `PreloadContext` is here because `FileMeta.preload` references it;
    // `FileMeta` is reachable through `Snapshot.chain → Node → FileNode`.
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
    RouterMap,
};

/**
 * The four fields compared by `assertHydration`. Serialize only these —
 * `Snapshot` as a whole contains non-serializable fields (`map`, `chain`).
 *
 * @public
 */
export type HydrationSnapshot = Pick<Snapshot, 'url' | 'status' | 'params' | 'search'>;

/**
 * Create a server-side `UrlAdapter` that reads from `req.url` (or
 * `req.originalUrl`).
 *
 * Without this, the initial snapshot commits `/` regardless of the request
 * URL. With it, `navigationType: 'initial'` reflects the request.
 *
 * **Do not use on the client.** `req.url` does not exist in the browser.
 *
 * @public
 */
export declare function createServerAdapter(
    req: { url?: string; originalUrl?: string },
    opts?: { base?: string }
): UrlAdapter;

/**
 * XSS-safe JSON serialization for embedding in an HTML `<script>` tag.
 *
 * Escapes `<`, `>`, `&`, `\u2028`, `\u2029` — the sequences that break
 * HTML/JS parsing when embedded raw. Output is valid JS when parsed as
 * JSON, and round-trips with `JSON.parse` unchanged.
 *
 * @throws {TypeError} when `state` is not JSON-serializable (e.g. `undefined`).
 * @public
 */
export declare function serializeState(state: unknown): string;

/**
 * Read the state serialized by `serializeState` on the client. Reads from
 * `globalThis.__INITIAL_STATE__`. Returns `null` outside the browser or
 * when the key is unset.
 *
 * @public
 */
export declare function readInitialState<T = unknown>(): T | null;

/**
 * Dev-only hydration check. Compares `url`, `status`, `params`, `search`
 * between the server snapshot and the client router's committed snapshot.
 *
 * No-op in prod (`NODE_ENV === 'production'` or `options.dev === false`).
 * With `options.throw: true`, throws instead of `console.warn`.
 *
 * @public
 */
export declare function assertHydration(
    serverSnapshot: HydrationSnapshot,
    router: Router,
    options?: { dev?: boolean; throw?: boolean }
): void;
