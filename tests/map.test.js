// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap, isMap, MapValidationError } from '../src/map.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

test('createMap: builds branded frozen map', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.true(isMap(m));
    t.true(Object.isFrozen(m));
});

test('createMap: accepts empty data', t => {
    const m = createMap({}, { notFound: nf });
    t.true(isMap(m));
});

test('createMap: data-not-object', t => {
    try {
        createMap(/** @type {any} */ (null), { notFound: nf });
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'data-not-object');
        t.is(/** @type {MapValidationError} */ (e).path, '');
    }
});

test('createMap: options not object → TypeError', t => {
    t.throws(() => createMap({ login: file({ name: 'login' }) }, /** @type {any} */ (null)), {
        instanceOf: TypeError,
    });
});

test('createMap: notFound-missing', t => {
    try {
        createMap({ login: file({ name: 'login' }) }, /** @type {any} */ ({}));
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'notFound-missing');
    }
});

test('createMap: notFound-invalid', t => {
    try {
        createMap({ login: file({ name: 'login' }) }, { notFound: /** @type {any} */ ('no') });
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'notFound-invalid');
    }
});

test('createMap: index-at-root', t => {
    try {
        createMap({ index: file({ name: 'home' }) }, { notFound: nf });
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'index-at-root');
        t.is(/** @type {MapValidationError} */ (e).path, '/index');
    }
});

test('createMap: data-key-invalid', t => {
    try {
        createMap({ 'foo:id': file({ name: 'x' }) }, { notFound: nf });
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'data-key-invalid');
        t.is(/** @type {MapValidationError} */ (e).path, 'foo:id');
    }
});

test('createMap: node-not-constructed', t => {
    try {
        createMap(/** @type {any} */ ({ login: { name: 'login' } }), { notFound: nf });
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'node-not-constructed');
        t.is(/** @type {MapValidationError} */ (e).path, '/login');
    }
});

test('createMap: name-duplicate', t => {
    try {
        createMap({ a: file({ name: 'same' }), b: file({ name: 'same' }) }, { notFound: nf });
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'name-duplicate');
        t.is(/** @type {MapValidationError} */ (e).path, '/b');
    }
});

test('map.url: literal route', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.is(m.url('login'), '/login');
});

test('map.url: :name route with params', t => {
    const m = createMap({ users: folder({}, { ':id': file({ name: 'user' }) }) }, { notFound: nf });
    t.is(m.url('user', { id: '5' }), '/users/5');
});

test('map.url: index route', t => {
    const m = createMap(
        { admin: folder({}, { index: file({ name: 'adminHome' }) }) },
        { notFound: nf }
    );
    t.is(m.url('adminHome'), '/admin');
});

test('map.url: unknown name throws TypeError', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.throws(() => m.url('missing'), { instanceOf: TypeError });
});

test('map.url: :name without params throws TypeError', t => {
    const m = createMap({ users: folder({}, { ':id': file({ name: 'user' }) }) }, { notFound: nf });
    t.throws(() => m.url('user'), { instanceOf: TypeError });
});

test('map.url: :name with empty value throws TypeError', t => {
    const m = createMap({ users: folder({}, { ':id': file({ name: 'user' }) }) }, { notFound: nf });
    t.throws(() => m.url('user', { id: '' }), { instanceOf: TypeError });
});

test('map.url: * route throws TypeError', t => {
    const m = createMap({ '*': file({ name: 'catchall' }) }, { notFound: nf });
    t.throws(() => m.url('catchall'), { instanceOf: TypeError });
});

test('map.match: matched literal', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const r = m.match('/login');
    t.is(r.status, 'matched');
    if (r.status === 'matched') {
        t.is(r.chain.length, 1);
        t.is(r.url, '/login');
    }
});

test('map.match: notFound with root chain', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    const r = m.match('/missing');
    t.is(r.status, 'notFound');
    if (r.status === 'notFound') {
        t.deepEqual(r.chain, []);
        t.deepEqual(r.partialParams, {});
        t.is(r.handler, nf);
        t.is(r.url, '/missing');
    }
});

test('map.match: / is notFound', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.is(m.match('/').status, 'notFound');
});

test('map.match: * catches remaining segments', t => {
    const m = createMap({ '*': file({ name: 'any' }) }, { notFound: nf });
    t.is(m.match('/a/b/c').status, 'matched');
});

test('map.match: static beats :name', t => {
    const m = createMap(
        {
            users: folder(
                {},
                {
                    new: file({ name: 'newUser' }),
                    ':id': file({ name: 'user' }),
                }
            ),
        },
        { notFound: nf }
    );
    const r = m.match('/users/new');
    t.is(r.status, 'matched');
    if (r.status === 'matched') {
        t.is(r.chain.at(-1)?.name, 'newUser');
    }
});

test('map.match: :name param is decoded', t => {
    const m = createMap({ users: folder({}, { ':id': file({ name: 'user' }) }) }, { notFound: nf });
    const r = m.match('/users/a%2Fb');
    t.is(r.status, 'matched');
    if (r.status === 'matched') {
        t.deepEqual(r.params, { id: 'a/b' });
    }
});

test('map.match: :name does not match empty segment', t => {
    const m = createMap({ ':id': file({ name: 'user' }) }, { notFound: nf });
    t.is(m.match('//users').status, 'notFound');
    t.is(m.match('///a').status, 'notFound');
});

test('map.match: * matches empty segments', t => {
    const m = createMap(
        { ':id': file({ name: 'user' }), '*': file({ name: 'any' }) },
        { notFound: nf }
    );
    const r1 = m.match('//users');
    t.is(r1.status, 'matched');
    if (r1.status === 'matched') {
        t.is(r1.chain.at(-1)?.name, 'any');
        t.deepEqual(r1.params, {});
    }
    const r2 = m.match('///a');
    t.is(r2.status, 'matched');
});
