// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

test('url: skips folders where target not found', t => {
    const m = createMap(
        {
            a: folder( { x: file({ name: 'a-x' }) }),
            b: folder( { y: file({ name: 'b-y' }) }),
        },
        { notFound: nf }
    );
    t.is(m.url('b-y'), '/b/y');
});

test('url: finds leaf in second branch of first folder', t => {
    const m = createMap(
        {
            a: folder(
                {
                    x: file({ name: 'a-x' }),
                    y: file({ name: 'a-y' }),
                }
            ),
        },
        { notFound: nf }
    );
    t.is(m.url('a-y'), '/a/y');
});

test('url: skips * during search', t => {
    const m = createMap(
        { '*': file({ name: 'any' }), login: file({ name: 'login' }) },
        { notFound: nf }
    );
    t.is(m.url('login'), '/login');
});
