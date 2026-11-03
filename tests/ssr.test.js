// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';
import {
    createServerAdapter,
    serializeState,
    readInitialState,
    assertHydration,
} from '../src/ssr.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function makeMap() {
    return createMap(
        {
            login: file({ name: 'login' }),
            users: {
                // Use `folder` from data-model in real code; inline for test brevity.
            },
        },
        { notFound: nf }
    );
}

// ===========================================================================
// createServerAdapter
// ===========================================================================

test('createServerAdapter: read from req.url at base', t => {
    const a = createServerAdapter({ url: '/app/users/5' }, { base: '/app/' });
    t.is(a.read(), '/users/5');
    t.is(a.base, '/app/');
});

test('createServerAdapter: read from req.url at root base', t => {
    const a = createServerAdapter({ url: '/users/5' });
    t.is(a.read(), '/users/5');
    t.is(a.base, '/');
});

test('createServerAdapter: root URL', t => {
    const a = createServerAdapter({ url: '/' }, { base: '/app/' });
    t.is(a.read(), '/');
});

test("createServerAdapter: outside base returns '/'", t => {
    const a = createServerAdapter({ url: '/other/x' }, { base: '/app/' });
    t.is(a.read(), '/');
});

test('createServerAdapter: search included in RRU', t => {
    const a = createServerAdapter({ url: '/app/users/5?tab=1&sort=desc' }, { base: '/app/' });
    t.is(a.read(), '/users/5?tab=1&sort=desc');
});

test('createServerAdapter: originalUrl takes precedence over url', t => {
    const a = createServerAdapter(
        { url: '/users/5', originalUrl: '/app/users/5?tab=1' },
        { base: '/app/' }
    );
    t.is(a.read(), '/users/5?tab=1');
});

test('createServerAdapter: write is no-op', t => {
    const a = createServerAdapter({ url: '/' });
    t.notThrows(() => a.write('/x', 'push'));
    t.is(a.read(), '/');
});

test('createServerAdapter: listen returns no-op unsubscribe', t => {
    const a = createServerAdapter({ url: '/' });
    const unsub = a.listen(() => {});
    t.is(typeof unsub, 'function');
    t.notThrows(() => unsub());
});

test('createServerAdapter: normalize returns null', t => {
    const a = createServerAdapter({ url: '/' });
    t.is(a.normalize('/x'), null);
    t.is(a.normalize('https://other.com/x'), null);
});

test('createServerAdapter: href builds BU', t => {
    const a = createServerAdapter({ url: '/' }, { base: '/app/' });
    t.is(a.href('/users/5'), '/app/users/5');
    t.is(a.href('/'), '/app/');
});

test('createServerAdapter: href rejects non-RRU', t => {
    const a = createServerAdapter({ url: '/' });
    t.throws(() => a.href('users/5'), { instanceOf: TypeError });
    t.throws(() => a.href(''), { instanceOf: TypeError });
});

test('createServerAdapter: historyState returns null', t => {
    const a = createServerAdapter({ url: '/' });
    t.is(a.historyState(), null);
});

test('createServerAdapter: replaceState is no-op', t => {
    const a = createServerAdapter({ url: '/' });
    t.notThrows(() => a.replaceState({}));
});

test('createServerAdapter: invalid req throws', t => {
    t.throws(() => createServerAdapter(/** @type {any} */ (null)), { instanceOf: TypeError });
    t.throws(() => createServerAdapter(/** @type {any} */ (undefined)), { instanceOf: TypeError });
});

test('createServerAdapter: invalid req.url throws', t => {
    t.throws(() => createServerAdapter(/** @type {any} */ ({})), { instanceOf: TypeError });
    t.throws(() => createServerAdapter({ url: 'users' }), { instanceOf: TypeError });
});

test('createServerAdapter: invalid base throws', t => {
    t.throws(() => createServerAdapter({ url: '/' }, { base: 'app/' }), { instanceOf: TypeError });
    t.throws(() => createServerAdapter({ url: '/' }, { base: '/app?x=1' }), {
        instanceOf: TypeError,
    });
});

test('createServerAdapter: works with createRouter initial transaction', t => {
    const map = createMap({ users: folder({ ':id': file({ name: 'user' }) }) }, { notFound: nf });
    const adapter = createServerAdapter({ url: '/users/5?tab=1' });
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const snap = router.getSnapshot();
    t.is(snap.url, '/users/5?tab=1');
    t.is(snap.status, 'matched');
    t.deepEqual(snap.params, { id: '5' });
    t.deepEqual(snap.search, { tab: '1' });
    t.is(snap.navigationType, 'initial');
});

// ===========================================================================
// serializeState
// ===========================================================================

test('serializeState: escapes < > &', t => {
    // serializeState wraps in JSON string quotes (it's a JSON literal).
    t.is(serializeState('<div>'), '"\\u003cdiv\\u003e"');
    t.is(serializeState('a&b'), '"a\\u0026b"');
    t.is(JSON.parse(serializeState('<div>')), '<div>');
    t.is(JSON.parse(serializeState('a&b')), 'a&b');
});

