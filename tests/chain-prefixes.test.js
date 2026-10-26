// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { chainParams, getChainPrefixes } from '../src/snapshot.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function setup(initialUrl = '/admin/users/5') {
    const map = createMap(
        {
            admin: folder({
                users: folder({
                    ':id': folder({
                        index: file({ name: 'adminUser' }),
                        edit: file({ name: 'adminUserEdit' }),
                    }),
                }),
            }),
        },
        { notFound: nf }
    );
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter(initialUrl),
        dev: true,
    });
    return router;
}

// ===========================================================================
// getChainPrefixes
// ===========================================================================

test('getChainPrefixes: nested literal + param + literal', t => {
    const router = setup('/admin/users/5/edit');
    t.deepEqual(getChainPrefixes(router.getSnapshot()), [
        '/admin',
        '/admin/users',
        '/admin/users/5',
        '/admin/users/5/edit',
    ]);
});

test('getChainPrefixes: index equals parent prefix', t => {
    const router = setup('/admin/users/5');
    const prefixes = getChainPrefixes(router.getSnapshot());
    t.is(prefixes.length, 4);
    t.is(prefixes[2], '/admin/users/5');
    t.is(prefixes[3], '/admin/users/5');
});

test('getChainPrefixes: every prefix startsWith of pathname(url)', t => {
    const router = setup('/admin/users/5/edit');
    const snap = router.getSnapshot();
    const urlPath = snap.url.split('?')[0];
    for (const p of getChainPrefixes(snap)) {
        t.true(urlPath.startsWith(p), `${urlPath} starts with ${p}`);
    }
});

test('getChainPrefixes: last prefix equals pathname(url) on matched', t => {
    const router = setup('/admin/users/5/edit');
    const snap = router.getSnapshot();
    const prefixes = getChainPrefixes(snap);
    t.is(prefixes[prefixes.length - 1], snap.url.split('?')[0]);
});

test('getChainPrefixes: search excluded', t => {
    const router = setup('/admin/users/5/edit?tab=1&sort=desc');
    const prefixes = getChainPrefixes(router.getSnapshot());
    t.false(prefixes.some(p => p.includes('?')));
    t.is(prefixes[prefixes.length - 1], '/admin/users/5/edit');
});

test('getChainPrefixes: encoded :name round-trips with startsWith', t => {
    const router = setup('/admin/users/a%2Fb');
    const prefixes = getChainPrefixes(router.getSnapshot());
    const leafPrefix = prefixes[prefixes.length - 1];
    t.is(leafPrefix, '/admin/users/a%2Fb');

    router.navigate('/admin/users/a%2Fb/edit');
    const deeper = router.getSnapshot();
    t.true(deeper.url.startsWith(leafPrefix));
    t.true(getChainPrefixes(deeper).includes(leafPrefix));
});

test('getChainPrefixes: non-canonical input — canonical prefixes', t => {
    // :id = '5' decodes from %35, but url keeps %35; prefix is canonical.
    const router = setup('/admin/users/%35');
    const snap = router.getSnapshot();
    t.is(snap.status, 'matched');
    t.deepEqual(chainParams(snap), { id: '5' });
    t.is(getChainPrefixes(snap).at(-1), '/admin/users/5');
});

test('getChainPrefixes: prefix-matching (NavLink use case)', t => {
    const router = setup('/admin/users/5/edit');
    const prefixes = getChainPrefixes(router.getSnapshot());
    t.true(prefixes.includes('/admin'));
    t.true(prefixes.includes('/admin/users'));
    t.false(prefixes.includes('/admin/reports'));
});

test('getChainPrefixes: empty chain (notFound at root)', t => {
    const router = setup('/missing');
    const snap = router.getSnapshot();
    t.is(snap.status, 'notFound');
    t.deepEqual(getChainPrefixes(snap), []);
});

test('getChainPrefixes: notFound partial chain', t => {
    const router = setup('/admin/users/5/extra');
    const snap = router.getSnapshot();
    t.is(snap.status, 'notFound');
    t.deepEqual(getChainPrefixes(snap), ['/admin', '/admin/users', '/admin/users/5']);
});

test('getChainPrefixes: error snapshots return prev prefixes', t => {
    const map = createMap(
        { admin: folder({ users: folder({ ':id': file({ name: 'u' }) }) }) },
        { notFound: nf }
    );
    let throwing = false;
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return map;
        },
        getState: () => ({}),
        adapter: createMemoryAdapter('/admin/users/5'),
        dev: false,
    });
    const prevPrefixes = getChainPrefixes(router.getSnapshot());
    throwing = true;
    router.navigate('/anything');
    const errSnap = router.getSnapshot();
    t.is(errSnap.status, 'error');
    t.deepEqual(getChainPrefixes(errSnap), prevPrefixes);
});

test('getChainPrefixes: wildcard = full pathname', t => {
    const map = createMap({ '*': file({ name: 'any' }) }, { notFound: nf });
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/foo/bar'),
        dev: true,
    });
    t.deepEqual(getChainPrefixes(router.getSnapshot()), ['/foo/bar']);
});

test('getChainPrefixes: wildcard strips query', t => {
    const map = createMap({ '*': file({ name: 'any' }) }, { notFound: nf });
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/foo?tab=1'),
        dev: true,
    });
    t.deepEqual(getChainPrefixes(router.getSnapshot()), ['/foo']);
});

// ===========================================================================
// chainParams
// ===========================================================================

test('chainParams: matched uses params', t => {
    const router = setup('/admin/users/5/edit');
    t.deepEqual(chainParams(router.getSnapshot()), { id: '5' });
});

test('chainParams: notFound uses partialParams', t => {
    const router = setup('/admin/users/5/extra');
    t.deepEqual(chainParams(router.getSnapshot()), { id: '5' });
});

test('chainParams: error uses prev params', t => {
    const map = createMap({ users: folder({ ':id': file({ name: 'u' }) }) }, { notFound: nf });
    let throwing = false;
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return map;
        },
        getState: () => ({}),
        adapter: createMemoryAdapter('/users/7'),
        dev: false,
    });
    throwing = true;
    router.navigate('/x');
    const errSnap = router.getSnapshot();
    t.is(errSnap.status, 'error');
    t.deepEqual(chainParams(errSnap), { id: '7' });
});
