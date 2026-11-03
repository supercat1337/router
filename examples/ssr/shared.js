// shared.js — runs on both server and client. Same code, same map,
// same loader. This is why SSR works: `resolveMap` is a pure function
// of `(state, url)`, and the tree is code, not data.
import { createMap, file, folder, isFile } from '@supercat1337/router';

export const routes = {
    // `index` at root matches `/` — the site's home page. No separate
    // `home` route needed.
    index: file({ name: 'home' }),
    about: file({ name: 'about' }),
    users: folder({
        ':id': file({ name: 'user' }),
    }),
};

/**
 * `index` at root matches `/`. Other unmatched URLs (`/missing`)
 * render 404 via `notFound`.
 */
export function makeMap() {
    return createMap(routes, { notFound: () => ({ view: '404' }) });
}

export function resolveMap() {
    // Single map in this example. For state-relative routing
    // (guest / user / admin), see examples/vanilla-spa/.
    return makeMap();
}

export function getState() {
    // On the server: from the request (session, tenant, flags).
    // On the client: from `readInitialState()` — see client.js.
    return {};
}

/**
 * The shared loader. Runs on the server **before** render, and on the
 * client in `afterEnter` for subsequent navigations. One function, one
 * cache policy, no duplication.
 *
 * In a real app: `fetch(`/api/users/${id}`)`. Simulated here with a
 * delay, so the server-rendered HTML visibly contains the loaded data.
 *
 * @param {import('@supercat1337/router').Snapshot} snapshot
 * @returns {Promise<unknown>}
 */
export async function loadData(snapshot) {
    if (!isFile(snapshot.leaf)) return null;
    if (snapshot.leaf.name === 'user') {
        const id = snapshot.params.id;
        await new Promise(r => setTimeout(r, 50));
        return { id, name: `User #${id}` };
    }
    return null;
}

/**
 * Renders the view to an HTML string. Same function on server (inside
 * `#app` before sending) and client (inside `#app` after navigation).
 * Framework apps would render a component instead — the router does not
 * care.
 *
 * @param {import('@supercat1337/router').Snapshot} snapshot
 * @param {any} data
 * @returns {string}
 */
export function renderView(snapshot, data) {
    if (snapshot.status === 'notFound') return '<h1>404 — not found</h1>';
    if (!isFile(snapshot.leaf)) return '';
    switch (snapshot.leaf.name) {
        case 'home':
            return `
                <h1>Home</h1>
                <ul>
                    <li><a href="/users/1" data-router-link>User 1</a></li>
                    <li><a href="/users/2" data-router-link>User 2</a></li>
                    <li><a href="/about" data-router-link>About</a></li>
                </ul>
            `;
        case 'about':
            return '<h1>About</h1><p>Minimal SSR example.</p><a href="/" data-router-link>Home</a>';
        case 'user':
            return `<h1>${data?.name ?? 'Loading…'}</h1><a href="/" data-router-link>Home</a>`;
        default:
            return '';
    }
}
