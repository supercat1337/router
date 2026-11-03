// @ts-nocheck
//
// Fixtures: flat/deep maps of a given size, and an in-memory UrlAdapter.
// `file`/`folder`/`createMap` are passed in by the caller — this module
// does not import from `dist/` (which may not exist before `npm run build`).

/**
 * Flat map: N literal routes at the root.
 * @param {number} n
 * @param {{ file: Function, createMap: Function }} h
 */
export function makeFlatMap(n, h) {
    const data = {};
    for (let i = 0; i < n; i++) data[`route${i}`] = h.file({ name: `route${i}` });
    return { data, map: h.createMap(data, { notFound: () => null }) };
}

/**
 * Deep map: ~N leaves at depth 3 (`/gX/fY/lZ`). Groups of 10x10.
 * @param {number} n
 * @param {{ file: Function, folder: Function, createMap: Function }} h
 */
export function makeDeepMap(n, h) {
    const data = {};
    const perGroup = 10;
    let count = 0;
    for (let g = 0; count < n; g++) {
        const groupChildren = {};
        for (let f = 0; f < perGroup && count < n; f++) {
            const folderChildren = {};
            for (let l = 0; l < perGroup && count < n; l++) {
                folderChildren[`l${l}`] = h.file({ name: `r${count}` });
                count++;
            }
            groupChildren[`f${f}`] = h.folder(folderChildren);
        }
        data[`g${g}`] = h.folder(groupChildren);
    }
    return { data, map: h.createMap(data, { notFound: () => null }) };
}

/**
 * Minimal in-memory UrlAdapter — no DOM, no history.
 * @param {string} [initial]
 */
export function makeMemoryAdapter(initial = '/') {
    let current = initial;
    return {
        base: '/',
        read: () => current,
        write(url, _mode = 'push') {
            current = url;
        },
        listen: () => () => {},
        normalize: href => (href.startsWith('/') ? href : null),
        href: rru => rru,
        historyState: () => null,
        replaceState() {},
    };
}
