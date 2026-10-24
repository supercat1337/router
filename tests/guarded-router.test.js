// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createGuardedRouter } from '../src/guard.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function basicMap() {
    return createMap(
        { login: file({ name: 'login' }), a: file({ name: 'a' }), b: file({ name: 'b' }) },
        { notFound: nf }
    );
}

test('createGuardedRouter: full wiring in one call', async t => {
    const adapter = createMemoryAdapter('/login');
    const { router, guard, nav } = createGuardedRouter({
        adapter,
        resolveMap: () => basicMap(),
        getState: () => ({}),
        guards: [() => 'allow'],
        dev: true,
    });
    t.truthy(router);
    t.truthy(guard);
    t.truthy(nav);
    t.is(router.getSnapshot().url, '/login');

    const result = await nav.navigate('/a');
    t.is(result.status, 'committed');
    t.is(adapter.read(), '/a');
});

test('createGuardedRouter: guard block prevents commit', async t => {
    const adapter = createMemoryAdapter('/login');
    const { router, nav } = createGuardedRouter({
        adapter,
        resolveMap: () => basicMap(),
        getState: () => ({}),
        guards: [() => ({ block: true })],
        dev: true,
    });
    const result = await nav.navigate('/a');
    t.is(result.status, 'blocked');
    t.is(router.getSnapshot().url, '/login');
});

test('createGuardedRouter: subscribe works through router', t => {
    const adapter = createMemoryAdapter('/login');
    const { router } = createGuardedRouter({
        adapter,
        resolveMap: () => basicMap(),
        getState: () => ({}),
        guards: [],
        dev: true,
    });
    let count = 0;
    router.subscribe(() => count++);
    router.navigate('/b');
    t.is(count, 1);
});

test('createGuardedRouter: guardMaxRedirects enforced', async t => {
    const adapter = createMemoryAdapter('/login');
    /** @type {any[]} */
    const errors = [];
    const { nav } = createGuardedRouter({
        adapter,
        resolveMap: () => basicMap(),
        getState: () => ({}),
        guards: [ctx => (ctx.url === '/a' ? { redirect: '/a' } : 'allow')],
        guardMaxRedirects: 3,
        onGuardError: e => errors.push(e),
        dev: false,
    });
    const result = await nav.navigate('/a');
    t.is(result.status, 'blocked');
    t.is(errors[0].type, 'guard-redirect-loop');
});
