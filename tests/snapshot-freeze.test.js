// @ts-check

import test from 'ava';
import { file, folder, isFile } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

test('Snapshot is deeply frozen', t => {
    const map = createMap(
        {
            users: folder({}, { ':id': file({ name: 'user' }) }),
        },
        { notFound: nf }
    );
    const adapter = createMemoryAdapter('/users/5');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const snap = router.getSnapshot();
    t.true(Object.isFrozen(snap));
    t.true(Object.isFrozen(snap.chain));
    t.true(Object.isFrozen(snap.params));
    t.true(Object.isFrozen(snap.partialParams));
});

test('Snapshot.leaf — matched', t => {
    const map = createMap(
        { users: folder({}, { ':id': file({ name: 'user' }) }) },
        { notFound: nf }
    );
    const adapter = createMemoryAdapter('/users/5');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const leaf = router.getSnapshot().leaf;
    t.true(isFile(leaf));
    if (isFile(leaf)) t.is(leaf.name, 'user');
});

test('Snapshot.leaf — empty chain', t => {
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const adapter = createMemoryAdapter('/missing');
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.is(router.getSnapshot().status, 'notFound');
    t.is(router.getSnapshot().leaf, undefined);
});

test('Snapshot.error is deeply frozen', t => {
    const map = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const adapter = createMemoryAdapter('/login');
    let throwing = false;
    const router = createRouter({
        resolveMap: () => {
            if (throwing) throw new Error('boom');
            return map;
        },
        getState: () => ({}),
        adapter,
        dev: false,
    });
    throwing = true;
    const snap = router.navigate('/x');
    t.true(Object.isFrozen(snap));
    t.true(Object.isFrozen(snap.error));
    t.true(Object.isFrozen(snap.error?.partialChain));
    t.true(Object.isFrozen(snap.error?.partialParams));
});
