// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createGuardLayer } from '../src/guard.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function basicMap() {
    return createMap(
        {
            login: file({ name: 'login' }),
            a: file({ name: 'a' }),
            b: file({ name: 'b' }),
            blocked: file({ name: 'blocked' }),
        },
        { notFound: nf }
    );
}

function flush() {
    return new Promise(r => setTimeout(r, 0));
}

test('popstate with allow → cb fires, snapshot updated', async t => {
    const adapter = createMemoryAdapter('/a');
    const guard = createGuardLayer({ guards: [() => 'allow'], dev: true });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);

    adapter.setCurrent('/b');
    adapter.trigger();
    await flush();
    await flush();

    t.is(router.getSnapshot().url, '/b');
});

test('popstate with block → rollback to prev URL', async t => {
    const adapter = createMemoryAdapter('/a');
    const guard = createGuardLayer({
        guards: [ctx => (ctx.url === '/blocked' ? { block: true } : 'allow')],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);

    adapter.setCurrent('/blocked');
    adapter.trigger();
    await flush();
    await flush();

    t.is(router.getSnapshot().url, '/a');
    t.is(adapter.read(), '/a');
});

test('popstate with redirect → router.replace', async t => {
    const adapter = createMemoryAdapter('/a');
    const guard = createGuardLayer({
        guards: [ctx => (ctx.url === '/b' ? { redirect: '/a' } : 'allow')],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);

    adapter.setCurrent('/b');
    adapter.trigger();
    await flush();
    await flush();

    t.is(router.getSnapshot().url, '/a');
    const last = adapter.writeCalls.at(-1);
    t.is(last?.mode, 'replace');
});

test('popstate without bind → cb fires raw (no guards)', async t => {
    const adapter = createMemoryAdapter('/a');
    const guard = createGuardLayer({
        guards: [() => ({ block: true })],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    // no guard.bind(router)

    adapter.setCurrent('/b');
    adapter.trigger();
    await flush();

    // No guards ran — popstate committed normally.
    t.is(router.getSnapshot().url, '/b');
});
