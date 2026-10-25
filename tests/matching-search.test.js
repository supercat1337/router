// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

test('match: search parsed for matched', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const r = m.match('/login?tab=1&sort=desc');
    t.is(r.status, 'matched');
    t.deepEqual(r.search, { tab: '1', sort: 'desc' });
});

test('match: search empty when no query', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.deepEqual(m.match('/login').search, {});
});

test('match: search empty when trailing ?', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.deepEqual(m.match('/login?').search, {});
});

test('match: search parsed for notFound', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const r = m.match('/missing?from=home');
    t.is(r.status, 'notFound');
    t.deepEqual(r.search, { from: 'home' });
});

test('match: duplicate keys → last wins', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.deepEqual(m.match('/login?a=1&a=2').search, { a: '2' });
});

test('match: encoded values decoded', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.deepEqual(m.match('/login?q=a%20b').search, { q: 'a b' });
});

test('match: search independent from path params', t => {
    const m = createMap({ users: folder( { ':id': file({ name: 'user' }) }) }, { notFound: nf });
    const r = m.match('/users/5?tab=profile');
    t.is(r.status, 'matched');
    if (r.status === 'matched') {
        t.deepEqual(r.params, { id: '5' });
        t.deepEqual(r.search, { tab: 'profile' });
    }
});
