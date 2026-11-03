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

test('createMap: index at root is allowed', t => {
    t.notThrows(() => createMap({ index: file({ name: 'home' }) }, { notFound: nf }));
});

test('createMap: index at root must be a file', t => {
    try {
        createMap({ index: folder({ x: file({ name: 'x' }) }) }, { notFound: nf });
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'index-not-file');
        t.is(/** @type {MapValidationError} */ (e).path, '/index');
    }
});

test('map.url: root index route', t => {
    const m = createMap({ index: file({ name: 'home' }) }, { notFound: nf });
    t.is(m.url('home'), '/');
});

test('map.match: / matches root index', t => {
    const m = createMap({ index: file({ name: 'home' }) }, { notFound: nf });
    const r = m.match('/');
    t.is(r.status, 'matched');
    if (r.status === 'matched') {
        t.is(r.chain.length, 1);
        t.is(r.chain[0].name, 'home');
        t.deepEqual(r.params, {});
    }
});

test('map.route: root index route', t => {
    const m = createMap({ index: file({ name: 'home' }) }, { notFound: nf });
    const route = m.route('home');
    t.is(route.name, 'home');
    t.deepEqual(route.params, []);
    t.is(route.url(), '/');
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

test('createMap: param-duplicate in nested chain', t => {
    try {
        createMap(
            {
                users: folder({
                    ':id': folder({
                        posts: folder({
                            ':id': file({ name: 'userPost' }),
                        }),
                    }),
                }),
            },
            { notFound: nf }
        );
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'param-duplicate');
        t.is(/** @type {MapValidationError} */ (e).path, '/users/:id/posts/:id');
    }
});

test('createMap: param-duplicate at adjacent levels', t => {
    try {
        createMap(
            { ':id': folder({ ':id': file({ name: 'user' }) }) },
            { notFound: nf }
        );
        t.fail('expected throw');
    } catch (e) {
        t.true(e instanceof MapValidationError);
        t.is(/** @type {MapValidationError} */ (e).code, 'param-duplicate');
        t.is(/** @type {MapValidationError} */ (e).path, '/:id/:id');
    }
});

test('createMap: distinct params in chain are OK', t => {
    t.notThrows(() =>
        createMap(
            {
                users: folder({
                    ':id': folder({
                        posts: folder({ ':postId': file({ name: 'userPost' }) }),
                    }),
                }),
            },
            { notFound: nf }
        )
    );
});

test('createMap: same :name in separate branches is OK', t => {
    t.notThrows(() =>
        createMap(
            {
                a: folder({ ':id': file({ name: 'a' }) }),
                b: folder({ ':id': file({ name: 'b' }) }),
            },
            { notFound: nf }
        )
    );
});

test('map.url: literal route', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.is(m.url('login'), '/login');
});

test('map.url: :name route with params', t => {
    const m = createMap({ users: folder( { ':id': file({ name: 'user' }) }) }, { notFound: nf });
    t.is(m.url('user', { id: '5' }), '/users/5');
});

test('map.url: index route', t => {
    const m = createMap(
        { admin: folder( { index: file({ name: 'adminHome' }) }) },
        { notFound: nf }
    );
    t.is(m.url('adminHome'), '/admin');
});

test('map.url: unknown name throws TypeError', t => {
    const m = createMap({ login: file({ name: 'login' }) }, { notFound: nf });
    t.throws(() => m.url('missing'), { instanceOf: TypeError });
});

test('map.url: :name without params throws TypeError', t => {
    const m = createMap({ users: folder( { ':id': file({ name: 'user' }) }) }, { notFound: nf });
    t.throws(() => m.url('user'), { instanceOf: TypeError });
});

test('map.url: :name with empty value throws TypeError', t => {
    const m = createMap({ users: folder( { ':id': file({ name: 'user' }) }) }, { notFound: nf });
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
    const m = createMap({ users: folder( { ':id': file({ name: 'user' }) }) }, { notFound: nf });
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

// ===========================================================================
// Performance regressions — precomputed templates and folder index
// ===========================================================================

test('map.url: works after template precompute for deep + param', t => {
    const m = createMap(
        {
            admin: folder({
                users: folder({
                    ':id': folder({
                        edit: file({ name: 'adminUserEdit' }),
                    }),
                }),
            }),
        },
        { notFound: nf }
    );
    t.is(m.url('adminUserEdit', { id: '5' }), '/admin/users/5/edit');
    t.is(m.url('adminUserEdit', { id: 'a/b' }), '/admin/users/a%2Fb/edit');
    t.is(m.url('adminUserEdit', { id: 'a b' }), '/admin/users/a%20b/edit');
});

test('map.url: template path matches buildUrlImpl for all param names', t => {
    const m = createMap(
        {
            reports: folder({
                ':year': folder({
                    ':month': file({ name: 'report' }),
                }),
            }),
        },
        { notFound: nf }
    );
    t.is(m.url('report', { year: '2024', month: '06' }), '/reports/2024/06');
});

test('map.match: literal index via folder index (no Object.keys scan)', t => {
    const m = createMap(
        {
            a: file({ name: 'a' }),
            b: file({ name: 'b' }),
            c: file({ name: 'c' }),
            d: file({ name: 'd' }),
        },
        { notFound: nf }
    );
    // Every literal must match deterministically.
    for (const k of ['a', 'b', 'c', 'd']) {
        const r = m.match('/' + k);
        t.is(r.status, 'matched', `match /${k}`);
        if (r.status === 'matched') t.is(r.chain.at(-1)?.name, k);
    }
});

test('map.match: param still wins over wildcard, literal still wins over param', t => {
    const m = createMap(
        {
            users: folder({
                new: file({ name: 'newUser' }),
                ':id': file({ name: 'user' }),
                '*': file({ name: 'catchAll' }),
            }),
        },
        { notFound: nf }
    );
    // literal `new` wins
    const r1 = m.match('/users/new');
    if (r1.status === 'matched') t.is(r1.chain.at(-1)?.name, 'newUser');
    // `:id` beats `*`
    const r2 = m.match('/users/5');
    if (r2.status === 'matched') t.is(r2.chain.at(-1)?.name, 'user');
    // `*` catches the rest
    const r3 = m.match('/users/foo/bar');
    if (r3.status === 'matched') t.is(r3.chain.at(-1)?.name, 'catchAll');
});