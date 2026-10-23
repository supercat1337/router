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
            a: file({ name: 'a' }),
            b: file({ name: 'b' }),
            c: file({ name: 'c' }),
        },
        { notFound: nf }
    );
}

function flush() {
    return new Promise(r => setTimeout(r, 0));
}

// ---- 59-60: constructor ----

test('createGuardLayer: options null → TypeError', t => {
    t.throws(() => createGuardLayer(/** @type {any} */ (null)), { instanceOf: TypeError });
});

test('createGuardLayer: options primitive → TypeError', t => {
    t.throws(() => createGuardLayer(/** @type {any} */ ('x')), { instanceOf: TypeError });
});

// ---- 78-80: isDev from NODE_ENV ----

test('guard: NODE_ENV=production, dev omitted → prod behavior (onError)', async t => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    t.teardown(() => {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
    });

    const adapter = createMemoryAdapter('/a');
    /** @type {any[]} */
    const errors = [];
    const guard = createGuardLayer({
        guards: [() => ({ redirect: 'bad' })],
        onError: e => errors.push(e),
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: false,
    });
    guard.bind(router);

    const result = await guard.navigate().navigate('/b');
    t.is(result.status, 'blocked');
    t.is(errors.length, 1);
    t.is(errors[0].type, 'invalid-rru');
});

test('guard: NODE_ENV=development, dev omitted → dev behavior (throws)', async t => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    t.teardown(() => {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
    });

    const adapter = createMemoryAdapter('/a');
    const guard = createGuardLayer({
        guards: [() => ({ redirect: 'bad' })],
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);

    await t.throwsAsync(() => guard.navigate().navigate('/b'), {
        instanceOf: TypeError,
    });
});

// ---- 182-183: concurrent nav aborts first ----

test('concurrent nav: second aborts first (182-183)', async t => {
    const adapter = createMemoryAdapter('/a');
    /** @type {() => void} */
    let releaseFirst = () => {};
    const gate = new Promise(r => {
        releaseFirst = /** @type {any} */ (r);
    });
    let firstStarted = false;
    let calls = 0;

    const guard = createGuardLayer({
        guards: [
            async () => {
                calls++;
                if (calls === 1) {
                    firstStarted = true;
                    await gate;
                }
                return 'allow';
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

    const nav = guard.navigate();
    const p1 = nav.navigate('/b');
    // Yield until the first guard is suspended.
    for (let i = 0; i < 10 && !firstStarted; i++) {
        await Promise.resolve();
    }

    // Start a second nav — it aborts p1's controller.
    const p2 = nav.navigate('/c');
    releaseFirst();

    const [r1, r2] = await Promise.all([p1, p2]);
    t.is(r1.status, 'blocked');
    t.is(r2.status, 'committed');
    t.is(adapter.read(), '/c');
});

// ---- 215-217: prod invalid redirect ----

test('guard invalid redirect in prod → onError + blocked (215-217)', async t => {
    const adapter = createMemoryAdapter('/a');
    /** @type {any[]} */
    const errors = [];
    const guard = createGuardLayer({
        guards: [() => ({ redirect: 'not-valid' })],
        onError: e => errors.push(e),
        dev: false,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: false,
    });
    guard.bind(router);

    const result = await guard.navigate().navigate('/b');
    t.is(result.status, 'blocked');
    t.is(errors.length, 1);
    t.is(errors[0].type, 'invalid-rru');
    t.is(errors[0].target, 'not-valid');
    t.is(adapter.read(), '/a');
});

// ---- 249-251: guard returns non-Decision ----

test('guard returns invalid decision → blocked (249-251)', async t => {
    const adapter = createMemoryAdapter('/a');
    const guard = createGuardLayer({
        guards: [() => /** @type {any} */ (undefined)],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);

    const result = await guard.navigate().navigate('/b');
    t.is(result.status, 'blocked');
    t.is(adapter.read(), '/a');
});

test("guard returns plain string 'block' → blocked (249-251)", async t => {
    const adapter = createMemoryAdapter('/a');
    const guard = createGuardLayer({
        guards: [() => /** @type {any} */ ('block')],
        dev: true,
    });
    const router = createRouter({
        resolveMap: () => basicMap(),
        getState: () => ({}),
        adapter: guard.wrapAdapter(adapter),
        dev: true,
    });
    guard.bind(router);

    const result = await guard.navigate().navigate('/b');
    t.is(result.status, 'blocked');
});

// ---- 339-343: popstate handler catch ----

test('popstate: guard redirect-loop in dev → onError + rollback (339-343)', async t => {
    const adapter = createMemoryAdapter('/a');
    /** @type {any[]} */
    const errors = [];
    const guard = createGuardLayer({
        guards: [ctx => (ctx.url === '/b' ? { redirect: '/b' } : 'allow')],
        dev: true,
        onError: e => errors.push(e),
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
    // Wait for async handlePopstateAsync → rejection → catch.
    await flush();
    await flush();
    await flush();

    t.true(errors.length >= 1);
    t.is(errors[0].type, 'guard-throw');
    t.is(adapter.read(), '/a');
    t.is(router.getSnapshot().url, '/a');
});
