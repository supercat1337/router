// @ts-check

import test from 'ava';
import { createPathAdapter } from '../src/path-adapter.js';
import { createHashAdapter } from '../src/hash-adapter.js';
import { installDom } from './helpers/dom-mock.js';

// ===========================================================================
// path mode
// ===========================================================================

test('path adapter: explicit base valid', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.base, '/app/');
});

test('path adapter: base normalized to trailing slash', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app' });
    t.is(a.base, '/app/');
});

test('path adapter: missing base without <base href> → TypeError', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    t.throws(() => createPathAdapter(), { instanceOf: TypeError });
});

test('path adapter: <base href> with trailing slash used', t => {
    const dom = installDom({ baseHref: 'https://example.com/app/' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter();
    t.is(a.base, '/app/');
});

test('path adapter: <base href> without trailing slash → TypeError', t => {
    const dom = installDom({ baseHref: 'https://example.com/app' });
    t.teardown(() => dom.teardown());
    t.throws(() => createPathAdapter(), { instanceOf: TypeError });
});

test('path adapter: base with query → TypeError', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    t.throws(() => createPathAdapter({ base: '/app?x=1' }), {
        instanceOf: TypeError,
    });
});

test('path adapter: base without leading slash → TypeError', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    t.throws(() => createPathAdapter({ base: 'app/' }), {
        instanceOf: TypeError,
    });
});

test('path adapter: read returns rru with search', t => {
    const dom = installDom({ url: 'https://example.com/app/users/5?tab=1' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.read(), '/users/5?tab=1');
});

test("path adapter: read outside base → '/'", t => {
    const dom = installDom({ url: 'https://example.com/other/x' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.read(), '/');
});

test("path adapter: read SSR → '/'", t => {
    const dom = installDom();
    const a = createPathAdapter({ base: '/app/' });
    dom.teardown();
    t.is(a.read(), '/');
});

test('path adapter: write push', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    a.write('/profile', 'push');
    t.deepEqual(dom.historyCalls, [{ method: 'push', url: '/app/profile' }]);
});

test('path adapter: write replace', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    a.write('/profile', 'replace');
    t.deepEqual(dom.historyCalls, [{ method: 'replace', url: '/app/profile' }]);
});

test('path adapter: listen subscribes and unsubscribes', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    let called = 0;
    const unsub = a.listen(() => {
        called++;
    });
    dom.fire('popstate');
    t.is(called, 1);
    unsub();
    dom.fire('popstate');
    t.is(called, 1);
});

test('path adapter: listen SSR → noop unsubscribe', t => {
    const dom = installDom();
    const a = createPathAdapter({ base: '/app/' });
    dom.teardown();
    const unsub = a.listen(() => {});
    t.is(typeof unsub, 'function');
    t.notThrows(() => unsub());
});

test('path adapter: normalize cross-origin → null', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.normalize('https://other.com/app/x'), null);
});

test('path adapter: normalize mailto → null', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.normalize('mailto:x@x'), null);
});

test('path adapter: normalize outside base → null', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.normalize('/other'), null);
});

test('path adapter: normalize same-doc hash → null', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.normalize('#section'), null);
    t.is(a.normalize('/app/login#x'), null);
});

test('path adapter: normalize cross-page hash → rru without hash', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.normalize('/app/profile#x'), '/profile');
});

test('path adapter: normalize relative rru', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.normalize('/app/profile'), '/profile');
});

test('path adapter: normalize absolute same-origin rru', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.normalize('https://example.com/app/profile'), '/profile');
});

test('path adapter: normalize preserves search', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.normalize('/app/profile?tab=1'), '/profile?tab=1');
});

test('path adapter: write SSR → noop', t => {
    const dom = installDom();
    const a = createPathAdapter({ base: '/app/' });
    dom.teardown();
    t.notThrows(() => a.write('/x', 'push'));
});

// ===========================================================================
// hash mode
// ===========================================================================

