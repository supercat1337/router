// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter, isRouter } from '../src/router.js';
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
    return { router, map, adapter };
}

test('isRouter: true for createRouter result', t => {
    const { router } = setup();
    t.true(isRouter(router));
});

test('isRouter: false for null / undefined / primitives', t => {
    t.false(isRouter(null));
    t.false(isRouter(undefined));
    t.false(isRouter(1));
    t.false(isRouter('x'));
    t.false(isRouter(true));
    t.false(isRouter(Symbol('x')));
});

test('isRouter: false for plain objects', t => {
    t.false(isRouter({}));
    t.false(isRouter([]));
    t.false(isRouter(new Date()));
});

test('isRouter: false for structural lookalike (no brand)', t => {
    // Same shape as Router, but no private Symbol — the whole point of the
    // brand. A structural check (`'navigate' in x`) would accept this.
    const fake = {
        adapter: createMemoryAdapter('/'),
        navigate: () => {},
        replace: () => {},
        revalidate: () => {},
        back: () => {},
        forward: () => {},
        url: () => '/',
        getSnapshot: () => ({}),
        getState: () => ({}),
        isCurrent: () => false,
        subscribe: () => () => {},
        on: () => () => {},
        off: () => {},
        once: () => () => {},
    };
    t.false(isRouter(fake));
});

test('isRouter: false for other branded values (map, file, redirect)', t => {
    const { map } = setup();
    const fileNode = file({ name: 'x' });
    t.false(isRouter(map));
    t.false(isRouter(fileNode));
});

test('isRouter: independent per instance', t => {
    const a = setup().router;
    const b = setup().router;
    t.true(isRouter(a));
    t.true(isRouter(b));
    t.not(a, b);
});

test('Symbol.toStringTag: router shows as "Router"', t => {
    const { router } = setup();
    t.is(Object.prototype.toString.call(router), '[object Router]');
    t.is(String(router), '[object Router]');
});

test('Symbol.toStringTag: does not leak into enumeration', t => {
    const { router } = setup();
    // The brand and toStringTag are non-enumerable — they must not appear
    // in Object.keys / spread. Otherwise JSON.stringify(router) changes shape.
    t.false(Object.keys(router).includes('toStringTag'));
    // Sanity: the public methods are enumerable (unchanged behaviour).
    t.true(Object.keys(router).includes('navigate'));
});
