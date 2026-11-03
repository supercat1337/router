// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function setup(opts = {}) {
    const map = createMap(
        {
            login: file({ name: 'login' }),
            profile: file({ name: 'profile' }),
        },
        { notFound: nf }
    );
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
        ...opts,
    });
    return router;
}

test('onListenerError: post-construction subscription fires', t => {
    const router = setup();
    /** @type {Array<{ err: unknown, event: string }>} */
    const seen = [];
    router.onListenerError((err, info) => seen.push({ err, event: info.event }));
    router.on('afterEnter', () => {
        throw new Error('boom');
    });
    router.navigate('/profile');
    t.is(seen.length, 1);
    t.is(/** @type {Error} */ (seen[0].err).message, 'boom');
    t.is(seen[0].event, 'afterEnter');
});

test('onListenerError: additive to constructor hook', t => {
    /** @type {string[]} */
    const order = [];
    const router = setup({
        onListenerError: () => order.push('constructor'),
    });
    router.onListenerError(() => order.push('subscriber'));
    router.on('afterEnter', () => {
        throw new Error('boom');
    });
    router.navigate('/profile');
    t.deepEqual(order, ['constructor', 'subscriber']);
});

test('onListenerError: unsubscribe is idempotent', t => {
    const orig = console.error;
    console.error = () => {};
    t.teardown(() => {
        console.error = orig;
    });

    const router = setup();
    let count = 0;
    const unsub = router.onListenerError(() => count++);
    unsub();
    unsub();
    router.on('afterEnter', () => {
        throw new Error('boom');
    });
    router.navigate('/profile');
    t.is(count, 0);
});

test('onListenerError: multiple subscribers all fire', t => {
    const router = setup();
    let a = 0;
    let b = 0;
    router.onListenerError(() => a++);
    router.onListenerError(() => b++);
    router.on('afterEnter', () => {
        throw new Error('boom');
    });
    router.navigate('/profile');
    t.is(a, 1);
    t.is(b, 1);
});

test('onListenerError: throwing error listener does not break the error chain', t => {
    const orig = console.error;
    console.error = () => {};
    t.teardown(() => {
        console.error = orig;
    });

    const router = setup();
    let second = 0;
    // First error listener throws — this must not prevent the second from
    // running, and must not recurse into onListenerError.
    router.onListenerError(() => {
        throw new Error('inner-boom');
    });
    router.onListenerError(() => second++);
    // The event listener throws — this is what triggers onListenerError.
    router.on('afterEnter', () => {
        throw new Error('event-boom');
    });
    const snap = router.navigate('/profile');
    // First error listener threw, second still ran.
    t.is(second, 1);
    // Navigation completed — listener errors do not break the transaction.
    t.is(snap.status, 'matched');
    t.is(snap.url, '/profile');
});

test('onListenerError: dev reentrancy via listener throw is reported', t => {
    const router = setup({ dev: true });
    /** @type {unknown[]} */
    const errors = [];
    router.onListenerError(err => errors.push(err));
    router.on('afterEnter', () => {
        try {
            router.navigate('/profile');
        } catch (e) {
            // Re-throw so emit() sees the TypeError — reentrancy in dev.
            throw e;
        }
    });
    router.navigate('/profile');
    t.is(errors.length, 1);
    t.true(errors[0] instanceof TypeError);
});
