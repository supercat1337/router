// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap, hasRoute } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

test('hasRoute: true for existing flat route', t => {
    const m = createMap(
        { login: file({ name: 'login' }), profile: file({ name: 'profile' }) },
        { notFound: nf }
    );
    t.true(hasRoute(m, 'login'));
    t.true(hasRoute(m, 'profile'));
});

test('hasRoute: false for unknown name', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.false(hasRoute(m, 'typo'));
});

test('hasRoute: finds nested route names', t => {
    const m = createMap(
        {
            admin: folder(
                {
                    index: file({ name: 'adminHome' }),
                    users: folder( { ':id': file({ name: 'adminUser' }) }),
                }
            ),
        },
        { notFound: nf }
    );
    t.true(hasRoute(m, 'adminHome'));
    t.true(hasRoute(m, 'adminUser'));
    t.false(hasRoute(m, 'adminUnknown'));
});

test('hasRoute: true for route requiring params (params not checked)', t => {
    const m = createMap({ users: folder( { ':id': file({ name: 'user' }) }) }, { notFound: nf });
    t.true(hasRoute(m, 'user'));
    // And url() still requires params — hasRoute was honest about existence only.
    t.throws(() => m.url('user'), { instanceOf: TypeError });
    t.is(m.url('user', { id: '5' }), '/users/5');
});

test('hasRoute: false for wildcard-only route', t => {
    const m = createMap({ '*': file({ name: 'catchall' }) }, { notFound: nf });
    t.false(hasRoute(m, 'catchall'));
});

test('hasRoute: wildcard does not shadow literal routes', t => {
    const m = createMap(
        { '*': file({ name: 'catchall' }), login: file({ name: 'login' }) },
        { notFound: nf }
    );
    t.true(hasRoute(m, 'login'));
    t.false(hasRoute(m, 'catchall'));
});

test('hasRoute: false for empty string', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.false(hasRoute(m, ''));
});

test('hasRoute: false for non-string name', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.false(hasRoute(m, /** @type {any} */ (null)));
    t.false(hasRoute(m, /** @type {any} */ (undefined)));
    t.false(hasRoute(m, /** @type {any} */ (1)));
});

test('hasRoute: false for non-map', t => {
    t.false(hasRoute(/** @type {any} */ ({}), 'login'));
    t.false(hasRoute(/** @type {any} */ (null), 'login'));
    t.false(hasRoute(/** @type {any} */ (undefined), 'login'));
});

test('hasRoute: works with map from snapshot (primary use case)', t => {
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const activeMap = router.getSnapshot().map;
    t.true(hasRoute(activeMap, 'login'));
    t.false(hasRoute(activeMap, 'typo'));
});

test('hasRoute: agrees with url() for all reachable names', t => {
    const m = createMap(
        {
            login: file({ name: 'login' }),
            users: folder( { ':id': file({ name: 'user' }) }),
        },
        { notFound: nf }
    );
    for (const [name, params] of /** @type {const} */ ([
        ['login', undefined],
        ['user', { id: '5' }],
    ])) {
        if (hasRoute(m, name)) {
            t.notThrows(() => m.url(name, params));
        }
    }
});
