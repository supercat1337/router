// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

/**
 * Named routes and their params. `*` is intentionally absent: it has no
 * canonical URL. `url()` must return a valid RRU for every entry; `match`
 * must yield `matched`, the same leaf (by `name`), and `params` restricted
 * to the route's own `:name` keys (extra params are ignored by `url`).
 */
function fixtures() {
    const map = createMap(
        {
            login: file({ name: 'login' }),
            'reset-password': file({ name: 'resetPassword' }),
            admin: folder(
                {},
                {
                    index: file({ name: 'adminHome' }),
                    users: folder(
                        {},
                        {
                            index: file({ name: 'adminUsers' }),
                            ':id': file({ name: 'adminUser' }),
                        }
                    ),
                    reports: folder(
                        {},
                        {
                            ':year': folder(
                                {},
                                {
                                    index: file({ name: 'adminReportsYear' }),
                                    ':month': file({
                                        name: 'adminReportsMonth',
                                    }),
                                }
                            ),
                        }
                    ),
                    '*': file({ name: 'adminCatchAll' }),
                }
            ),
        },
        { notFound: nf }
    );

    /** @type {Array<{ name: string, params?: Record<string, string>, paramKeys: string[] }>} */
    const routes = [
        { name: 'login', paramKeys: [] },
        { name: 'resetPassword', paramKeys: [] },
        { name: 'adminHome', paramKeys: [] },
        { name: 'adminUsers', paramKeys: [] },
        { name: 'adminUser', params: { id: '5' }, paramKeys: ['id'] },
        { name: 'adminUser', params: { id: 'a b' }, paramKeys: ['id'] },
        { name: 'adminUser', params: { id: 'a/b' }, paramKeys: ['id'] },
        { name: 'adminReportsYear', params: { year: '2024' }, paramKeys: ['year'] },
        {
            name: 'adminReportsMonth',
            params: { year: '2024', month: '06' },
            paramKeys: ['year', 'month'],
        },
    ];

    return { map, routes };
}

test('roundtrip: every named non-wildcard route', t => {
    const { map, routes } = fixtures();
    for (const route of routes) {
        const url = map.url(route.name, route.params);
        const result = map.match(url);
        t.is(result.status, 'matched', `${route.name} → ${url}`);
        if (result.status !== 'matched') continue;
        t.is(result.chain.at(-1)?.name, route.name, `leaf for ${url}`);
        /** @type {Record<string, string>} */
        const picked = {};
        for (const k of route.paramKeys) {
            if (route.params && k in route.params) picked[k] = route.params[k];
        }
        t.deepEqual(result.params, picked, `params for ${url}`);
    }
});

test('roundtrip: url() ignores extra params', t => {
    const { map } = fixtures();
    const url = map.url('adminUser', { id: '5', extra: 'x' });
    t.is(url, '/admin/users/5');
});

test('roundtrip: encoded value decoded back to same params', t => {
    const { map } = fixtures();
    const url = map.url('adminUser', { id: 'a/b' });
    t.is(url, '/admin/users/a%2Fb');
    const r = map.match(url);
    t.is(r.status, 'matched');
    if (r.status === 'matched') t.deepEqual(r.params, { id: 'a/b' });
});

test('roundtrip: index under dynamic ancestor', t => {
    const m = createMap(
        {
            users: folder(
                {},
                {
                    ':id': folder(
                        {},
                        {
                            index: file({ name: 'userHome' }),
                            edit: file({ name: 'userEdit' }),
                        }
                    ),
                }
            ),
        },
        { notFound: nf }
    );
    t.is(m.url('userHome', { id: '5' }), '/users/5');
    t.is(m.url('userEdit', { id: '5' }), '/users/5/edit');

    const r = m.match('/users/5/edit');
    t.is(r.status, 'matched');
    if (r.status === 'matched') {
        t.is(r.chain.at(-1)?.name, 'userEdit');
        t.deepEqual(r.params, { id: '5' });
    }
});
