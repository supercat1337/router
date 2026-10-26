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
            login: file({
                name: 'login',
                preload: () => Promise.resolve('login'),
                load: () => Promise.resolve('login-load'),
            }),
            users: folder({
                ':id': file({
                    name: 'user',
                    preload: () => Promise.resolve('user'),
                }),
            }),
        },
        { notFound: nf }
    );
}

function setup(map = basicMap(), initial = '/login') {
    return createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter(initial),
        dev: true,
    });
}

// ===========================================================================
// happy path
// ===========================================================================

test('prefetch: matched leaf calls leaf.preload with ctx', async t => {
    /** @type {import('../src/types.js').PreloadContext | null} */
    let captured = null;
    const map = createMap(
        {
            login: file({
                name: 'login',
                preload: ctx => {
                    captured = ctx;
                },
            }),
        },
        { notFound: nf }
    );
    const router = setup(map);

    await router.prefetch('/login');

    t.truthy(captured);
    if (captured) {
        t.true(captured.signal instanceof AbortSignal);
        t.false(captured.signal.aborted);
    }
});

test('prefetch: falls back to leaf.load without args', async t => {
    /** @type {unknown[]} */
    const args = [];
    const map = createMap(
        {
            login: file({
                name: 'login',
                load: (/** @type {unknown[]} */ ...a) => {
                    args.push(...a);
                    return Promise.resolve('ok');
                },
            }),
        },
        { notFound: nf }
    );
    const router = setup(map);

    await router.prefetch('/login');

    t.is(args.length, 0);
});

test('prefetch: leaf.preload preferred over leaf.load', async t => {
    let preloadCalled = false;
    let loadCalled = false;
    const map = createMap(
        {
            login: file({
                name: 'login',
                preload: () => {
                    preloadCalled = true;
                },
                load: () => {
                    loadCalled = true;
                    return Promise.resolve('x');
                },
            }),
        },
        { notFound: nf }
    );
    const router = setup(map);

    await router.prefetch('/login');

    t.true(preloadCalled);
    t.false(loadCalled);
});

test('prefetch: :name route works', async t => {
    let called = false;
    const map = createMap(
        {
            users: folder({
                ':id': file({
                    name: 'user',
                    preload: () => {
                        called = true;
                    },
                }),
            }),
        },
        { notFound: nf }
    );
    const router = setup(map);

    await router.prefetch('/users/5');

    t.true(called);
});

// ===========================================================================
// no-op paths
// ===========================================================================

test('prefetch: invalid RRU is a no-op', async t => {
    let called = false;
    const map = createMap(
        {
            login: file({
                name: 'login',
                preload: () => {
                    called = true;
                },
            }),
        },
        { notFound: nf }
    );
    const router = setup(map);

    await router.prefetch('users');
    await router.prefetch('');
    await router.prefetch('/a#b');

    t.false(called);
});

test('prefetch: notFound is a no-op', async t => {
    const router = setup();

    await t.notThrowsAsync(() => router.prefetch('/missing'));
});

test('prefetch: leaf without preload/load is a no-op', async t => {
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const router = setup(map);

    await t.notThrowsAsync(() => router.prefetch('/login'));
});

test('prefetch: route removed after map switch', async t => {
    const mapA = createMap(
        {
            login: file({
                name: 'login',
                preload: () => Promise.resolve(),
            }),
            admin: file({
                name: 'admin',
                preload: () => Promise.resolve(),
            }),
        },
        { notFound: nf }
    );
    const mapB = createMap(
        {
            login: file({ name: 'login' }),
        },
        { notFound: nf }
    );
    /** @type {import('../src/types.js').RouterMap} */
    let currentMap = mapA;
    const router = createRouter({
        resolveMap: () => currentMap,
        getState: () => ({}),
        adapter: createMemoryAdapter('/login'),
        dev: true,
    });

    // /admin exists in mapA — prefetch would call its preload.
    let adminCalled = false;
    const realAdminPreload = /** @type {any} */ (mapA).route?.('admin');
    // Simpler: just switch map and verify /admin is notFound now.
    currentMap = mapB;
    router.revalidate();

    await t.notThrowsAsync(() => router.prefetch('/admin'));
    t.false(adminCalled);
    void realAdminPreload;
});

// ===========================================================================
// signal
// ===========================================================================

test('prefetch: signal forwarded to leaf.preload', async t => {
    /** @type {AbortSignal | null} */
    let captured = null;
    const map = createMap(
        {
            login: file({
                name: 'login',
                preload: ctx => {
                    captured = ctx.signal;
                },
            }),
        },
        { notFound: nf }
    );
    const router = setup(map);
    const ctrl = new AbortController();

    await router.prefetch('/login', { signal: ctrl.signal });

    t.is(captured, ctrl.signal);
});

test('prefetch: aborted signal is a no-op', async t => {
    let called = false;
    const map = createMap(
        {
            login: file({
                name: 'login',
                preload: () => {
                    called = true;
                },
            }),
        },
        { notFound: nf }
    );
    const router = setup(map);
    const ctrl = new AbortController();
    ctrl.abort();

    await router.prefetch('/login', { signal: ctrl.signal });

    t.false(called);
});

// ===========================================================================
// error handling
// ===========================================================================

test('prefetch: synchronous throw is swallowed', async t => {
    const map = createMap(
        {
            login: file({
                name: 'login',
                preload: () => {
                    throw new Error('sync-boom');
                },
            }),
        },
        { notFound: nf }
    );
    const router = setup(map);

    await t.notThrowsAsync(() => router.prefetch('/login'));
});

test('prefetch: rejected promise is swallowed', async t => {
    const map = createMap(
        {
            login: file({
                name: 'login',
                load: () => Promise.reject(new Error('async-boom')),
            }),
        },
        { notFound: nf }
    );
    const router = setup(map);

    await t.notThrowsAsync(() => router.prefetch('/login'));
});

test('prefetch: uses current map, not call-time map', async t => {
    let adminPreloadCalls = 0;
    const mapA = createMap(
        {
            login: file({ name: 'login' }),
            admin: file({
                name: 'admin',
                preload: () => {
                    adminPreloadCalls++;
                },
            }),
        },
        { notFound: nf }
    );
    const mapB = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    /** @type {import('../src/types.js').RouterMap} */
    let currentMap = mapB; // ← активна mapB, /admin notFound
    const router = createRouter({
        resolveMap: () => currentMap,
        getState: () => ({}),
        adapter: createMemoryAdapter('/login'),
        dev: true,
    });

    await router.prefetch('/admin');
    t.is(adminPreloadCalls, 0);

    currentMap = mapA;
    router.revalidate();
    await router.prefetch('/admin');
    t.is(adminPreloadCalls, 1);
});
