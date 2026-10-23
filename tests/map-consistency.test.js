// @ts-check

import test from 'ava';
import { file, folder } from '../src/data-model.js';
import { createMap } from '../src/map.js';

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

/**
 * Each map in a multi-map app must expose the same shared routes (login,
 * resetPassword). A drift between maps is a silent 404. This is a project
 * requirement, not an API feature — see 01-data-model.md#5.
 */
test('all maps expose shared routes', t => {
    /** @type {() => import("../src/types.js").Children} */
    const publicRoutes = () => ({
        login: file({ name: 'login' }),
        'reset-password': file({ name: 'resetPassword' }),
    });

    const guestMap = createMap({ ...publicRoutes() }, { notFound: nf });
    const userMap = createMap(
        {
            ...publicRoutes(),
            profile: folder({}, { index: file({ name: 'profile' }) }),
        },
        { notFound: nf }
    );
    const adminMap = createMap(
        {
            ...publicRoutes(),
            admin: folder({}, { index: file({ name: 'adminHome' }) }),
        },
        { notFound: nf }
    );

    for (const map of [guestMap, userMap, adminMap]) {
        for (const name of ['login', 'resetPassword']) {
            t.notThrows(() => map.url(name), `url(${name})`);
            const r = map.match(map.url(name));
            t.is(r.status, 'matched', `match of ${name}`);
        }
    }
});
