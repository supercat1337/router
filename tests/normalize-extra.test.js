// @ts-check

import test from 'ava';
import { isValidRRU } from '../src/normalize.js';

test('isValidRRU: rejects non-string', t => {
    t.false(isValidRRU(/** @type {any} */ (null)));
    t.false(isValidRRU(/** @type {any} */ (undefined)));
    t.false(isValidRRU(/** @type {any} */ (1)));
    t.false(isValidRRU(/** @type {any} */ ({})));
});

test('isValidRRU: rejects empty / no leading slash / hash', t => {
    t.false(isValidRRU(''));
    t.false(isValidRRU('users'));
    t.false(isValidRRU('/users#x'));
});

test('isValidRRU: accepts valid forms', t => {
    t.true(isValidRRU('/'));
    t.true(isValidRRU('/users'));
    t.true(isValidRRU('/users?tab=1'));
    t.true(isValidRRU('/a//b'));
});
