// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { redirect } from '../src/redirect.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

test('maxRedirects: 0 → immediate redirect-loop', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = () => redirect('/target');
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: mapNf });
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: false,
        maxRedirects: 0,
    });
    const snap = router.navigate('/missing');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'redirect-loop');
    t.is(snap.navigationType, 'push');
});

test('redirect cycle through normalized trailing slash', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = ({ url }) => {
        if (url === '/a') return redirect('/b');
        if (url === '/b') return redirect('/a/'); // trailing slash normalizes
        return null;
    };
    const map = createMap({ safe: file({ name: 'safe' }) }, { notFound: mapNf });
    const adapter = createMemoryAdapter('/safe');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: false,
    });
    const snap = router.navigate('/a');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'redirect-loop');
    t.is(snap.navigationType, 'push');
});

test('popstate during transaction is suppressed', t => {
    const map = createMap(
        {
            login: file({ name: 'login' }),
            users: folder({ ':id': file({ name: 'u' }) }),
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
    let fired = false;
    router.on('afterEnter', () => {
        if (fired) return;
        fired = true;
        adapter.setCurrent('/users/6');
        adapter.trigger();
        // Guard suppressed popstate: snapshot still reflects /users/5.
        t.is(router.getSnapshot().url, '/users/5');
    });
    router.navigate('/users/5');
});
