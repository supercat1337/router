// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createGuardLayer } from '../src/guard.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function basicMap() {
    return createMap({ a: file({ name: 'a' }), b: file({ name: 'b' }) }, { notFound: nf });
}

test('pending: signal present while guard in flight', async t => {
    const adapter = createMemoryAdapter('/a');
    /** @type {AbortSignal | null} */
    let captured = null;
    /** @type {() => void} */
    let release = () => {};
    const gate = new Promise(r => {
        release = /** @type {any} */ (r);
    });

    const guard = createGuardLayer({
        guards: [
            async () => {
                const p = guard.pending();
                if (p) captured = p.signal;
                await gate;
                return 'allow';
            },
        ],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);

    const nav = guard.navigate();
    const p = nav.navigate('/b');
    for (let i = 0; i < 10 && !captured; i++) {
        await Promise.resolve();
    }
    t.truthy(captured);
    if (captured) t.false(/** @type {AbortSignal} */ (captured).aborted);

    release();
    await p;
});

test('pending: signal aborted when newer navigation starts', async t => {
    const adapter = createMemoryAdapter('/a');
    /** @type {AbortSignal | null} */
    let captured = null;
    /** @type {() => void} */
    let releaseFirst = () => {};
    const gate = new Promise(r => {
        releaseFirst = /** @type {any} */ (r);
    });
    let firstStarted = false;
    let calls = 0;

    const guard = createGuardLayer({
        guards: [
            async () => {
                calls++;
                if (calls === 1) {
                    firstStarted = true;
                    const p = guard.pending();
                    if (p) captured = p.signal;
                    await gate;
                }
                return 'allow';
            },
        ],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);

    const nav = guard.navigate();
    const p1 = nav.navigate('/b');
    for (let i = 0; i < 10 && !firstStarted; i++) {
        await Promise.resolve();
    }

    t.truthy(captured);
    if (captured) t.false(/** @type {AbortSignal} */ (captured).aborted);

    // Second nav aborts the first controller.
    const p2 = nav.navigate('/a');
    if (captured) t.true(/** @type {AbortSignal} */ (captured).aborted);

    releaseFirst();
    await Promise.all([p1, p2]);
});

test('pending: signal null when idle', t => {
    const guard = createGuardLayer({ guards: [], dev: true });
    t.is(guard.pending(), null);
});
