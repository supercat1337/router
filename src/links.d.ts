/**
 * Optional `attachLinks` module: delegated click interception for
 * `[data-router-link]` elements. Opt-in; no global side effects on import.
 *
 * @packageDocumentation
 */

export declare function attachLinks(
    router: import('./types.js').Router,
    options?: import('./types.js').AttachLinksOptions
): () => void;
