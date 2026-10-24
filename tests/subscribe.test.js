// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function setup(dev = true) {
    const map = createMap(
        { login: file({ name: 'login' }), profile: file({ name: 'profile' }) },
        { notFound: nf }
    );
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev,
    });
    return { router, adapter, map };
}

test('subscribe: fires on navigate', t => {
    const { router } = setup();
    /** @type {any[]} */
    const seen = [];
    const unsub = router.subscribe(s => seen.push(s));
    t.teardown(unsub);
    router.navigate('/profile');
    t.is(seen.length, 1);
    t.is(seen[0].url, '/profile');
});

test('subscribe: does not fire on no-op navigate', t => {
    const { router } = setup();
    let count = 0;
    const unsub = router.subscribe(() => count++);
    t.teardown(unsub);
    router.navigate('/login'); // already /login
    t.is(count, 0);
});

test('subscribe: fires on revalidate even without URL change', t => {
    const { router } = setup();
    /** @type {any[]} */
    const seen = [];
    const unsub = router.subscribe(s => seen.push(s));
    t.teardown(unsub);
    const beforeId = router.getSnapshot().navigationId;
    router.revalidate();
    t.is(seen.length, 1);
    t.is(seen[0].navigationId, beforeId + 1);
});

test('subscribe: fires on prod error snapshot', t => {
    const adapter = createMemoryAdapter('/login');
    let throwing = false;
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return map;
        },
        getState: () => ({}),
        adapter,
        dev: false,
    });
    /** @type {any[]} */
    const seen = [];
    const unsub = router.subscribe(s => seen.push(s));
    t.teardown(unsub);
    throwing = true;
    router.navigate('/x');
    t.is(seen.length, 1);
    t.is(seen[0].status, 'error');
});

test('subscribe: unsubscribe is idempotent', t => {
    const { router } = setup();
    let count = 0;
    const unsub = router.subscribe(() => count++);
    unsub();
    unsub();
    router.navigate('/profile');
    t.is(count, 0);
});

test('subscribe: listener throw goes to onListenerError', t => {
    const map = createMap(
        { login: file({ name: 'login' }), profile: file({ name: 'profile' }) },
        { notFound: nf }
    );
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
    let ok = 0;
    router.subscribe(() => {
        throw new Error('sub-boom');
    });
    router.subscribe(() => ok++);
    router.navigate('/profile');
    t.is(errors.length, 1);
    t.is(ok, 1);
});

test('commit event: same as subscribe via on', t => {
    const { router } = setup();
    let viaOn = 0;
    let viaSub = 0;
    router.on('commit', () => viaOn++);
    router.subscribe(() => viaSub++);
    router.navigate('/profile');
    t.is(viaOn, 1);
    t.is(viaSub, 1);
});
