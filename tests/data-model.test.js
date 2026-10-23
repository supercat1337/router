// @ts-check

import test from 'ava';
import { file, folder, isFile, isFolder } from '../src/data-model.js';

test('file: creates frozen branded node with name', t => {
    const node = file({ name: 'login' });
    t.is(node.name, 'login');
    t.true(Object.isFrozen(node));
    t.true(isFile(node));
    t.false(isFolder(node));
});

test('file: rejects non-object meta', t => {
    t.throws(() => file(/** @type {any} */ (null)), {
        instanceOf: TypeError,
    });
});

test('file: rejects empty name', t => {
    t.throws(() => file({ name: '' }), { instanceOf: TypeError });
});

test('file: rejects non-string title', t => {
    t.throws(() => file({ name: 'x', title: /** @type {any} */ (1) }), {
        instanceOf: TypeError,
    });
});

test('folder: creates frozen branded node with frozen children', t => {
    const node = folder({}, { login: file({ name: 'login' }) });
    t.true(Object.isFrozen(node));
    t.true(Object.isFrozen(node.children));
    t.true(isFolder(node));
});

test('folder: rejects empty children', t => {
    t.throws(() => folder({}, {}), { instanceOf: TypeError });
});

test('folder: rejects non-object children', t => {
    t.throws(() => folder({}, /** @type {any} */ (null)), {
        instanceOf: TypeError,
    });
});

test('folder: rejects async notFound', t => {
    t.throws(
        () =>
            folder({ notFound: /** @type {any} */ (async () => null) }, { x: file({ name: 'x' }) }),
        { instanceOf: TypeError }
    );
});

test('folder: rejects key with colon', t => {
    t.throws(() => folder({}, { 'foo:id': file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
});

test('folder: rejects non-ASCII key', t => {
    t.throws(() => folder({}, { пользователь: file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
});

test("folder: rejects '.' and '..'", t => {
    t.throws(() => folder({}, { '.': file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
    t.throws(() => folder({}, { '..': file({ name: 'y' }) }), {
        instanceOf: TypeError,
    });
});

test("folder: rejects duplicate ':name' keys", t => {
    t.throws(
        () =>
            folder(
                {},
                {
                    ':id': file({ name: 'a' }),
                    ':other': file({ name: 'b' }),
                }
            ),
        { instanceOf: TypeError }
    );
});

test("folder: rejects folder under '*' key", t => {
    t.throws(() => folder({}, { '*': folder({}, { x: file({ name: 'x' }) }) }), {
        instanceOf: TypeError,
    });
});

test("folder: rejects folder under 'index' key", t => {
    t.throws(() => folder({}, { index: folder({}, { x: file({ name: 'x' }) }) }), {
        instanceOf: TypeError,
    });
});

test("folder: rejects two ':name' keys with different names", t => {
    t.throws(
        () =>
            folder(
                {},
                {
                    ':id': file({ name: 'a' }),
                    ':slug': file({ name: 'b' }),
                }
            ),
        { instanceOf: TypeError }
    );
});

test("folder: allows one ':name' alongside literals and '*'", t => {
    t.notThrows(() =>
        folder(
            {},
            {
                new: file({ name: 'newUser' }),
                ':id': file({ name: 'user' }),
                '*': file({ name: 'catchall' }),
            }
        )
    );
});

test("folder: allows ':name' at different levels", t => {
    t.notThrows(() =>
        folder(
            {},
            {
                users: folder({}, { ':id': file({ name: 'user' }) }),
                posts: folder({}, { ':slug': file({ name: 'post' }) }),
            }
        )
    );
});

test('file: rejects non-string layout', t => {
    t.throws(() => file({ name: 'x', layout: /** @type {any} */ (1) }), {
        instanceOf: TypeError,
    });
});

test('folder: rejects null options', t => {
    t.throws(() => folder(/** @type {any} */ (null), { x: file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
});

test('folder: rejects array options', t => {
    t.throws(() => folder(/** @type {any} */ ([]), { x: file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
});

test('folder: rejects non-function notFound', t => {
    t.throws(() => folder({ notFound: /** @type {any} */ ('no') }, { x: file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
});
