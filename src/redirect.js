// @ts-check

import { REDIRECT_BRAND } from './internal/symbols.js';

/**
 * @typedef {import('./types.js').RedirectResult} RedirectResult
 */

/**
 * Construct a branded redirect result. Returned from a `notFound` handler
 * to signal "do not commit this URL; go to `url` instead".
 *
 * The returned object is frozen and carries an internal brand symbol;
 * consumers narrow with `isRedirect` before reading `.url`. Branding
 * distinguishes an intentional redirect from a render value that happens
 * to have a `url` field.
 *
 * The cast goes through `unknown` because the runtime symbol in
 * `symbols.js` and the phantom type symbol in `types.ts` are distinct
 * `unique symbol`s by design — see `types.ts` header for rationale.
 *
 * @param {string} url
 * @returns {RedirectResult}
 */
export function redirect(url) {
    return /** @type {RedirectResult} */ (
        /** @type {unknown} */ (
            Object.freeze({
                [REDIRECT_BRAND]: true,
                url: String(url),
            })
        )
    );
}

/**
 * Brand check for `RedirectResult`. Runtime narrowing, not a structural
 * check: an object shaped like `{ url }` but without the symbol is not a
 * redirect.
 *
 * @param {unknown} x
 * @returns {x is RedirectResult}
 */
export function isRedirect(x) {
    return x !== null && typeof x === 'object' && /** @type {any} */ (x)[REDIRECT_BRAND] === true;
}
