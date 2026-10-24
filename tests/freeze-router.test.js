// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function setup() {
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    return { router, adapter };
}

test('router is frozen', t => {
    t.true(Object.isFrozen(setup().router));
});

test('cannot replace navigate', t => {
    const { router } = setup();
    t.throws(
        () => {
            /** @type {any} */ (router).navigate = () => {};
        },
        { instanceOf: TypeError }
    );
});

test('cannot add new property', t => {
    const { router } = setup();
    t.throws(
        () => {
            /** @type {any} */ (router).extra = 1;
        },
        { instanceOf: TypeError }
    );
});

test('navigate still works after freeze', t => {
    const { router } = setup();
    t.is(router.navigate('/login').status, 'matched');
});

test('adapter is NOT frozen (test doubles mutate)', t => {
    const { adapter } = setup();
    t.false(Object.isFrozen(adapter));
    t.notThrows(() => {
        const original = adapter.write;
        adapter.write = original;
    });
});

test('frozen router still passes isRouter', t => {
    // Sanity: brand survives freeze.
    const { router } = setup();
    t.is(Object.prototype.toString.call(router), '[object Router]');
});
