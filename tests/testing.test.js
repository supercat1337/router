// @ts-check

import test from 'ava';
import { createMap, file, folder } from '../src/index.js';
import { createMemoryAdapter, createTestRouter } from '../src/testing.js';

/** @type {import('../src/types.js').NotFoundHandler} */
const nf = () => null;

function basicMap() {
    return createMap(
        {
            login: file({ name: 'login' }),
            profile: file({ name: 'profile' }),
            users: folder({ ':id': file({ name: 'user' }) }),
        },
        { notFound: nf }
    );
}

// ===========================================================================
// createMemoryAdapter
// ===========================================================================

test('createMemoryAdapter: implements UrlAdapter', t => {
    const a = createMemoryAdapter('/login');
    t.is(a.read(), '/login');
    t.is(a.base, '/');
    for (const m of [
        'write',
        'listen',
        'normalize',
        'href',
        'historyState',
        'replaceState',
        'trigger',
        'setCurrent',
        'reset',
    ]) {
        t.is(typeof (/** @type {any} */ (a)[m]), 'function', m);
    }
});

test('createMemoryAdapter: default initial is "/"', t => {
    t.is(createMemoryAdapter().read(), '/');
});

test('createMemoryAdapter: write records url + mode', t => {
    const a = createMemoryAdapter('/');
    a.write('/x', 'push');
    a.write('/y', 'replace');
    t.deepEqual(a.writeCalls, [
        { url: '/x', mode: 'push' },
        { url: '/y', mode: 'replace' },
    ]);
});

test('createMemoryAdapter: write default mode is push', t => {
    const a = createMemoryAdapter('/');
    a.write('/x');
    t.deepEqual(a.writeCalls, [{ url: '/x', mode: 'push' }]);
});

test('createMemoryAdapter: write updates read()', t => {
    const a = createMemoryAdapter('/');
    a.write('/x', 'push');
    t.is(a.read(), '/x');
});

test('createMemoryAdapter: setCurrent does not record write', t => {
    const a = createMemoryAdapter('/');
    a.setCurrent('/x');
    t.is(a.read(), '/x');
    t.is(a.writeCalls.length, 0);
});

test('createMemoryAdapter: trigger fires listeners; unsubscribe works', t => {
    const a = createMemoryAdapter('/');
    let count = 0;
    const unsub = a.listen(() => {
        count++;
    });
    a.trigger();
    t.is(count, 1);
    unsub();
    a.trigger();
    t.is(count, 1);
});

test('createMemoryAdapter: normalize', t => {
    const a = createMemoryAdapter('/');
    t.is(a.normalize('/x'), '/x');
    t.is(a.normalize('https://other.com/x'), null);
});

test('createMemoryAdapter: href validates RRU', t => {
    const a = createMemoryAdapter('/');
    t.is(a.href('/x'), '/x');
    t.throws(() => a.href('x'), { instanceOf: TypeError });
});

test('createMemoryAdapter: historyState / replaceState round-trip', t => {
    const a = createMemoryAdapter('/');
    t.is(a.historyState(), null);
    a.replaceState({ scroll: 100 });
    t.deepEqual(a.historyState(), { scroll: 100 });
});

test('createMemoryAdapter: reset clears writeCalls and state; current preserved', t => {
    const a = createMemoryAdapter('/start');
    a.write('/x', 'push');
    a.replaceState({ scroll: 1 });
    a.reset();
    t.is(a.writeCalls.length, 0);
    t.is(a.historyState(), null);
    t.is(a.read(), '/x');
});

// ===========================================================================
// createTestRouter
// ===========================================================================

test('createTestRouter: map + state shorthand', t => {
    const { router, adapter } = createTestRouter({
        map: basicMap(),
        state: { user: 'alice' },
        initial: '/login',
    });
    t.truthy(router);
    t.truthy(adapter);
    t.is(router.getSnapshot().url, '/login');
    t.deepEqual(router.getState(), { user: 'alice' });
});

test('createTestRouter: default initial "/"', t => {
    const { router } = createTestRouter({ map: basicMap(), state: {} });
    t.is(router.getSnapshot().url, '/');
});

test('createTestRouter: default dev true — throws on error', t => {
    let broken = false;
    const { router } = createTestRouter({
        resolveMap: () => {
            if (broken) throw new Error('boom');
            return basicMap();
        },
        state: {},
    });
    broken = true;
    t.throws(() => router.navigate('/x'), { message: 'boom' });
});

test('createTestRouter: dev false — returns error snapshot', t => {
    let broken = false;
    const { router } = createTestRouter({
        resolveMap: () => {
            if (broken) throw new Error('boom');
            return basicMap();
        },
        state: {},
        dev: false,
    });
    broken = true;
    const snap = router.navigate('/x');
    t.is(snap.status, 'error');
});

test('createTestRouter: resolveMap (multi-map)', t => {
    const guestMap = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const userMap = createMap(
        { login: file({ name: 'login' }), profile: file({ name: 'profile' }) },
        { notFound: nf }
    );
    const { router } = createTestRouter({
        resolveMap: ({ state }) => (state.isAuthed ? userMap : guestMap),
        state: { isAuthed: false },
        initial: '/login',
    });
    t.is(router.getSnapshot().url, '/login');
});

test('createTestRouter: getState override', t => {
    let state = { count: 1 };
    const { router } = createTestRouter({
        map: basicMap(),
        getState: () => state,
    });
    t.deepEqual(router.getState(), { count: 1 });
    state = { count: 2 };
    t.deepEqual(router.getState(), { count: 2 });
});

test('createTestRouter: throws if map + resolveMap', t => {
    t.throws(() => createTestRouter({ map: basicMap(), resolveMap: () => basicMap(), state: {} }), {
        message: /pass map or resolveMap, not both/,
    });
});

test('createTestRouter: throws if state + getState', t => {
    t.throws(() => createTestRouter({ map: basicMap(), state: {}, getState: () => ({}) }), {
        message: /pass state or getState, not both/,
    });
});

test('createTestRouter: throws if neither map nor resolveMap', t => {
    t.throws(() => createTestRouter({ state: {} }), {
        message: /map or resolveMap is required/,
    });
});

test('createTestRouter: throws on non-object options', t => {
    t.throws(() => createTestRouter(/** @type {any} */ (null)), { instanceOf: TypeError });
    t.throws(() => createTestRouter(/** @type {any} */ ([])), { instanceOf: TypeError });
});

// ===========================================================================
// Integration
// ===========================================================================

test('integration: navigate + writeCalls + trigger popstate', t => {
    const { router, adapter } = createTestRouter({
        map: basicMap(),
        state: {},
        initial: '/login',
    });

    router.navigate('/profile');
    t.is(router.getSnapshot().url, '/profile');
    t.deepEqual(adapter.writeCalls, [{ url: '/profile', mode: 'push' }]);

    adapter.setCurrent('/login');
    adapter.trigger();
    t.is(router.getSnapshot().url, '/login');
    t.is(router.getSnapshot().navigationType, 'pop');
});
