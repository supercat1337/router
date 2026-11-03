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
 * @property {(cb: OnListenerError) => () => void} onListenerError
 */

/**
 * Thin adapter over `@supercat1337/event-emitter` that preserves the
 * router's event contract:
 *
 * - `emit(event, payload)` passes `payload` as the single listener argument;
 * - listener errors are reported via `onListenerError(err, { event, snapshot })`,
 *   with `console.error` as fallback;
 * - `on` returns an idempotent unsubscribe; `once` auto-unsubscribes after
 *   the first emit;
 * - `onListenerError(cb)` subscribes post-construction — additive to the
 *   constructor-level hook.
 *
 * @param {OnListenerError | undefined} onListenerError
 * @returns {EventBus}
 */
export function createEventBus(onListenerError) {
    const emitter = new EventEmitter();

    /** @type {Set<OnListenerError>} */
    const errorListeners = new Set();

    emitter.onListenerError(
        /**
         * @param {unknown} err
         * @param {string} event
         * @param {any} payload
         */
        (err, event, payload) => {
            /** @type {{ event: keyof EventPayloads, snapshot: Snapshot }} */
            const info = {
                event: /** @type {keyof EventPayloads} */ (event),
                snapshot: /** @type {Snapshot} */ (
                    /** @type {any} */ (payload)?.snapshot
                ),
            };

            // 1. Constructor-level hook — the baseline error sink.
            if (onListenerError) {
                onListenerError(err, info);
            }

            // 2. Per-listener subscriptions — added post-construction via
            //    `router.onListenerError(cb)`. Additive to the constructor hook.
            for (const cb of errorListeners) {
                try {
                    cb(err, info);
                } catch (e) {
                    // A throwing error listener must not break navigation,
                    // and must not recurse back into onListenerError.
                    if (typeof console !== "undefined" && console.error) {
                        console.error("[onListenerError] listener threw:", e);
                    }
                }
            }

            // 3. Fallback only when nothing handled it.
            if (!onListenerError && errorListeners.size === 0) {
                if (typeof console !== "undefined" && console.error) {
                    console.error(err);
                }
            }
        },
    );

    return /** @type {EventBus} */ ({
        on: (event, listener) => emitter.on(event, listener),
        off: (event, listener) => emitter.off(event, listener),
        once: (event, listener) => emitter.once(event, listener),
        emit: (event, payload) => emitter.emit(event, payload),
        onListenerError(cb) {
            errorListeners.add(cb);
            return () => {
                errorListeners.delete(cb);
            };
        },
    });
}