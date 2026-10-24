// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function map() {
    return createMap({ login: file({ name: 'login' }) }, { notFound: nf });
}

function opts(dev) {
    return {
        resolveMap: () => map(),
        getState: () => ({}),
        adapter: createMemoryAdapter('/login'),
        dev,
    };
}

function withHook(hook, fn) {
    /** @type {any} */ (globalThis).__SUPERCAT_ROUTER_DEVTOOLS__ = hook;
    try {
        return fn();
    } finally {
        delete (/** @type {any} */ (globalThis).__SUPERCAT_ROUTER_DEVTOOLS__);
    }
}

test('devtools hook: register called in dev mode', t => {
    /** @type {any} */
    let registered = null;
    withHook(
        {
            register: r => {
                registered = r;
            },
        },
        () => {
            const router = createRouter(opts(true));
            t.is(registered, router);
        }
    );
});

test('devtools hook: not called when dev: false', t => {
    let called = false;
    withHook(
        {
            register: () => {
                called = true;
            },
        },
        () => {
            createRouter(opts(false));
            t.false(called);
        }
    );
});

test('devtools hook: missing hook is a no-op', t => {
    t.notThrows(() => createRouter(opts(true)));
});

test('devtools hook: throwing hook does not break createRouter', t => {
    withHook(
        {
            register: () => {
                throw new Error('boom');
            },
        },
        () => {
            const router = createRouter(opts(true));
            t.truthy(router.getSnapshot());
        }
    );
});

test('devtools hook: not-a-function register is ignored', t => {
    withHook({ register: /** @type {any} */ ('not-a-function') }, () => {
        const router = createRouter(opts(true));
        t.truthy(router.getSnapshot());
    });
});

test('devtools hook: router exposed through hook has full surface', t => {
    /** @type {any} */
    let r = null;
    withHook(
        {
            register: x => {
                r = x;
            },
        },
        () => {
            createRouter(opts(true));
        }
    );
    t.truthy(r);
    t.is(typeof r.navigate, 'function');
    t.is(typeof r.subscribe, 'function');
    t.is(typeof r.getHistory, 'function');
    t.is(typeof r.getSnapshot, 'function');
    t.is(r.getSnapshot().url, '/login');
});

test('devtools hook: toStringTag identifies router in DevTools', t => {
    withHook({ register: () => {} }, () => {
        const router = createRouter(opts(true));
        t.is(Object.prototype.toString.call(router), '[object Router]');
    });
});
