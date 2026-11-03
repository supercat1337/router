// client.js — runs in the browser.
import { createRouter } from '@supercat1337/router';
import { createPathAdapter } from '@supercat1337/router/adapters';
import { attachLinks } from '@supercat1337/router/links';
import { readInitialState, assertHydration } from '@supercat1337/router/ssr';
import { resolveMap, getState, loadData, renderView } from './shared.js';

// 1. Read the state the server serialized. In a real app, this is where
//    you'd hydrate session, tenant, feature flags — anything `getState`
//    reads. Here the server sent `{}`, so use the shared `getState` as a
//    fallback.
const state = readInitialState() ?? getState();

const router = createRouter({
    resolveMap,
    getState: () => state,
    adapter: createPathAdapter({ base: '/' }),
    dev: true,
});

// 2. Dev-only hydration check. Compares the client's committed snapshot
//    with what the server sent. Warns (or throws with `{ throw: true }`)
//    if `resolveMap` or `getState` produced different results on the two
//    sides — the #1 cause of hydration mismatch. No-op in prod.
const serverSnapshot = window.__SERVER_SNAPSHOT__;
if (serverSnapshot) assertHydration(serverSnapshot, router);

// 3. Intercept clicks on `[data-router-link]`.
attachLinks(router);

// 4. Client-side data loading. `afterEnter` does NOT fire for the initial
//    commit — the server already rendered that HTML. This hook is for
//    subsequent navigations only.
router.on('afterEnter', async ({ snapshot }) => {
    const data = await loadData(snapshot);
    if (!router.isCurrent(snapshot.navigationId)) return; // superseded
    document.getElementById('app').innerHTML = renderView(snapshot, data);
});
