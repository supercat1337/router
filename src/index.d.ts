/**
 * Synchronous state-relative router for SPA and SSR over a tree of
 * JS objects. Core entry: maps, matching, transactions, events, URL
 * adapter interface. See `@supercat1337/router/adapters`,
 * `/links`, `/guard` for the optional subpath modules.
 *
 * @packageDocumentation
 */

export { file, folder, isFile, isFolder } from './data-model.js';
export { createMap, isMap, MapValidationError } from './map.js';
export { redirect, isRedirect } from './redirect.js';
export { normalizeRRU } from './normalize.js';
export { createRouter } from './router.js';

export type {
    FileMeta,
    FolderOptions,
    Children,
    FileNode,
    FolderNode,
    Node,
    NotFoundContext,
    NotFoundResult,
    NotFoundHandler,
    RedirectResult,
    RouterMap,
    MatchResult,
    MapValidationErrorCode,
    Snapshot,
    EventPayloads,
    NavigationErrorType,
    UrlAdapter,
    Router,
    CreateRouterOptions,
    ResolveMapContext,
    OnListenerError,
    GuardErrorType,
    Decision,
    GuardContext,
    Guard,
    NavResult,
    GuardLayer,
    CreateGuardLayerOptions,
    OnGuardError,
    AttachLinksOptions,
} from './types.js';
