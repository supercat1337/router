/**
 * Optional `attachLinks` module: delegated click interception for
 * `[data-router-link]` elements. Opt-in; no global side effects on import.
 *
 * @packageDocumentation
 */

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
 * Options for `attachLinks`. `navigate` / `replace` receive an RRU, not an
 * `href`; `attachLinks` normalizes before calling them.
 *
 * @public
 */
export declare interface AttachLinksOptions {
    /** Override for the navigate action. Default: `router.navigate`. */
    navigate?: (rru: string) => unknown;
    /** Override for the replace action. Default: `router.replace`. */
    replace?: (rru: string) => unknown;
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
    /** Base directory (path mode) or base pathname (hash mode). */
    readonly base?: string;
}

export { }
