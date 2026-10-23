// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';

test('folder: rejects :name starting with digit', t => {
    t.throws(() => folder({}, { ':1id': file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
});

test('folder: rejects :name with invalid chars', t => {
    t.throws(() => folder({}, { ':id-x': file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
    t.throws(() => folder({}, { ':': file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
});

test('folder: accepts leading underscore :name', t => {
    t.notThrows(() => folder({}, { ':_x': file({ name: 'x' }) }));
});

test('folder: rejects literal with invalid chars', t => {
    t.throws(() => folder({}, { 'a b': file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
    t.throws(() => folder({}, { 'a*': file({ name: 'x' }) }), {
        instanceOf: TypeError,
    });
});
