/**
 * Optional `attachLinks` module: delegated click interception for
 * `[data-router-link]` elements. Opt-in; no global side effects on import.
 *
 * @packageDocumentation
 */

import type { AttachLinksOptions, UrlAdapter } from './types.js';

export type { AttachLinksOptions, UrlAdapter };

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
