/**
 * Optional async guard layer. Runs guards before the core commits a
 * navigation, allowing auth checks, permission checks, and preloading
 * without touching the synchronous core.
 *
 * @packageDocumentation
 */

export declare function createGuardLayer(
    options: import('./types.js').CreateGuardLayerOptions
): import('./types.js').GuardLayer;
