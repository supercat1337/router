// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createGuardLayer } from '../src/guard.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';
import { redirect } from '../src/redirect.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function basicMap() {
    return createMap(
        {
            login: file({ name: 'login' }),
            a: file({ name: 'a' }),
            b: file({ name: 'b' }),
            old: file({ name: 'old' }),
            new: file({ name: 'new' }),
        },
        { notFound: nf }
    );
}

// ---- constructor ----

test('createGuardLayer: guards must be array', t => {
    t.throws(() => createGuardLayer({ guards: /** @type {any} */ (null) }), {
        instanceOf: TypeError,
    });
});

test('createGuardLayer: maxRedirects negative', t => {
    t.throws(() => createGuardLayer({ guards: [], maxRedirects: -1 }), { instanceOf: TypeError });
});

test('createGuardLayer: onError non-function', t => {
    t.throws(
        () =>
            createGuardLayer({
                guards: [],
                onError: /** @type {any} */ ('nope'),
            }),
        { instanceOf: TypeError }
    );
});

// ---- bind / navigate ----

test('guard.navigate() before bind → TypeError', t => {
    const guard = createGuardLayer({ guards: [], dev: true });
    t.throws(() => guard.navigate(), { instanceOf: TypeError });
});

test('wrapAdapter + bind + navigate works', async t => {
    const adapter = createMemoryAdapter('/login');
    const guard = createGuardLayer({ guards: [], dev: true });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    const nav = guard.navigate();
    const result = await nav.navigate('/a');
    t.is(result.status, 'committed');
    if (result.status === 'committed') t.is(result.snapshot.url, '/a');
});

// ---- allow / block / redirect ----

