// @ts-check
import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';
import { createRouter } from '../src/router.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

test('NotFoundContext: receives search and partialParams', t => {
    /** @type {import('../src/types.js').NotFoundContext | null} */
    let captured = null;
    const map = createMap(
        { users: folder( { ':id': file({ name: 'user' }) }) },
        {
            notFound: ctx => {
                captured = ctx;
                return null;
            },
        }
    );
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/'),
        dev: true,
    });
    router.navigate('/users/5/extra?tab=profile');
    t.truthy(captured);
    t.deepEqual(captured.search, { tab: 'profile' });
    t.deepEqual(captured.partialParams, { id: '5' });
});

test('NotFoundContext: empty search and partialParams at root', t => {
    let captured = null;
    const map = createMap(
        { login: file({ name: 'login' }) },
        {
            notFound: ctx => {
                captured = ctx;
                return null;
            },
        }
    );
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter: createMemoryAdapter('/'),
        dev: true,
    });
    router.navigate('/missing');
    t.deepEqual(captured.search, {});
    t.deepEqual(captured.partialParams, {});
});
