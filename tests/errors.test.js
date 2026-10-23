// @ts-check

import test from 'ava';
import { file } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { redirect } from '../src/redirect.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function smallMap() {
    return createMap({ login: file({ name: 'login' }) }, { notFound: nf });
}

test('invalid-rru: dev throws', t => {
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => smallMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.throws(() => router.navigate('users'), { instanceOf: TypeError });
    t.throws(() => router.navigate('/a#b'), { instanceOf: TypeError });
    t.throws(() => router.navigate(''), { instanceOf: TypeError });
});

test('invalid-rru: prod commits error snapshot', t => {
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => smallMap(),
        getState: () => ({}),
        adapter,
        dev: false,
    });
    const snap = router.navigate('users');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'invalid-rru');
    t.is(snap.error?.attemptedUrl, 'users');
    t.is(snap.url, '/login');
    t.is(snap.chain.length, router.getHistory()[0].chain.length);
});

test('resolver-throw: prod commits error snapshot', t => {
    const adapter = createMemoryAdapter('/login');
    let throwing = false;
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return smallMap();
        },
        getState: () => ({}),
        adapter,
        dev: false,
    });
    throwing = true;
    const snap = router.navigate('/whatever');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'resolver-throw');
    t.is(snap.error?.error, /** @type {any} */ (snap.error?.error)); // original Error preserved
    t.is(/** @type {any} */ (snap.error?.error).message, 'boom');
});

test('resolver-promise / null / invalid', t => {
    for (const [fn, expected] of [
        [() => Promise.resolve(smallMap()), 'resolver-promise'],
        [() => null, 'resolver-null'],
        [() => ({ match: () => {}, url: () => '/' }), 'resolver-invalid'],
    ]) {
        const adapter = createMemoryAdapter('/login');
        let broken = false;
        const router = createRouter({
            resolveMap: () => {
                if (broken) return /** @type {any} */ (fn());
                return smallMap();
            },
            getState: () => ({}),
            adapter,
            dev: false,
        });
        broken = true;
        const snap = router.navigate('/whatever');
        t.is(snap.status, 'error');
        t.is(snap.error?.type, expected);
    }
});

test('notFound-throw: prod commits error snapshot', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const badNf = () => {
        throw new Error('nf-boom');
    };
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: badNf });
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: false,
    });
    const snap = router.navigate('/missing');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'notFound-throw');
    t.is(/** @type {any} */ (snap.error?.error).message, 'nf-boom');
});

test('notFound-promise: prod commits error snapshot', t => {
    /** @type {any} */
    const badNf = () => Promise.resolve(null);
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: badNf });
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: false,
    });
    const snap = router.navigate('/missing');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'notFound-promise');
});

test('redirect from notFound commits target URL', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = ({ url }) => {
        if (url === '/missing') return redirect('/login');
        return null;
    };
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: mapNf });
    const adapter = createMemoryAdapter('/login');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const snap = router.navigate('/missing');
    t.is(snap.status, 'matched');
    t.is(snap.url, '/login');
    t.deepEqual(router.getRedirectPath(), ['/login']);
});

test('redirect-loop: cycle detection', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = ({ url }) => {
        if (url === '/a') return redirect('/b');
        if (url === '/b') return redirect('/a');
        return null;
    };
    const map = createMap({}, { notFound: mapNf });
    const adapter = createMemoryAdapter('/safe'); // ← было "/a"
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: false,
    });
    const snap = router.navigate('/a');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'redirect-loop');
});

test('redirect-loop: maxRedirects exceeded', t => {
    let n = 0;
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = () => {
        n++;
        return redirect('/missing-' + n);
    };
    const map = createMap(
        { start: file({ name: 'start' }) }, // ← добавили leaf
        { notFound: mapNf }
    );
    const adapter = createMemoryAdapter('/start'); // initial matched
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: false,
        maxRedirects: 3,
    });
    const snap = router.navigate('/whatever');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'redirect-loop');
    t.is(snap.error?.path?.length, 3);
});

test('redirect to invalid RRU in prod → invalid-rru snapshot', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = () => redirect('not-a-rru');
    const map = createMap(
        { login: file({ name: 'login' }) }, // ← добавили leaf
        { notFound: mapNf }
    );
    const adapter = createMemoryAdapter('/login'); // initial matched
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: false,
    });
    const snap = router.navigate('/whatever');
    t.is(snap.status, 'error');
    t.is(snap.error?.type, 'invalid-rru');
    t.is(snap.error?.attemptedUrl, 'not-a-rru');
});

test('getState throw: propagates, no snapshot commit', t => {
    const adapter = createMemoryAdapter('/login');
    let throwing = false;
    const router = createRouter({
        resolveMap: () => smallMap(),
        getState: () => {
            if (throwing) throw new Error('state-boom');
            return {};
        },
        adapter,
        dev: true,
    });
    const before = router.getSnapshot();
    throwing = true;
    t.throws(() => router.navigate('/profile'), { message: 'state-boom' });
    t.is(router.getSnapshot(), before);
});

test('adapter.write throw: propagates, no snapshot commit', t => {
    const adapter = createMemoryAdapter('/login');
    const originalWrite = adapter.write;
    let throwing = false;
    adapter.write = (url, mode) => {
        if (throwing) throw new Error('write-boom');
        originalWrite(url, mode);
    };
    const router = createRouter({
        resolveMap: () => smallMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const before = router.getSnapshot();
    throwing = true;
    t.throws(() => router.navigate('/profile'), { message: 'write-boom' });
    t.is(router.getSnapshot(), before);
});

test('navigationError event fires on prod error', t => {
    const adapter = createMemoryAdapter('/login');
    let throwing = false;
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return smallMap();
        },
        getState: () => ({}),
        adapter,
        dev: false,
    });
    let seen = null;
    router.on('navigationError', p => {
        seen = p;
    });
    throwing = true;
    router.navigate('/profile');
    t.truthy(seen);
    t.is(seen.type, 'resolver-throw');
    t.is(seen.snapshot.status, 'error');
});