test('guards allow → committed', async t => {
    const adapter = createMemoryAdapter('/login');
    const guard = createGuardLayer({
        guards: [() => 'allow'],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    const result = await guard.navigate().navigate('/a');
    t.is(result.status, 'committed');
    t.is(adapter.read(), '/a');
});

test('guard block → blocked, no navigation', async t => {
    const adapter = createMemoryAdapter('/login');
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
    guard.bind(router);
    const result = await guard.navigate().navigate('/a');
    t.is(result.status, 'blocked');
    t.is(adapter.read(), '/login');
});

test('guard redirect → commits target as replace', async t => {
    const adapter = createMemoryAdapter('/login');
    const guard = createGuardLayer({
        guards: [ctx => (ctx.url === '/old' ? { redirect: '/new' } : 'allow')],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    const result = await guard.navigate().navigate('/old');
    t.is(result.status, 'committed');
    if (result.status === 'committed') t.is(result.snapshot.url, '/new');
    const last = adapter.writeCalls.at(-1);
    t.is(last?.url, '/new');
    t.is(last?.mode, 'replace');
});

test('guard redirect-loop → dev throws', async t => {
    const adapter = createMemoryAdapter('/login');
    const guard = createGuardLayer({
        guards: [
            ctx =>
                ctx.url === '/a'
                    ? { redirect: '/b' }
                    : ctx.url === '/b'
                      ? { redirect: '/a' }
                      : 'allow',
        ],
        maxRedirects: 5,
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    await t.throwsAsync(() => guard.navigate().navigate('/a'), {
        instanceOf: TypeError,
    });
});

test('guard redirect-loop → prod onError + blocked', async t => {
    const adapter = createMemoryAdapter('/login');
    /** @type {any[]} */
    const errors = [];
    const guard = createGuardLayer({
        guards: [
            ctx =>
                ctx.url === '/a'
                    ? { redirect: '/b' }
                    : ctx.url === '/b'
                      ? { redirect: '/a' }
                      : 'allow',
        ],
        maxRedirects: 5,
        onError: err => errors.push(err),
        dev: false,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: false,
    });
    guard.bind(router);
    const result = await guard.navigate().navigate('/a');
    t.is(result.status, 'blocked');
    t.is(errors.length, 1);
    t.is(errors[0].type, 'guard-redirect-loop');
});

test('guard invalid redirect → dev throws', async t => {
    const adapter = createMemoryAdapter('/login');
    const guard = createGuardLayer({
        guards: [() => ({ redirect: 'not-valid' })],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    await t.throwsAsync(() => guard.navigate().navigate('/a'), {
        instanceOf: TypeError,
    });
});

test('guard throws → onError guard-throw + blocked', async t => {
    const adapter = createMemoryAdapter('/login');
    /** @type {any[]} */
    const errors = [];
    const guard = createGuardLayer({
        guards: [
            () => {
                throw new Error('guard-boom');
            },
        ],
        onError: err => errors.push(err),
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    const result = await guard.navigate().navigate('/a');
    t.is(result.status, 'blocked');
    t.is(errors.length, 1);
    t.is(errors[0].type, 'guard-throw');
});

test('CancelError → silent block', async t => {
    const adapter = createMemoryAdapter('/login');
    /** @type {any[]} */
    const errors = [];
    const guard = createGuardLayer({
        guards: [
            () => {
                const e = new Error('cancelled');
                e.name = 'CancelError';
                throw e;
            },
        ],
        onError: err => errors.push(err),
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    const result = await guard.navigate().navigate('/a');
    t.is(result.status, 'blocked');
    t.is(errors.length, 0);
});

// ---- reentrancy ----

test('reentrancy in dev → nav.navigate throws inside guard', async t => {
    const adapter = createMemoryAdapter('/login');
    /** @type {any} */
    let nav = null;
    /** @type {unknown} */
    let innerError = null;
    let shouldReenter = false;

    const guard = createGuardLayer({
        guards: /** @type {import("../src/types.js").Guard[]} */ ([
            async () => {
                if (shouldReenter) {
                    try {
                        await nav.navigate('/b');
                    } catch (e) {
                        innerError = e;
                    }
                }
                return 'allow';
            },
        ]),
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    nav = guard.navigate();

    shouldReenter = true;
    const result = await nav.navigate('/a');
    t.is(result.status, 'committed');
    t.true(innerError instanceof TypeError);
});

test('reentrancy in prod → blocked + onError', async t => {
    const adapter = createMemoryAdapter('/login');
    /** @type {any} */
    let nav = null;
    /** @type {any} */
    let innerResult = null;
    /** @type {any[]} */
    const errors = [];
    let shouldReenter = false;

    const guard = createGuardLayer({
        guards: /** @type {import("../src/types.js").Guard[]} */ ([
            async () => {
                if (shouldReenter) innerResult = await nav.navigate('/b');
                return 'allow';
            },
        ]),
        onError: err => errors.push(err),
        dev: false,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: false,
    });
    guard.bind(router);
    nav = guard.navigate();

    shouldReenter = true;
    const result = await nav.navigate('/a');
    t.is(result.status, 'committed');
    t.is(innerResult.status, 'blocked');
    t.is(errors.length, 1);
    t.is(errors[0].type, 'reentrancy');
});

// ---- pending ----

test('pending: null when idle', t => {
    const guard = createGuardLayer({ guards: [], dev: true });
    t.is(guard.pending(), null);
});

test('pending: reflects current target during redirect', async t => {
    const adapter = createMemoryAdapter('/login');
    /** @type {string[]} */
    const seen = [];
    const guard = createGuardLayer({
        guards: [
            ctx => {
                const p = guard.pending();
                if (p) seen.push(p.url);
                return ctx.url === '/old' ? { redirect: '/new' } : 'allow';
            },
        ],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    await guard.navigate().navigate('/old');
    t.deepEqual(seen, ['/old', '/new']);
});

test('guard accepts branded redirect()', async t => {
    const adapter = createMemoryAdapter('/login');
    const guard = createGuardLayer({
        guards: [ctx => (ctx.url === '/old' ? redirect('/new') : 'allow')],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);
    const result = await guard.navigate().navigate('/old');
    t.is(result.status, 'committed');
    if (result.status === 'committed') t.is(result.snapshot.url, '/new');
});
