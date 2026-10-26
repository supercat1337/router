/**
 * Path-mode and hash-mode URL adapters. The only layer that converts
 * between Browser URLs (BU) and Router-relative URLs (RRU).
 *
 * @packageDocumentation
 */

/**
 * Create a hash-mode URL adapter (`#/...` in the browser URL).
 *
 * @public
 */
export declare function createHashAdapter(input?: {
    base?: string;
}): UrlAdapter;

/**
 * Create a path-mode URL adapter (history API, `base` as pathname prefix).
 *
 * @public
 */
export declare function createPathAdapter(input?: {
    base?: string;
}): UrlAdapter;

/**
 * Options for `adapter.href()`.
 *
 * @public
 */
export declare interface HrefOptions {
    /**
     * Search string including leading `?`, or `''` for none. Only used by
     * hash-mode adapters (path-mode RRUs already carry search). When omitted,
     * hash mode reads `location.search`; in SSR this is `''`.
     */
    search?: string;
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
    /**
     * Build a Browser URL (BU) from an RRU. Required — used by `<Link>`
     * components and SSR. Path mode: `base + rru.slice(1)`. Hash mode:
     * `base + search + '#' + rru`, where `search` defaults to
     * `location.search` and can be overridden via `opts.search` (SSR).
     *
     * @throws {TypeError} if `rru` does not start with `/`.
     */
    href(rru: string, opts?: HrefOptions): string;
    /**
     * Read `history.state` (or adapter equivalent). Optional — for
     * scroll restoration. Returns `null` when unavailable (SSR, non-browser
     * contexts, adapters that do not track history state).
     */
    historyState(): unknown;
    /**
     * Replace `history.state` **without changing the URL**. Optional —
     * for scroll restoration and app-level per-history-entry state.
     */
    replaceState(state: unknown): void;
    /** Base directory (path mode) or base pathname (hash mode). */
    readonly base?: string;
}

export { }
