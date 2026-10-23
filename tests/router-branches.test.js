// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function simpleMap() {
    return createMap({ login: file({ name: 'login' }) }, { notFound: nf });
}

test('createRouter: dev omitted, NODE_ENV=production → prod behavior', t => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    t.teardown(() => {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
    });

    const adapter = createMemoryAdapter('/login');
    let throwing = false;
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return simpleMap();
        },
        getState: () => ({}),
        adapter,
    });
    throwing = true;
    const snap = router.navigate('/x');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'resolver-throw');
});

test('createRouter: dev omitted, NODE_ENV≠production → dev behavior', t => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    t.teardown(() => {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
    });

    const adapter = createMemoryAdapter('/login');
    let throwing = false;
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return simpleMap();
        },
        getState: () => ({}),
        adapter,
    });
    throwing = true;
    t.throws(() => router.navigate('/x'), { message: 'boom' });
});

test('back/forward: no-op when history undefined', t => {
    const had = 'history' in globalThis;
    const original = /** @type {any} */ (globalThis).history;
    if (had) delete (/** @type {any} */ (globalThis).history);
    t.teardown(() => {
        if (had) /** @type {any} */ (globalThis).history = original;
    });

    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => simpleMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.notThrows(() => router.back());
    t.notThrows(() => router.forward());
});

test('back/forward: calls history.back/forward when defined', t => {
    const had = 'history' in globalThis;
    const original = /** @type {any} */ (globalThis).history;
    /** @type {string[]} */
    const calls = [];
    /** @type {any} */ (globalThis).history = {
        back: () => calls.push('back'),
        forward: () => calls.push('forward'),
    };
    t.teardown(() => {
        if (had) /** @type {any} */ (globalThis).history = original;
        else delete (/** @type {any} */ (globalThis).history);
    });

    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => simpleMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    router.back();
    router.forward();
    t.deepEqual(calls, ['back', 'forward']);
});
