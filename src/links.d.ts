/**
 * Optional `attachLinks` module: delegated click interception for
 * `[data-router-link]` elements. Opt-in; no global side effects on import.
 *
 * @packageDocumentation
 */

import type {
    AttachLinksOptions,
    AttachPreloadOptions,
    Children,
    FileMeta,
    FileNode,
    FolderNode,
    FolderOptions,
    MatchResult,
    NavigationErrorType,
    NavigationType,
    Node,
    NotFoundContext,
    NotFoundHandler,
    NotFoundResult,
    ParamsArgs,
    PreloadContext,
    Route,
    RouteParamsOf,
    RouterMap,
    Snapshot,
    UrlAdapter,
} from './types.js';

export type {
    AttachLinksOptions,
    AttachPreloadOptions,
    PreloadContext,
    UrlAdapter,
    // Transitive — Snapshot appears in public signatures; api-extractor
    // requires every type reachable through it to be re-exported here.
    MatchResult,
    NavigationErrorType,
    NavigationType,
    Node,
    NotFoundContext,
    NotFoundHandler,
    NotFoundResult,
    ParamsArgs,
    Route,
    RouteParamsOf,
    RouterMap,
    Snapshot,
    // Transitive — Node = FileNode | FolderNode; FileMeta / FolderOptions /
    // Children are their default generic arguments. Without these, the
    // recursive closure is still "forgotten".
    Children,
    FileMeta,
    FileNode,
    FolderNode,
    FolderOptions,
};

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
 * Attach preload-on-hover/focus to `[data-router-link]` elements. When the
 * user hovers or focuses a link, normalizes its `href` and calls
 * `options.preload(leaf, ctx)` for the matched leaf node. `ctx.signal`
 * aborts when `attachPreload(...)` is detached. Intended to warm a
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