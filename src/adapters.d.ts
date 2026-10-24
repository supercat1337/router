/**
 * Path-mode and hash-mode URL adapters. The only layer that converts
 * between Browser URLs (BU) and Router-relative URLs (RRU).
 *
 * @packageDocumentation
 */

import type { UrlAdapter } from './types.js';

export type { UrlAdapter };

/**
 * Create a path-mode URL adapter (history API, `base` as pathname prefix).
 *
 * @public
 */
export declare function createPathAdapter(input?: {
    base?: string;
}): UrlAdapter;

/**
 * Create a hash-mode URL adapter (`#/...` in the browser URL).
 *
 * @public
 */
export declare function createHashAdapter(input?: {
    base?: string;
}): UrlAdapter;