// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

test('root / is notFound with empty chain', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const r = m.match('/');
    t.is(r.status, 'notFound');
    if (r.status === 'notFound') {
        t.deepEqual(r.chain, []);
        t.is(r.handler, nf);
    }
});

test(':name does not match empty segment', t => {
    const m = createMap({ users: folder({ ':id': file({ name: 'u' }) }) }, { notFound: nf });
    t.is(m.match('/users//').status, 'notFound');
    t.is(m.match('//users').status, 'notFound');
    t.is(m.match('///a').status, 'notFound');
});

test('* matches empty segments', t => {
    const m = createMap(
        { ':id': file({ name: 'x' }), '*': file({ name: 'any' }) },
        { notFound: nf }
    );
    const r1 = m.match('//users');
    t.is(r1.status, 'matched');
    if (r1.status === 'matched') {
        t.is(r1.chain.at(-1)?.name, 'any');
        t.deepEqual(r1.params, {});
    }
    t.is(m.match('///a').status, 'matched');
});

test('search preserved in MatchResult.url but not in matching', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const r = m.match('/login?tab=1');
    t.is(r.status, 'matched');
    t.is(r.url, '/login?tab=1');
});

test('matching is case-sensitive', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.is(m.match('/Login').status, 'notFound');
});

test('percent-encoded literal is compared decoded', t => {
    // Literal `users` matches decoded `users`. `%75%73%65%72%73` decodes
    // to `users`, so the match succeeds; params stay empty.
    const m = createMap({ users: file({ name: 'u' }) }, { notFound: nf });
    const r = m.match('/%75%73%65%72%73');
    t.is(r.status, 'matched');
    if (r.status === 'matched') t.deepEqual(r.params, {});
});

test('invalid percent in segment → :name skipped, * still considered', t => {
    // `%` alone throws URIError inside decodeURIComponent. `tryDecode`
    // returns null; the segment cannot match literal or `:name`. `*`
    // does not decode, so it still matches.
    const m = createMap({ users: folder({ ':id': file({ name: 'u' }) }) }, { notFound: nf });
    t.is(m.match('/users/%').status, 'notFound');

    const m2 = createMap({ '*': file({ name: 'any' }) }, { notFound: nf });
    t.is(m2.match('/%').status, 'matched');
});

test('%35 and 5 decode to same params but are different RRU', t => {
    const m = createMap({ users: folder({ ':id': file({ name: 'u' }) }) }, { notFound: nf });
    const r1 = m.match('/users/%35');
    const r2 = m.match('/users/5');
    t.is(r1.status, 'matched');
    t.is(r2.status, 'matched');
    if (r1.status === 'matched' && r2.status === 'matched') {
        t.deepEqual(r1.params, { id: '5' });
        t.deepEqual(r2.params, { id: '5' });
        t.is(r1.url, '/users/%35');
        t.is(r2.url, '/users/5');
    }
});

test('trailing slash normalized before match', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const r = m.match('/login/');
    t.is(r.status, 'matched');
    if (r.status === 'matched') t.is(r.url, '/login');
});

test('static file with trailing segments → notFound (no backtracking)', t => {
    // users/new is a file; /users/new/extra must not fall through to any
    // :name or * at the `users` level. Backtracking is absent by design.
    const m = createMap(
        {
            users: folder(
                {
                    new: file({ name: 'newUser' }),
                    ':id': file({ name: 'user' }),
                }
            ),
            '*': file({ name: 'catchall' }),
        },
        { notFound: nf }
    );
    const r = m.match('/users/new/extra');
    t.is(r.status, 'notFound');
    if (r.status === 'notFound') {
        // partial chain ends at the file `newUser`
        t.is(r.chain.at(-1)?.name, 'newUser');
    }
});

test('partial chain params decoded during notFound', t => {
    const m = createMap(
        {
            admin: folder(
                {
                    users: folder({ ':id': file({ name: 'user' }) }),
                }
            ),
        },
        { notFound: nf }
    );
    const r = m.match('/admin/users/5/extra');
    t.is(r.status, 'notFound');
    if (r.status === 'notFound') {
        t.is(r.chain.length, 3); // admin, users, :id
        t.deepEqual(r.partialParams, { id: '5' });
    }
});

test('nearest folder.notFound wins over map.notFound', t => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = () => null;
    /** @type {import("../src/types.js").NotFoundHandler} */
    const innerNf = () => 'inner';
    const m = createMap(
        {
            admin: folder({ users: folder({ ':id': file({ name: 'u' }) }) }, { notFound: innerNf }),
        },
        { notFound: mapNf }
    );
    const r = m.match('/admin/missing');
    t.is(r.status, 'notFound');
    if (r.status === 'notFound') t.is(r.handler, innerNf);

    const r2 = m.match('/outside');
    t.is(r2.status, 'notFound');
    if (r2.status === 'notFound') t.is(r2.handler, mapNf);
});
