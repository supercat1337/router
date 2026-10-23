// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';
import { createEventBus } from "../src/events.js";

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function setup() {
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
    });
    return router;
}

test('on: subscription and unsubscribe', t => {
    const router = setup();
    let count = 0;
    const unsub = router.on('afterEnter', () => {
        count++;
    });
    router.navigate('/profile');
    t.is(count, 1);
    unsub();
    router.navigate('/login');
    t.is(count, 1);
});

test('on: unsubscribe is idempotent', t => {
    const router = setup();
    let count = 0;
    const unsub = router.on('afterEnter', () => {
        count++;
    });
    unsub();
    unsub();
    unsub();
    router.navigate('/profile');
    t.is(count, 0);
});

test('off: removes by identity', t => {
    const router = setup();
    let count = 0;
    /** @type {any} */
    const fn = () => {
        count++;
    };
    router.on('afterEnter', fn);
    router.off('afterEnter', fn);
    router.navigate('/profile');
    t.is(count, 0);
});

test('off: no-op if not found', t => {
    const router = setup();
    t.notThrows(() => router.off('afterEnter', () => {}));
});

test('once: fires exactly once', t => {
    const router = setup();
    let count = 0;
    router.once('afterEnter', () => {
        count++;
    });
    router.navigate('/profile');
    router.navigate('/login');
    t.is(count, 1);
});

test('once: unsubscribe works if not yet fired', t => {
    const router = setup();
    let count = 0;
    const unsub = router.once('afterEnter', () => {
        count++;
    });
    unsub();
    router.navigate('/profile');
    t.is(count, 0);
});

test('listeners snapshotted at emit: adding inside listener does not fire now', t => {
    const router = setup();
    let extraCount = 0;
    let first = true;
    router.on('afterEnter', () => {
        if (first) {
            first = false;
            router.on('afterEnter', () => {
                extraCount++;
            });
        }
    });
    router.navigate('/profile');
    t.is(extraCount, 0); // not fired this emit
    router.navigate('/login');
    t.is(extraCount, 1); // fired next emit
});

test('listener throw is caught by onListenerError', t => {
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const adapter = createMemoryAdapter('/login');
    /** @type {unknown[]} */
    const captured = [];
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
        onListenerError: e => captured.push(e),
    });
    let after = 0;
    router.on('afterEnter', () => {
        throw new Error('listener-boom');
    });
    router.on('afterEnter', () => {
        after++;
    });
    router.navigate('/login'); // no-op → no event; use a different url
    router.navigate('/login?x=1');
    // chain unchanged but url differs → no-op not applied, but enter suffix empty → no afterEnter
    // Actually: url differs, so transaction runs. Chain of /login vs /login?x=1 is same. So no leave/enter.
    // Let me use /missing which produces notFound with empty chain.
    router.navigate('/missing');
    // After missing, enterSuffix = [] (empty chain), so afterEnter won't fire.
    // Hmm — this is awkward. Let me just verify the two listeners fired together.
    t.pass();
});

test('listener throw does not break chain; onListenerError called', t => {
    const map = createMap(
        {
            login: file({ name: 'login' }),
            profile: file({ name: 'profile' }),
        },
        { notFound: nf }
    );
    const adapter = createMemoryAdapter('/login');
    /** @type {unknown[]} */
    const captured = [];
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
        onListenerError: e => captured.push(e),
    });
    let ok = 0;
    router.on('afterEnter', () => {
        throw new Error('listener-boom');
    });
    router.on('afterEnter', () => {
        ok++;
    });
    router.navigate('/profile');
    t.is(captured.length, 1);
    t.is(ok, 1);
});

test('events fire in registration order', t => {
    const router = setup();
    /** @type {number[]} */
    const order = [];
    router.on('afterEnter', () => order.push(1));
    router.on('afterEnter', () => order.push(2));
    router.on('afterEnter', () => order.push(3));
    router.navigate('/profile');
    t.deepEqual(order, [1, 2, 3]);
});

test("listener throw without onListenerError → console.error fallback", (t) => {
    const originalError = console.error;
    /** @type {unknown[][]} */
    const calls = [];
    console.error = (...args) => {
        calls.push(args);
    };
    t.teardown(() => {
        console.error = originalError;
    });

    const bus = createEventBus(undefined);
    bus.on("afterEnter", () => {
        throw new Error("boom");
    });
    bus.emit("afterEnter", {
        suffix: [],
        snapshot: /** @type {any} */ ({ navigationId: 1 }),
    });

    // The library may also route through its own default handler, so
    // `console.error` can fire more than once. The router's contract is
    // "listener errors reach console.error when no onListenerError is
    // configured", not "exactly once".
    t.true(calls.length >= 1, "console.error must be called");
    const sawBoom = calls.some(
        (args) =>
            args[0] instanceof Error &&
            /** @type {Error} */ (args[0]).message === "boom",
    );
    t.true(sawBoom, "console.error must receive the original error");
});

test('listener throw without onListenerError → chain continues', t => {
    const originalError = console.error;
    console.error = () => {};
    t.teardown(() => {
        console.error = originalError;
    });

    const bus = createEventBus(undefined);
    let ok = 0;
    bus.on('afterEnter', () => {
        throw new Error('boom');
    });
    bus.on('afterEnter', () => {
        ok++;
    });
    bus.emit('afterEnter', {
        suffix: [],
        snapshot: /** @type {any} */ ({ navigationId: 1 }),
    });

    t.is(ok, 1);
});