test('serializeState: escapes </script>', t => {
    const out = serializeState({ html: '</script><script>alert(1)</script>' });
    t.false(out.includes('</script>'));
    t.false(out.includes('<script>'));
    t.true(out.includes('\\u003c'));
});

test('serializeState: escapes U+2028 and U+2029', t => {
    const out = serializeState({ s: 'a\u2028b\u2029c' });
    t.true(out.includes('\\u2028'));
    t.true(out.includes('\\u2029'));
    t.false(out.includes('\u2028'));
    t.false(out.includes('\u2029'));
});

test('serializeState: round-trips plain JSON', t => {
    const obj = { a: 1, b: 'two', c: [3, 4] };
    t.deepEqual(JSON.parse(serializeState(obj)), obj);
});

test('serializeState: throws on undefined', t => {
    t.throws(() => serializeState(undefined), { instanceOf: TypeError });
});

// ===========================================================================
// readInitialState
// ===========================================================================

test.serial('readInitialState: returns null outside the browser', t => {
    // In Node.js, `window` is undefined.
    t.is(readInitialState(), null);
});

test.serial('readInitialState: returns null when key unset', t => {
    /** @type {any} */ (globalThis).window = {};
    t.teardown(() => {
        delete (/** @type {any} */ (globalThis).window);
    });
    t.is(readInitialState(), null);
});

test.serial('readInitialState: reads window.__INITIAL_STATE__', t => {
    /** @type {any} */ (globalThis).window = {
        __INITIAL_STATE__: { isAuthed: true },
    };
    t.teardown(() => {
        delete (/** @type {any} */ (globalThis).window);
    });
    t.deepEqual(readInitialState(), { isAuthed: true });
});

// ===========================================================================
// assertHydration
// ===========================================================================

function hydrationSnap(url = '/login') {
    return {
        url,
        status: /** @type {'matched'} */ ('matched'),
        params: /** @type {Record<string, string>} */ ({}),
        search: /** @type {Record<string, string>} */ ({}),
    };
}

function makeClientRouter(initial = '/login') {
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    return createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter(initial),
        dev: true,
    });
}

test.serial('assertHydration: no-op when snapshots match', t => {
    const orig = console.warn;
    let warned = false;
    console.warn = () => {
        warned = true;
    };
    t.teardown(() => {
        console.warn = orig;
    });
    const router = makeClientRouter('/login');
    assertHydration(hydrationSnap(), router);
    t.false(warned);
});

test.serial('assertHydration: warns on url mismatch', t => {
    const orig = console.warn;
    /** @type {string[]} */
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    t.teardown(() => {
        console.warn = orig;
    });
    const router = makeClientRouter('/login');
    assertHydration(hydrationSnap('/profile'), router);
    t.is(warnings.length, 1);
    t.true(warnings[0].includes('url'));
});

test.serial('assertHydration: warns on status mismatch', t => {
    const orig = console.warn;
    /** @type {string[]} */
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    t.teardown(() => {
        console.warn = orig;
    });
    const router = makeClientRouter('/login');
    assertHydration({ ...hydrationSnap(), status: /** @type {'notFound'} */ ('notFound') }, router);
    t.is(warnings.length, 1);
    t.true(warnings[0].includes('status'));
});

test.serial('assertHydration: warns on params mismatch', t => {
    const orig = console.warn;
    /** @type {string[]} */
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    t.teardown(() => {
        console.warn = orig;
    });
    const router = makeClientRouter('/login');
    assertHydration({ ...hydrationSnap(), params: { id: '5' } }, router);
    t.is(warnings.length, 1);
    t.true(warnings[0].includes('params'));
});

test.serial('assertHydration: warns on search mismatch', t => {
    const orig = console.warn;
    /** @type {string[]} */
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    t.teardown(() => {
        console.warn = orig;
    });
    const router = makeClientRouter('/login');
    assertHydration({ ...hydrationSnap(), search: { tab: '1' } }, router);
    t.is(warnings.length, 1);
    t.true(warnings[0].includes('search'));
});

test.serial('assertHydration: throws when throw:true', t => {
    const router = makeClientRouter('/login');
    t.throws(() => assertHydration(hydrationSnap('/profile'), router, { throw: true }), {
        message: /hydration mismatch/i,
    });
});

test('assertHydration: no-op with dev:false', t => {
    const router = makeClientRouter('/login');
    t.notThrows(() => assertHydration(hydrationSnap('/profile'), router, { dev: false }));
});

test('assertHydration: throws on invalid serverSnapshot', t => {
    const router = makeClientRouter('/login');
    t.throws(() => assertHydration(/** @type {any} */ (null), router), { instanceOf: TypeError });
});

test('assertHydration: throws on invalid router', t => {
    t.throws(() => assertHydration(hydrationSnap(), /** @type {any} */ ({})), {
        instanceOf: TypeError,
    });
});
