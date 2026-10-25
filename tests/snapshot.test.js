// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap, kKeysMap } from '../src/map.js';
import {
    chainParams,
    urlPrefixes,
    commonChainPrefix,
    buildSnapshot,
    buildErrorSnapshot,
} from '../src/snapshot.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

/**
 * @param {readonly import("../src/types.js").Node[]} chain
 * @returns {import("../src/types.js").Node | undefined}
 */
function leafOf(chain) {
    return chain.length > 0 ? chain[chain.length - 1] : undefined;
}

/**
 * @param {any} map
 * @returns {WeakMap<any, string>}
 */
function kmOf(map) {
    return map[kKeysMap];
}

test('chainParams: matched uses params', t => {
    const map = createMap({}, { notFound: nf });
    const snap = {
        navigationId: 1,
        navigationType: /** @type {'initial'} */ ('initial'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: [],
        params: { id: '5' },
        partialParams: {},
        search: {},
        url: '/',
        leaf: undefined,
    };
    t.deepEqual(chainParams(snap), { id: '5' });
});

test('chainParams: notFound uses partialParams', t => {
    const map = createMap({}, { notFound: nf });
    const snap = {
        navigationId: 1,
        navigationType: /** @type {'initial'} */ ('initial'),
        map,
        status: /** @type {'notFound'} */ ('notFound'),
        chain: [],
        params: {},
        partialParams: { id: '5' },
        search: {},
        url: '/',
        leaf: undefined,
    };
    t.deepEqual(chainParams(snap), { id: '5' });
});

test('urlPrefixes: literal chain', t => {
    const map = createMap({ users: folder({ profile: file({ name: 'p' }) }) }, { notFound: nf });
    const r = map.match('/users/profile');
    if (r.status !== 'matched') return t.fail();
    const snap = {
        navigationId: 1,
        navigationType: /** @type {'push'} */ ('push'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: r.chain,
        params: r.params,
        partialParams: {},
        search: {},
        url: '/users/profile',
        leaf: leafOf(r.chain),
    };
    t.deepEqual(urlPrefixes(r.chain, snap, kmOf(map)), ['/users', '/users/profile']);
});

test('urlPrefixes: :name decoded', t => {
    const map = createMap({ users: folder({ ':id': file({ name: 'u' }) }) }, { notFound: nf });
    const r = map.match('/users/%35');
    if (r.status !== 'matched') return t.fail();
    const snap = {
        navigationId: 1,
        navigationType: /** @type {'push'} */ ('push'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: r.chain,
        params: r.params,
        partialParams: {},
        search: {},
        url: '/users/%35',
        leaf: leafOf(r.chain),
    };
    t.deepEqual(urlPrefixes(r.chain, snap, kmOf(map)), ['/users', '/users/5']);
});

test('urlPrefixes: * uses full encoded pathname (no query)', t => {
    const map = createMap({ '*': file({ name: 'any' }) }, { notFound: nf });
    const r = map.match('/foo%20bar');
    if (r.status !== 'matched') return t.fail();
    const snap = {
        navigationId: 1,
        navigationType: /** @type {'push'} */ ('push'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: r.chain,
        params: r.params,
        partialParams: {},
        search: {},
        url: '/foo%20bar',
        leaf: leafOf(r.chain),
    };
    t.deepEqual(urlPrefixes(r.chain, snap, kmOf(map)), ['/foo%20bar']);
});

test('urlPrefixes: * strips query', t => {
    const map = createMap({ '*': file({ name: 'any' }) }, { notFound: nf });
    const r = map.match('/foo?tab=1');
    if (r.status !== 'matched') return t.fail();
    const snap = {
        navigationId: 1,
        navigationType: /** @type {'push'} */ ('push'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: r.chain,
        params: r.params,
        partialParams: {},
        search: {},
        url: '/foo?tab=1',
        leaf: leafOf(r.chain),
    };
    t.deepEqual(urlPrefixes(r.chain, snap, kmOf(map)), ['/foo']);
});

test('urlPrefixes: index = parent prefix', t => {
    const map = createMap(
        { admin: folder({ index: file({ name: 'adminHome' }) }) },
        { notFound: nf }
    );
    const r = map.match('/admin');
    if (r.status !== 'matched') return t.fail();
    const snap = {
        navigationId: 1,
        navigationType: /** @type {'push'} */ ('push'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: r.chain,
        params: r.params,
        partialParams: {},
        search: {},
        url: '/admin',
        leaf: leafOf(r.chain),
    };
    t.deepEqual(urlPrefixes(r.chain, snap, kmOf(map)), ['/admin', '/admin']);
});

test('urlPrefixes: node not in keysMap → parent prefix', t => {
    const fakeNode = file({ name: 'fake' });
    const map = createMap({}, { notFound: nf });
    const snap = {
        navigationId: 1,
        navigationType: /** @type {'push'} */ ('push'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: [fakeNode],
        params: {},
        partialParams: {},
        search: {},
        url: '/x',
        leaf: fakeNode,
    };
    t.deepEqual(urlPrefixes([fakeNode], snap, new WeakMap()), ['']);
});

test('commonChainPrefix: shared root', t => {
    const map = createMap({ users: folder({ ':id': file({ name: 'u' }) }) }, { notFound: nf });
    const r1 = map.match('/users/5');
    const r2 = map.match('/users/6');
    if (r1.status !== 'matched' || r2.status !== 'matched') return t.fail();
    const prev = {
        navigationId: 1,
        navigationType: /** @type {'push'} */ ('push'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: r1.chain,
        params: r1.params,
        partialParams: {},
        search: {},
        url: '/users/5',
        leaf: leafOf(r1.chain),
    };
    const next = {
        navigationId: 2,
        navigationType: /** @type {'push'} */ ('push'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: r2.chain,
        params: r2.params,
        partialParams: {},
        search: {},
        url: '/users/6',
        leaf: leafOf(r2.chain),
    };
    t.is(commonChainPrefix(prev, next, kmOf), 1);
});

test('buildSnapshot: notFound attaches notFoundResult', t => {
    const map = createMap({}, { notFound: nf });
    const snap = buildSnapshot(1, map, 'notFound', [], {}, {}, '/x', {}, 'push', 'render');
    t.is(snap.notFoundResult, 'render');
    t.is(snap.navigationType, 'push');
});

test('buildSnapshot: matched skips notFoundResult', t => {
    const map = createMap({}, { notFound: nf });
    const snap = buildSnapshot(1, map, 'matched', [], {}, {}, '/x', {}, 'initial');
    t.is(snap.notFoundResult, undefined);
    t.is(snap.navigationType, 'initial');
});

test('buildErrorSnapshot: anchored to prev', t => {
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const r = map.match('/login');
    if (r.status !== 'matched') return t.fail();
    const prev = {
        navigationId: 1,
        navigationType: /** @type {'push'} */ ('push'),
        map,
        status: /** @type {'matched'} */ ('matched'),
        chain: r.chain,
        params: r.params,
        partialParams: {},
        search: { tab: '1' },
        url: '/login',
        leaf: leafOf(r.chain),
    };
    const err = buildErrorSnapshot(
        2,
        prev,
        'resolver-throw',
        {
            error: new Error('x'),
            attemptedUrl: '/bad',
            partialChain: [],
            partialParams: {},
        },
        '/login',
        'replace'
    );
    t.is(err.status, 'error');
    t.is(err.map, map);
    t.is(err.chain, prev.chain);
    t.deepEqual(err.params, {});
    t.deepEqual(err.partialParams, prev.params);
    t.deepEqual(err.search, { tab: '1' });
    t.is(err.navigationType, 'replace');
});
