// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { redirect } from '../src/redirect.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function baseMap() {
    return createMap({ login: file({ name: 'login' }) }, { notFound: nf });
}

test('redirectedFrom: set on single-hop redirect', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = ({ url }) => (url === '/missing' ? redirect('/login') : null);
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: mapNf });
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/login'),
        dev: true,
    });
    const snap = router.navigate('/missing');
    t.is(snap.status, 'matched');
    t.is(snap.url, '/login');
    t.is(snap.redirectedFrom, '/missing');
});

test('redirectedFrom: first URL on multi-hop chain', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = ({ url }) => {
        if (url === '/a') return redirect('/b');
        if (url === '/b') return redirect('/c');
        return null; // /c → notFound
    };
    const map = createMap({ safe: file({ name: 'safe' }) }, { notFound: mapNf });
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/safe'),
        dev: false,
    });
    const snap = router.navigate('/a');
    t.is(snap.status, 'notFound');
    t.is(snap.url, '/c');
    t.is(snap.redirectedFrom, '/a');
});

test('redirectedFrom: absent without redirect', t => {
    const router = createRouter({
        resolveMap: () => baseMap(),
        getState: () => ({}),
        adapter: createMemoryAdapter('/login'),
        dev: true,
    });
    const snap = router.navigate('/login');
    t.is(snap.redirectedFrom, undefined);
});

test('redirectedFrom: absent on direct notFound', t => {
    const router = createRouter({
        resolveMap: () => baseMap(),
        getState: () => ({}),
        adapter: createMemoryAdapter('/login'),
        dev: true,
    });
    const snap = router.navigate('/missing');
    t.is(snap.status, 'notFound');
    t.is(snap.redirectedFrom, undefined);
});

test('redirectedFrom: absent on error snapshot', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = ({ url }) => {
        if (url === '/a') return redirect('/b');
        if (url === '/b') return redirect('/a');
        return null;
    };
    const map = createMap({ safe: file({ name: 'safe' }) }, { notFound: mapNf });
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/safe'),
        dev: false,
    });
    const snap = router.navigate('/a');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'redirect-loop');
    t.is(snap.redirectedFrom, undefined);
    // Redirect path is still available via error.path (dev-only getRedirectPath).
    t.truthy(snap.error?.path);
});

test('redirectedFrom: settled snapshot is frozen', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = ({ url }) => (url === '/missing' ? redirect('/login') : null);
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: mapNf });
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/login'),
        dev: true,
    });
    const snap = router.navigate('/missing');
    t.true(Object.isFrozen(snap));
    t.throws(
        () => {
            /** @type {any} */ (snap).redirectedFrom = '/x';
        },
        { instanceOf: TypeError }
    );
});
