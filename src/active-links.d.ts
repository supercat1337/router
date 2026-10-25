/**
 * Optional `attachActiveLinks` module: `aria-current` marking for
 * `[data-router-link]` elements. Opt-in; no global side effects on import.
 *
 * @packageDocumentation
 */

import type {
    AttachActiveLinksOptions,
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
    AttachActiveLinksOptions,
    UrlAdapter,
    // Transitive — Snapshot appears in the public signature; api-extractor
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
    // Transitive — Node = FileNode | FolderNode; FileMeta.preload uses
    // PreloadContext. Without these, the closure is still "forgotten".
    Children,
    FileMeta,
    FileNode,
    FolderNode,
    FolderOptions,
    PreloadContext,
};

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