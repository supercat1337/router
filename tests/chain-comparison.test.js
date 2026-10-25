// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

test('switching map without RRU change → no leave/enter', t => {
    const mapA = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const mapB = createMap(
        { login: file({ name: 'login' }), profile: file({ name: 'profile' }) },
        { notFound: nf }
    );
    const adapter = createMemoryAdapter('/login');
    /** @type {import("../src/types.js").RouterMap} */
    let currentMap = mapA;
    const router = createRouter({
        resolveMap: () => currentMap,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    /** @type {string[]} */
    const events = [];
    router.on('mapWillChange', () => events.push('mapWillChange'));
    router.on('mapChanged', () => events.push('mapChanged'));
    router.on('beforeLeave', () => events.push('beforeLeave'));
    router.on('afterLeave', () => events.push('afterLeave'));
    router.on('beforeEnter', () => events.push('beforeEnter'));
    router.on('afterEnter', () => events.push('afterEnter'));

    currentMap = mapB;
    router.revalidate();

    t.deepEqual(events, ['mapWillChange', 'mapChanged']);
});

test(':id=5 ↔ literal 5 in different maps → no leave/enter', t => {
    const mapA = createMap(
        {
            users: folder( { ':id': file({ name: 'user' }) }),
        },
        { notFound: nf }
    );
    const mapB = createMap(
        {
            users: folder( { 5: file({ name: 'user' }) }),
        },
        { notFound: nf }
    );
    const adapter = createMemoryAdapter('/users/5');
    /** @type {import("../src/types.js").RouterMap} */
    let currentMap = mapA;
    const router = createRouter({
        resolveMap: () => currentMap,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    let left = 0;
    let entered = 0;
    router.on('beforeLeave', () => left++);
    router.on('beforeEnter', () => entered++);

    currentMap = mapB;
    router.revalidate();

    t.is(left, 0);
    t.is(entered, 0);
});

test('changing :id value → leave + enter', t => {
    const map = createMap(
        { users: folder( { ':id': file({ name: 'user' }) }) },
        { notFound: nf }
    );
    const adapter = createMemoryAdapter('/users/5');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    let left = 0;
    let entered = 0;
    router.on('beforeLeave', () => left++);
    router.on('beforeEnter', () => entered++);

    router.navigate('/users/6');
    t.is(left, 1);
    t.is(entered, 1);
});

test('nested chain: only divergent suffix in leave/enter', t => {
    const map = createMap(
        {
            admin: folder(
                {
                    users: folder( { ':id': file({ name: 'user' }) }),
                    reports: folder( { index: file({ name: 'reports' }) }),
                }
            ),
        },
        { notFound: nf }
    );
    const adapter = createMemoryAdapter('/admin/users/5');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    /** @type {string[]} */
    let leaveNames = [];
    /** @type {string[]} */
    let enterNames = [];
    router.on('beforeLeave', p => {
        leaveNames = p.suffix.map(n => n.name ?? '<folder>');
    });
    router.on('beforeEnter', p => {
        enterNames = p.suffix.map(n => n.name ?? '<folder>');
    });

    router.navigate('/admin/reports');
    // Common prefix: [admin]. leave = [users, :id], enter = [reports, index].
    t.is(leaveNames.length, 2);
    t.is(enterNames.length, 2);
    t.is(enterNames[1], 'reports');
});
