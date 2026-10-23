// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function basicMap() {
    return createMap(
        {
            login: file({ name: 'login' }),
            profile: folder({}, { index: file({ name: 'profile' }) }),
        },
        { notFound: nf }
    );
}

test('initial commits a matched snapshot', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const snap = router.getSnapshot();
    t.is(snap.status, 'matched');
    t.is(snap.url, '/login');
    t.is(snap.navigationId, 1);
    t.is(snap.map, map);
});

test('initial with unknown URL commits a notFound snapshot', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/missing');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const snap = router.getSnapshot();
    t.is(snap.status, 'notFound');
    t.deepEqual(snap.chain, []);
});

test('navigate pushes and increments navigationId', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const snap = router.navigate('/profile');
    t.is(snap.status, 'matched');
    t.is(snap.navigationId, 2);
    t.is(snap.url, '/profile');
    t.is(adapter.read(), '/profile');
});

test('navigate(current) is no-op — same reference, no ID increment', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const before = router.getSnapshot();
    const after = router.navigate('/login');
    t.is(after, before);
});

test('navigate(current) after error is not a no-op', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    let shouldThrow = false;
    const router = createRouter({
        resolveMap: () => {
            if (shouldThrow) throw new Error('boom');
            return map;
        },
        getState: () => ({}),
        adapter,
        dev: false,
    });
    shouldThrow = true;
    router.navigate('/profile');
    t.is(router.getSnapshot().status, 'error');
    shouldThrow = false;
    const beforeId = router.getSnapshot().navigationId;
    const after = router.navigate('/login');
    t.is(after.status, 'matched');
    t.is(after.navigationId, beforeId + 1);
});

test('revalidate always increments ID even if nothing changed', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const before = router.getSnapshot().navigationId;
    const snap = router.revalidate();
    t.is(snap.navigationId, before + 1);
});

test('error snapshot: map and chain from prev; params {}; partialParams from prev', t => {
    const mapA = basicMap();
    const adapter = createMemoryAdapter('/login');
    let throwing = false;
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return mapA;
        },
        getState: () => ({}),
        adapter,
        dev: false,
    });
    throwing = true;
    const errSnap = router.navigate('/profile');
    t.is(errSnap.status, 'error');
    t.is(errSnap.map, mapA);
    t.is(errSnap.chain.length, router.getHistory()[0].chain.length);
    t.deepEqual(errSnap.params, {});
    t.deepEqual(errSnap.error?.partialChain, []);
    t.deepEqual(errSnap.error?.partialParams, {});
});

test('dev mode: resolver-throw propagates', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    let throwing = false;
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return map;
        },
        getState: () => ({}),
        adapter,
        dev: true,
    });
    throwing = true;
    t.throws(() => router.navigate('/profile'), { message: 'boom' });
});

test('initial + resolver-throw throws from createRouter', t => {
    const adapter = createMemoryAdapter('/login');
    t.throws(
        () =>
            createRouter({
                resolveMap: () => {
                    throw new Error('boom');
                },
                getState: () => ({}),
                adapter,
                dev: true,
            }),
        { message: 'boom' }
    );
});

test('initial + resolver-null throws TypeError from createRouter', t => {
    const adapter = createMemoryAdapter('/login');
    t.throws(
        () =>
            createRouter({
                resolveMap: () => /** @type {any} */ (null),
                getState: () => ({}),
                adapter,
                dev: true,
            }),
        { instanceOf: TypeError }
    );
});

test('reentrancy: dev throws to caller (caught by emit → onListenerError)', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    /** @type {unknown[]} */
    const errors = [];
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
        onListenerError: e => errors.push(e),
    });
    let innerSawTypeError = false;
    router.on('afterEnter', () => {
        try {
            router.navigate('/profile');
        } catch (e) {
            innerSawTypeError = e instanceof TypeError;
            throw e; // re-throw so emit sees it
        }
    });
    const outer = router.navigate('/profile');
    t.is(outer.status, 'matched');
    t.true(innerSawTypeError);
    t.is(errors.length, 1);
    t.true(errors[0] instanceof TypeError);
});

test('reentrancy: prod returns current snapshot, no event', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    /** @type {ReturnType<typeof createRouter> | null} */
    let r = null;
    r = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: false,
    });
    let innerResult = null;
    let events = 0;
    r.on('afterEnter', () => {
        innerResult = r?.navigate('/profile');
    });
    r.on('afterEnter', () => {
        events++;
    });
    const outer = r.navigate('/profile');
    t.is(innerResult, r.getSnapshot());
    t.is(outer, r.getSnapshot());
    // afterEnter fires twice (once for /profile, once for the inner no-op that
    // doesn't happen — inner call returns current without new transaction).
    // Actually: inner call returns current snapshot without a new transaction,
    // so no second emit. So events counts afterEnter for /profile only.
    t.is(events, 1);
});

test('isCurrent reflects committed ID', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const id = router.getSnapshot().navigationId;
    t.true(router.isCurrent(id));
    router.navigate('/profile');
    t.false(router.isCurrent(id));
});

test('getActiveMap returns the committed map', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.is(router.getActiveMap(), map);
});

test('url delegates to active map', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.is(router.url('login'), '/login');
});

test('popstate commits new snapshot', t => {
    const map = basicMap();
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    adapter.setCurrent('/profile');
    adapter.trigger();
    const snap = router.getSnapshot();
    t.is(snap.status, 'matched');
    t.is(snap.url, '/profile');
});

test("replace: writes url to adapter when different from current", (t) => {
    const map = createMap(
        {
            login: file({ name: "login" }),
            profile: file({ name: "profile" }),
        },
        { notFound: nf },
    );
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const snap = router.replace("/profile");
    t.is(snap.status, "matched");
    t.is(snap.url, "/profile");
    t.is(adapter.read(), "/profile");
});