// @ts-check

import test from 'ava';
import { attachLinks } from '../src/links.js';
import { installDom, makeElement } from './helpers/dom-mock.js';

/** @typedef {{ method: string, url: string }} Call */

function makeRouter() {
    /** @type {Call[]} */
    const calls = [];
    const router = {
        calls,
        adapter: {
            /** @param {string} href */
            normalize(href) {
                return href.startsWith('/') ? href : null;
            },
        },
        /** @param {string} url */
        navigate(url) {
            calls.push({ method: 'navigate', url });
            return /** @type {any} */ ({});
        },
        /** @param {string} url */
        replace(url) {
            calls.push({ method: 'replace', url });
            return /** @type {any} */ ({});
        },
    };
    return router;
}

/**
 * @param {any} target
 * @param {Record<string, any>} [overrides]
 */
function clickEvent(target, overrides = {}) {
    /** @type {any} */
    const e = {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        target,
        preventDefault() {
            e.defaultPrevented = true;
        },
        ...overrides,
    };
    return e;
}

test('attachLinks: SSR returns no-op', t => {
    const detach = attachLinks(/** @type {any} */ ({}), {});
    t.is(typeof detach, 'function');
    t.notThrows(() => detach());
});

test('attachLinks: valid click → router.navigate(rru)', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    const detach = attachLinks(/** @type {any} */ (router));
    t.teardown(() => detach());

    const el = makeElement({ 'data-router-link': '', href: '/profile' });
    const e = clickEvent(el);
    dom.fire('click', e);

    t.deepEqual(router.calls, [{ method: 'navigate', url: '/profile' }]);
    t.true(e.defaultPrevented);
});

test('attachLinks: data-router-link=replace → replace', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    const detach = attachLinks(/** @type {any} */ (router));
    t.teardown(() => detach());

    const el = makeElement({
        'data-router-link': 'replace',
        href: '/profile',
    });
    dom.fire('click', clickEvent(el));

    t.deepEqual(router.calls, [{ method: 'replace', url: '/profile' }]);
});

test('attachLinks: modifier key → not intercepted', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    const detach = attachLinks(/** @type {any} */ (router));
    t.teardown(() => detach());

    const el = makeElement({ 'data-router-link': '', href: '/profile' });
    dom.fire('click', clickEvent(el, { ctrlKey: true }));

    t.deepEqual(router.calls, []);
});

test('attachLinks: target=_blank → not intercepted', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    const detach = attachLinks(/** @type {any} */ (router));
    t.teardown(() => detach());

    const el = makeElement({
        'data-router-link': '',
        href: '/profile',
        target: '_blank',
    });
    dom.fire('click', clickEvent(el));

    t.deepEqual(router.calls, []);
});

test('attachLinks: download → not intercepted', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    const detach = attachLinks(/** @type {any} */ (router));
    t.teardown(() => detach());

    const el = makeElement({
        'data-router-link': '',
        href: '/profile',
        download: '',
    });
    dom.fire('click', clickEvent(el));

    t.deepEqual(router.calls, []);
});

test('attachLinks: missing href → not intercepted', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    const detach = attachLinks(/** @type {any} */ (router));
    t.teardown(() => detach());

    const el = makeElement({ 'data-router-link': '' });
    dom.fire('click', clickEvent(el));

    t.deepEqual(router.calls, []);
});

test('attachLinks: normalize null → not intercepted', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    const detach = attachLinks(/** @type {any} */ (router));
    t.teardown(() => detach());

    const el = makeElement({
        'data-router-link': '',
        href: 'https://other.com/x',
    });
    dom.fire('click', clickEvent(el));

    t.deepEqual(router.calls, []);
});

test('attachLinks: defaultPrevented → not intercepted', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    const detach = attachLinks(/** @type {any} */ (router));
    t.teardown(() => detach());

    const el = makeElement({ 'data-router-link': '', href: '/profile' });
    dom.fire('click', clickEvent(el, { defaultPrevented: true }));

    t.deepEqual(router.calls, []);
});

test('attachLinks: custom navigate overrides router', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    /** @type {string[]} */
    const custom = [];
    const detach = attachLinks(/** @type {any} */ (router), {
        navigate: url => custom.push(url),
    });
    t.teardown(() => detach());

    const el = makeElement({ 'data-router-link': '', href: '/profile' });
    dom.fire('click', clickEvent(el));

    t.deepEqual(custom, ['/profile']);
    t.deepEqual(router.calls, []);
});

test('attachLinks: detach removes listener', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = makeRouter();
    const detach = attachLinks(/** @type {any} */ (router));

    detach();
    const el = makeElement({ 'data-router-link': '', href: '/profile' });
    dom.fire('click', clickEvent(el));

    t.deepEqual(router.calls, []);
});
