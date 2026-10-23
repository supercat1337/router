// @ts-check

import { EventEmitter } from "@supercat1337/event-emitter";

/**
 * @typedef {import('./types.js').EventPayloads} EventPayloads
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {(err: unknown, info: { event: keyof EventPayloads, snapshot: Snapshot }) => void} OnListenerError
 * @typedef {object} EventBus
 * @property {<E extends keyof EventPayloads>(event: E, listener: (payload: EventPayloads[E]) => void) => () => void} on
 * @property {<E extends keyof EventPayloads>(event: E, listener: (payload: EventPayloads[E]) => void) => void} off
 * @property {<E extends keyof EventPayloads>(event: E, listener: (payload: EventPayloads[E]) => void) => () => void} once
 * @property {<E extends keyof EventPayloads>(event: E, payload: EventPayloads[E]) => void} emit
 */

/**
 * Thin adapter over `@supercat1337/event-emitter` that preserves the
 * router's event contract:
 *
 * - `emit(event, payload)` passes `payload` as the single listener argument;
 * - listener errors are reported via `onListenerError(err, { event, snapshot })`,
 *   with `console.error` as fallback;
 * - `on` returns an idempotent unsubscribe; `once` auto-unsubscribes after
 *   the first emit.
 *
 * @param {OnListenerError | undefined} onListenerError
 * @returns {EventBus}
 */
export function createEventBus(onListenerError) {
    const emitter = new EventEmitter();

    // Verify against the library's actual `.d.ts`: `(err, event, payload)`
    // vs `(err, { event, payload })` vs `(err, ...args)`. Adapt the adapter
    // below, not the tests.
    emitter.onListenerError(
        /**
         * @param {unknown} err
         * @param {string} event
         * @param {any} payload
         */
        (err, event, payload) => {
            if (onListenerError) {
                onListenerError(err, {
                    event: /** @type {keyof EventPayloads} */ (event),
                    snapshot: /** @type {Snapshot} */ (
                        /** @type {any} */ (payload)?.snapshot
                    ),
                });
            } else if (
                typeof console !== "undefined" &&
                console.error
            ) {
                console.error(err);
            }
        },
    );

    return /** @type {EventBus} */ ({
        on: (event, listener) => emitter.on(event, listener),
        off: (event, listener) => emitter.off(event, listener),
        once: (event, listener) => emitter.once(event, listener),
        emit: (event, payload) => emitter.emit(event, payload),
    });
}