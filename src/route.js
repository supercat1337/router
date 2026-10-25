// @ts-check

import { ROUTE_BRAND } from './internal/symbols.js';

/**
 * @typedef {import('./types.js').Route} Route
 */

/**
 * Create a branded, frozen `Route` handle.
 *
 * @internal
 * @param {{
 *   name: string,
 *   params: readonly string[],
 *   buildUrl: (params: Record<string, string> | undefined) => string,
 * }} config
 * @returns {Route}
 */
export function createRoute({ name, params, buildUrl }) {
    return /** @type {Route} */ (
        Object.freeze(
            /** @type {any} */ ({
                name,
                params: Object.freeze([...params]),
                url(/** @type {Record<string, string> | undefined} */ p) {
                    return buildUrl(p);
                },
                [ROUTE_BRAND]: true,
            })
        )
    );
}

/**
 * Brand check for a `Route`. The only supported way to detect one at
 * runtime — `instanceof` will not work, and structural lookalikes
 * return `false`.
 *
 * @public
 * @param {unknown} x
 * @returns {x is Route}
 */
export function isRoute(x) {
    return x !== null && typeof x === 'object' && /** @type {any} */ (x)[ROUTE_BRAND] === true;
}
