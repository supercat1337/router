// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { isRoute } from '../src/route.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function basicMap() {
    return createMap(
        {
            login: file({ name: 'login' }),
            users: folder({
                ':id': folder({
                    index: file({ name: 'userHome' }),
                    edit: file({ name: 'userEdit' }),
                }),
            }),
            reports: folder({
                ':year': folder({
                    ':month': file({ name: 'report' }),
                }),
            }),
        },
        { notFound: nf }
    );
}

// ===========================================================================
// shape
// ===========================================================================

test('route: returns branded Route object', t => {
    const map = basicMap();
    t.true(isRoute(map.route('login')));
});

test('route: name is preserved', t => {
    const map = basicMap();
    t.is(map.route('login').name, 'login');
    t.is(map.route('userHome').name, 'userHome');
});

test('route: frozen', t => {
    const map = basicMap();
    t.true(Object.isFrozen(map.route('login')));
});

test('route: params frozen', t => {
    const map = basicMap();
    t.true(Object.isFrozen(map.route('userHome').params));
});

test('route: params — empty for no-param route', t => {
    const map = basicMap();
    t.deepEqual(map.route('login').params, []);
});

test('route: params — single :name', t => {
    const map = basicMap();
    t.deepEqual(map.route('userHome').params, ['id']);
    t.deepEqual(map.route('userEdit').params, ['id']);
});

test('route: params — accumulated across levels, in path order', t => {
    const map = basicMap();
    t.deepEqual(map.route('report').params, ['year', 'month']);
});

test('route: cached — same instance', t => {
    const map = basicMap();
    t.is(map.route('userHome'), map.route('userHome'));
    t.is(map.route('login'), map.route('login'));
});

// ===========================================================================
// errors
// ===========================================================================

test('route: unknown name throws TypeError', t => {
    const map = basicMap();
    t.throws(() => map.route('missing'), { instanceOf: TypeError });
});

test('route: wildcard throws TypeError', t => {
    const map = createMap({ '*': file({ name: 'catchall' }) }, { notFound: nf });
    t.throws(() => map.route('catchall'), { instanceOf: TypeError });
});

// ===========================================================================
// url()
// ===========================================================================

test('route.url: no params', t => {
    const map = basicMap();
    t.is(map.route('login').url(), '/login');
});

test('route.url: single param', t => {
    const map = basicMap();
    t.is(map.route('userHome').url({ id: '5' }), '/users/5');
    t.is(map.route('userEdit').url({ id: '5' }), '/users/5/edit');
});

test('route.url: multiple params', t => {
    const map = basicMap();
    t.is(map.route('report').url({ year: '2024', month: '06' }), '/reports/2024/06');
});

test('route.url: missing param throws', t => {
    const map = basicMap();
    t.throws(() => map.route('userHome').url(), { instanceOf: TypeError });
    t.throws(() => map.route('userHome').url({}), { instanceOf: TypeError });
});

test('route.url: extra param ignored', t => {
    const map = basicMap();
    t.is(map.route('userHome').url({ id: '5', extra: 'x' }), '/users/5');
    t.is(map.route('login').url({ anything: 'x' }), '/login');
});

test('route.url: identical to map.url', t => {
    const map = basicMap();
    t.is(map.route('login').url(), map.url('login'));
    t.is(map.route('userHome').url({ id: '5' }), map.url('userHome', { id: '5' }));
    t.is(
        map.route('report').url({ year: '2024', month: '06' }),
        map.url('report', { year: '2024', month: '06' })
    );
});

// ===========================================================================
// router.route
// ===========================================================================

test('router.route: delegates to active map', t => {
    const map = basicMap();
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/login'),
        dev: true,
    });
    const r = router.route('userHome');
    t.true(isRoute(r));
    t.is(r.name, 'userHome');
    t.deepEqual(r.params, ['id']);
    t.is(r.url({ id: '5' }), '/users/5');
});

test('router.route: reflects current map after revalidate', t => {
    const mapA = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const mapB = createMap(
        { login: file({ name: 'login' }), profile: file({ name: 'profile' }) },
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
    t.throws(() => router.route('profile'), { instanceOf: TypeError });

    currentMap = mapB;
    router.revalidate();

    t.is(router.route('profile').name, 'profile');
});

test('route: handle stays bound to its own map', t => {
    const mapA = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const handle = mapA.route('login');
    // The handle is bound to mapA's rootChildren — calling .url()
    // after any "map switch" still produces mapA's URL.
    t.is(handle.name, 'login');
    t.is(handle.url(), '/login');
});
