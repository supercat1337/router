/**
 * Path-mode and hash-mode URL adapters. The only layer that converts
 * between Browser URLs (BU) and Router-relative URLs (RRU).
 *
 * @packageDocumentation
 */

/**
 * Create a hash-mode URL adapter (`#/...` in the browser URL).
 *
 * Default `base` is `location.pathname` (no trailing slash normalization);
 * `<base href>` does not participate. An explicit `base` is validated. In
 * SSR without `location`, an explicit `base` is required.
 *
 * `read` returns a valid RRU or `/`. `/` when the hash does not start with
 * `/` (e.g. `#section`) or contains a second `#` (`#/users#section`).
 * `read` in SSR throws `TypeError`.
 *
 * In-page anchors in hash mode are not supported via `href`; use
 * `scrollIntoView` after `afterEnter`.
 *
 * @param {{ base?: string }} [opts]
 * @returns {UrlAdapter}
 */
export declare function createHashAdapter({ base }?: {
    base?: string;
}): UrlAdapter_3;

/**
 * Create a path-mode URL adapter (history API, `base` as pathname prefix).
 *
 * `read`/`write` are the only functions that touch `location`/`history`.
 * `read` returns a valid RRU: fallback `'/'` if `location.pathname` is not
 * under `base`, or if the computed RRU would contain `#` (defensive).
 *
 * SSR: `read` returns `'/'`, `write`/`listen` are no-ops. `normalize` is
 * not called in SSR (`attachLinks` is a no-op there); behavior undefined.
 *
 * @param {{ base?: string }} [opts]
 * @returns {UrlAdapter}
 */
export declare function createPathAdapter({ base }?: {
    base?: string;
}): UrlAdapter;

declare type UrlAdapter = UrlAdapter_2;

/**
 * The only layer that knows about Browser URLs (BU). The core works in
 * Router-relative URLs (RRU). `read()` must return a valid RRU (starts
 * with `/`, no `#`, non-empty).
 *
 * @public
 */
declare interface UrlAdapter_2 {
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

declare type UrlAdapter_3 = UrlAdapter_2;

export { }