test('hash adapter: default base = location.pathname', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.base, '/app');
});

test('hash adapter: explicit base used', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter({ base: '/custom/' });
    t.is(a.base, '/custom/');
});

test('hash adapter: SSR without base → TypeError', t => {
    t.throws(() => createHashAdapter(), { instanceOf: TypeError });
});

test('hash adapter: read normal rru', t => {
    const dom = installDom({ url: 'https://example.com/app#/users/5' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.read(), '/users/5');
});

test("hash adapter: read #section → '/'", t => {
    const dom = installDom({ url: 'https://example.com/app#section' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.read(), '/');
});

test("hash adapter: read multi-# → '/'", t => {
    const dom = installDom({ url: 'https://example.com/app#/users/5#x' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.read(), '/');
});

test("hash adapter: read empty hash → '/'", t => {
    const dom = installDom({ url: 'https://example.com/app' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.read(), '/');
});

test('hash adapter: read SSR throws', t => {
    const dom = installDom();
    const a = createHashAdapter({ base: '/app/' });
    dom.teardown();
    t.throws(() => a.read(), { instanceOf: TypeError });
});

test('hash adapter: write push', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    a.write('/profile', 'push');
    t.is(dom.historyCalls.length, 1);
    t.true(dom.historyCalls[0].url.endsWith('#/profile'));
});

test('hash adapter: write replace', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    a.write('/profile', 'replace');
    t.is(dom.historyCalls.length, 1);
    t.is(dom.historyCalls[0].method, 'replace');
});

test('hash adapter: listen subscribes and unsubscribes', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    let called = 0;
    const unsub = a.listen(() => {
        called++;
    });
    dom.fire('hashchange');
    t.is(called, 1);
    unsub();
    dom.fire('hashchange');
    t.is(called, 1);
});

test('hash adapter: normalize match', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.normalize('https://example.com/app#/users/5'), '/users/5');
});

test('hash adapter: normalize origin mismatch → null', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.normalize('https://other.com/app#/users/5'), null);
});

test('hash adapter: normalize pathname mismatch → null', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.normalize('https://example.com/other#/users/5'), null);
});

test('hash adapter: normalize search mismatch → null', t => {
    const dom = installDom({ url: 'https://example.com/app?x=1#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.normalize('https://example.com/app?x=2#/users/5'), null);
});

test('hash adapter: normalize #section → null', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.normalize('https://example.com/app#section'), null);
});

test('hash adapter: normalize multi-# → null', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.normalize('https://example.com/app#/users#x'), null);
});

test('hash adapter: write SSR → noop', t => {
    const dom = installDom();
    const a = createHashAdapter({ base: '/app/' });
    dom.teardown();
    t.notThrows(() => a.write('/x', 'push'));
});

test('hash adapter: listen SSR → noop unsubscribe', t => {
    const dom = installDom();
    const a = createHashAdapter({ base: '/app/' });
    dom.teardown();
    const unsub = a.listen(() => {});
    t.is(typeof unsub, 'function');
    t.notThrows(() => unsub());
});

test('hash adapter: explicit base without leading slash → TypeError', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    t.throws(() => createHashAdapter({ base: 'app/' }), {
        instanceOf: TypeError,
    });
});

test('hash adapter: explicit base with query → TypeError', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    t.throws(() => createHashAdapter({ base: '/app?x=1' }), {
        instanceOf: TypeError,
    });
});

test('hash adapter: explicit base with hash → TypeError', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    t.throws(() => createHashAdapter({ base: '/app#frag' }), {
        instanceOf: TypeError,
    });
});

test('path adapter: normalize non-http scheme on null-origin page → null', t => {
    // Simulates an extension / file:// / Electron context where
    // location.origin === 'null' (string). A data: URL also has origin
    // 'null' — origin check passes, protocol check fires.
    const dom = installDom({ url: 'file:///app/page' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.normalize('data:text/plain,x'), null);
});

// ===========================================================================
// href
// ===========================================================================

test('path adapter: href builds BU from RRU', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.href('/users/5'), '/app/users/5');
    t.is(a.href('/'), '/app/');
});

