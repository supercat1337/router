// @ts-check

// All tests use `installDom()`, which mutates `globalThis.document` (and
// friends). AVA runs tests concurrently by default, and async tests
// interleave at `await` points — a teardown of one test can delete
// `document` while another test is still running, causing `document is
// not defined` inside the router's `detach()`. `test.serial` forces
// sequential execution, keeping global mutations isolated.

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { attachPreload } from '../src/links.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';
import { installDom, makeElement } from './helpers/dom-mock.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function setup() {
    const map = createMap(
        {
            login: file({ name: 'login', load: () => Promise.resolve('login') }),
            users: folder( {
                ':id': file({ name: 'user', load: () => Promise.resolve('user') }),
            }),
        },
        { notFound: nf }
    );
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/login'),
        dev: true,
    });
    return router;
}

test.serial('attachPreload: SSR returns no-op', t => {
    const detach = attachPreload(/** @type {any} */ ({}), {});
    t.is(typeof detach, 'function');
    t.notThrows(() => detach());
});

test.serial('attachPreload: pointerenter triggers preload with leaf', async t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup();
    /** @type {string[]} */
    const loaded = [];
    const detach = attachPreload(router, {
        preload: leaf => { loaded.push(/** @type {any} */ (leaf).name); },
    });
    t.teardown(() => detach());

    const el = makeElement({ 'data-router-link': '', href: '/login' });
    dom.fire('pointerenter', { target: el });
    await new Promise(r => setTimeout(r, 0));
    t.deepEqual(loaded, ['login']);
});

test.serial('attachPreload: focusin also triggers', async t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup();
    let count = 0;
    const detach = attachPreload(router, { preload: () => { count++; } });
    t.teardown(() => detach());

    dom.fire('focusin', {
        target: makeElement({ 'data-router-link': '', href: '/login' }),
    });
    await new Promise(r => setTimeout(r, 0));
    t.is(count, 1);
});

test.serial('attachPreload: dedupe same element', async t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup();
    let count = 0;
    const detach = attachPreload(router, { preload: () => { count++; } });
    t.teardown(() => detach());

    const el = makeElement({ 'data-router-link': '', href: '/login' });
    dom.fire('pointerenter', { target: el });
    dom.fire('pointerenter', { target: el });
    dom.fire('focusin', { target: el });
    await new Promise(r => setTimeout(r, 0));
    t.is(count, 1);
});

test.serial('attachPreload: normalize null → no preload', async t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup();
    let called = false;
    const detach = attachPreload(router, { preload: () => { called = true; } });
    t.teardown(() => detach());

    dom.fire('pointerenter', {
        target: makeElement({ 'data-router-link': '', href: 'https://other.com/x' }),
    });
    await new Promise(r => setTimeout(r, 0));
    t.false(called);
});

test.serial('attachPreload: notFound → no preload', async t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup();
    let called = false;
    const detach = attachPreload(router, { preload: () => { called = true; } });
    t.teardown(() => detach());

    dom.fire('pointerenter', {
        target: makeElement({ 'data-router-link': '', href: '/missing' }),
    });
    await new Promise(r => setTimeout(r, 0));
    t.false(called);
});

test.serial('attachPreload: missing href → no preload', async t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup();
    let called = false;
    const detach = attachPreload(router, { preload: () => { called = true; } });
    t.teardown(() => detach());

    dom.fire('pointerenter', {
        target: makeElement({ 'data-router-link': '' }),
    });
    await new Promise(r => setTimeout(r, 0));
    t.false(called);
});

test.serial('attachPreload: non-link target → no preload', async t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup();
    let called = false;
    const detach = attachPreload(router, { preload: () => { called = true; } });
    t.teardown(() => detach());

    dom.fire('pointerenter', {
        target: makeElement({ href: '/login' }), // no data-router-link
    });
    await new Promise(r => setTimeout(r, 0));
    t.false(called);
});

test.serial('attachPreload: preload throw is swallowed', async t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup();
    const detach = attachPreload(router, {
        preload: () => { throw new Error('boom'); },
    });
    t.teardown(() => detach());

    t.notThrows(() =>
        dom.fire('pointerenter', {
            target: makeElement({ 'data-router-link': '', href: '/login' }),
        })
    );
    await new Promise(r => setTimeout(r, 0));
});

test.serial('attachPreload: detach removes listeners', async t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup();
    let count = 0;
    const detach = attachPreload(router, { preload: () => { count++; } });
    detach();

    dom.fire('pointerenter', {
        target: makeElement({ 'data-router-link': '', href: '/login' }),
    });
    await new Promise(r => setTimeout(r, 0));
    t.is(count, 0);
});