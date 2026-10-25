// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { attachActiveLinks } from '../src/active-links.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';
import { installDom, makeElement } from './helpers/dom-mock.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function setup(initialUrl = '/login') {
    const map = createMap(
        {
            login: file({ name: 'login' }),
            profile: file({ name: 'profile' }),
            admin: file({ name: 'admin' }),
        },
        { notFound: nf }
    );
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter(initialUrl),
        dev: true,
    });
    return router;
}

test.serial('attachActiveLinks: SSR returns no-op', t => {
    const detach = attachActiveLinks(/** @type {any} */ ({}), {});
    t.is(typeof detach, 'function');
    t.notThrows(() => detach());
});

test.serial('attachActiveLinks: ariaCurrent:false is a no-op', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup('/login');
    const el = makeElement({ 'data-router-link': '', href: '/login' });
    dom.registerElement(el);

    const detach = attachActiveLinks(router, { ariaCurrent: false });
    t.teardown(() => detach());

    t.is(el.getAttribute('aria-current'), null);
});

test.serial('attachActiveLinks: sets aria-current on matching link', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup('/login');
    const loginEl = makeElement({ 'data-router-link': '', href: '/login' });
    const profileEl = makeElement({ 'data-router-link': '', href: '/profile' });
    dom.registerElement(loginEl);
    dom.registerElement(profileEl);

    const detach = attachActiveLinks(router);
    t.teardown(() => detach());

    t.is(loginEl.getAttribute('aria-current'), 'page');
    t.is(profileEl.getAttribute('aria-current'), null);
});

test.serial('attachActiveLinks: moves marker on navigate', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup('/login');
    const loginEl = makeElement({ 'data-router-link': '', href: '/login' });
    const profileEl = makeElement({ 'data-router-link': '', href: '/profile' });
    dom.registerElement(loginEl);
    dom.registerElement(profileEl);

    const detach = attachActiveLinks(router);
    t.teardown(() => detach());

    router.navigate('/profile');

    t.is(loginEl.getAttribute('aria-current'), null);
    t.is(profileEl.getAttribute('aria-current'), 'page');
});

test.serial("attachActiveLinks: ariaCurrent:'step'", t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup('/login');
    const el = makeElement({ 'data-router-link': '', href: '/login' });
    dom.registerElement(el);

    const detach = attachActiveLinks(router, { ariaCurrent: 'step' });
    t.teardown(() => detach());

    t.is(el.getAttribute('aria-current'), 'step');
});

test.serial('attachActiveLinks: ariaCurrent:true sets "true"', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup('/login');
    const el = makeElement({ 'data-router-link': '', href: '/login' });
    dom.registerElement(el);

    const detach = attachActiveLinks(router, { ariaCurrent: true });
    t.teardown(() => detach());

    t.is(el.getAttribute('aria-current'), 'true');
});

test.serial('attachActiveLinks: detach removes marker', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup('/login');
    const el = makeElement({ 'data-router-link': '', href: '/login' });
    dom.registerElement(el);

    const detach = attachActiveLinks(router);
    t.is(el.getAttribute('aria-current'), 'page');

    detach();
    t.is(el.getAttribute('aria-current'), null);
});

test.serial('attachActiveLinks: link without href does not throw', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup('/login');
    const el = makeElement({ 'data-router-link': '' }); // no href
    dom.registerElement(el);

    const detach = attachActiveLinks(router);
    t.teardown(() => detach());

    t.is(el.getAttribute('aria-current'), null);
});

test.serial('attachActiveLinks: normalize null → not active', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup('/login');
    const el = makeElement({ 'data-router-link': '', href: 'https://other.com/x' });
    dom.registerElement(el);

    const detach = attachActiveLinks(router);
    t.teardown(() => detach());

    t.is(el.getAttribute('aria-current'), null);
});

test.serial('attachActiveLinks: user-set aria-current is preserved', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const router = setup('/login');
    const loginEl = makeElement({ 'data-router-link': '', href: '/login' });
    const stepEl = makeElement({ 'data-router-link': '', href: '/profile' });
    stepEl.setAttribute('aria-current', 'step'); // user-set, not ours
    dom.registerElement(loginEl);
    dom.registerElement(stepEl);

    const detach = attachActiveLinks(router);
    t.teardown(() => detach());

    // loginEl gets our 'page'; stepEl keeps the user's 'step'.
    t.is(loginEl.getAttribute('aria-current'), 'page');
    t.is(stepEl.getAttribute('aria-current'), 'step');

    // Navigate away — loginEl marker must be removed, stepEl's must not.
    router.navigate('/admin');
    t.is(loginEl.getAttribute('aria-current'), null);
    t.is(stepEl.getAttribute('aria-current'), 'step');
});