test('path adapter: href preserves search in RRU', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.href('/users/5?tab=1'), '/app/users/5?tab=1');
});

test('path adapter: href works in SSR (no location)', t => {
    const dom = installDom();
    const a = createPathAdapter({ base: '/app/' });
    dom.teardown();
    t.is(a.href('/users/5'), '/app/users/5');
});

test('path adapter: href rejects non-RRU', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.throws(() => a.href('users/5'), { instanceOf: TypeError });
    t.throws(() => a.href(''), { instanceOf: TypeError });
});

test('path adapter: href round-trips with normalize', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    const bu = a.href('/users/5?tab=1');
    t.is(a.normalize(bu), '/users/5?tab=1');
});

test('hash adapter: href builds BU with location.search', t => {
    const dom = installDom({ url: 'https://example.com/app?x=1#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.href('/users/5'), '/app?x=1#/users/5');
});

test('hash adapter: href opts.search overrides location.search', t => {
    const dom = installDom({ url: 'https://example.com/app?x=1#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.href('/users/5', { search: '?y=2' }), '/app?y=2#/users/5');
    t.is(a.href('/users/5', { search: '' }), '/app#/users/5');
});

test('hash adapter: href SSR with explicit base', t => {
    const dom = installDom();
    const a = createHashAdapter({ base: '/app/' });
    dom.teardown();
    t.is(a.href('/users/5'), '/app/#/users/5');
    t.is(a.href('/users/5', { search: '?x=1' }), '/app/?x=1#/users/5');
});

test('hash adapter: href rejects non-RRU', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.throws(() => a.href('users/5'), { instanceOf: TypeError });
});

test('hash adapter: href rejects opts.search without ?', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.throws(() => a.href('/x', { search: 'x=1' }), { instanceOf: TypeError });
});

test('hash adapter: href round-trips with normalize', t => {
    const dom = installDom({ url: 'https://example.com/app?x=1#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    const bu = a.href('/users/5');
    t.is(a.normalize(bu), '/users/5');
});

// ===========================================================================
// historyState / replaceState
// ===========================================================================

test('path adapter: historyState starts null', t => {
    const dom = installDom();
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    t.is(a.historyState(), null);
});

test('path adapter: replaceState updates state without URL change', t => {
    const dom = installDom({ url: 'https://example.com/app/login' });
    t.teardown(() => dom.teardown());
    const a = createPathAdapter({ base: '/app/' });
    a.replaceState({ scroll: 100 });
    t.deepEqual(a.historyState(), { scroll: 100 });
    t.is(dom.historyCalls.length, 0);
});

test('path adapter: historyState SSR returns null', t => {
    const dom = installDom();
    const a = createPathAdapter({ base: '/app/' });
    dom.teardown();
    t.is(a.historyState(), null);
});

test('path adapter: replaceState SSR is no-op', t => {
    const dom = installDom();
    const a = createPathAdapter({ base: '/app/' });
    dom.teardown();
    t.notThrows(() => a.replaceState({}));
});

test('hash adapter: historyState / replaceState round-trip', t => {
    const dom = installDom({ url: 'https://example.com/app#/login' });
    t.teardown(() => dom.teardown());
    const a = createHashAdapter();
    t.is(a.historyState(), null);
    a.replaceState({ scroll: 42 });
    t.deepEqual(a.historyState(), { scroll: 42 });
    t.is(dom.historyCalls.length, 0);
});

test('hash adapter: replaceState SSR is no-op', t => {
    const dom = installDom();
    const a = createHashAdapter({ base: '/app/' });
    dom.teardown();
    t.notThrows(() => a.replaceState({}));
    t.is(a.historyState(), null);
});
