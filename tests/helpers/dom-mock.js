// @ts-check

/**
 * Install a fake browser environment on `globalThis`.
 *
 * Mocks: `location`, `history`, `addEventListener`, `removeEventListener`,
 * `document`. `history.pushState`/`replaceState` update `location` and are
 * recorded in `historyCalls` when the URL changes. `replaceState` with the
 * same URL only updates `history.state` — used by `adapter.replaceState()`
 * for scroll restoration (no URL change, no `historyCalls` entry).
 *
 * Call `teardown()` (idempotent) to restore the original globals.
 *
 * @param {{
 *   url?: string,
 *   baseHref?: string,
 * }} [opts]
 */
export function installDom(opts = {}) {
    const url = opts.url ?? 'https://example.com/';
    const parsed = new URL(url);

    const loc = {
        href: parsed.href,
        origin: parsed.origin,
        protocol: parsed.protocol,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
    };

    /** @type {Array<{ method: 'push' | 'replace', url: string }>} */
    const historyCalls = [];

    /** @param {string} u */
    function navigateTo(u) {
        const abs = new URL(u, loc.href);
        loc.href = abs.href;
        loc.pathname = abs.pathname;
        loc.search = abs.search;
        loc.hash = abs.hash;
    }

    const hist = {
        state: /** @type {unknown} */ (null),

        /**
         * @param {unknown} state
         * @param {string} _title
         * @param {string} u
         */
        pushState(state, _title, u) {
            historyCalls.push({ method: 'push', url: u });
            hist.state = state;
            navigateTo(u);
        },

        /**
         * @param {unknown} state
         * @param {string} _title
         * @param {string} u
         */
        replaceState(state, _title, u) {
            hist.state = state;
            const sameUrl = new URL(u, loc.href).href === loc.href;
            if (!sameUrl) {
                historyCalls.push({ method: 'replace', url: u });
                navigateTo(u);
            }
        },
    };

    /** @type {Record<string, Function[]>} */
    const listeners = { popstate: [], hashchange: [] };

    /**
     * @param {string} type
     * @param {Function} fn
     */
    function add(type, fn) {
        (listeners[type] ??= []).push(fn);
    }

    /**
     * @param {string} type
     * @param {Function} fn
     */
    function remove(type, fn) {
        const arr = listeners[type] ?? [];
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
    }

    /** @type {any[]} */
    const registeredElements = [];

    const doc = {
        /** @param {string} sel */
        querySelector(sel) {
            if (opts.baseHref && sel === 'base[href]') {
                return { href: opts.baseHref };
            }
            return null;
        },
        /** @param {string} sel */
        querySelectorAll(sel) {
            return registeredElements.filter(el => el.matches(sel));
        },
        /** @param {string} type @param {Function} fn */
        addEventListener(type, fn) {
            add(type, fn);
        },
        /** @param {string} type @param {Function} fn */
        removeEventListener(type, fn) {
            remove(type, fn);
        },
    };

    /** @type {any} */
    const g = globalThis;
    const orig = {
        hasLocation: 'location' in g,
        hasHistory: 'history' in g,
        hasAdd: 'addEventListener' in g,
        hasRemove: 'removeEventListener' in g,
        hasDocument: 'document' in g,
        location: g.location,
        history: g.history,
        addEventListener: g.addEventListener,
        removeEventListener: g.removeEventListener,
        document: g.document,
    };

    g.location = loc;
    g.history = hist;
    g.addEventListener = add;
    g.removeEventListener = remove;
    g.document = doc;

    let done = false;
    return {
        location: loc,
        historyCalls,
        listeners,
        navigateTo,
        /** @param {any} el */
        registerElement(el) {
            registeredElements.push(el);
        },
        clearElements() {
            registeredElements.length = 0;
        },
        /**
         * @param {string} type
         * @param {object} [event]
         */
        fire(type, event = {}) {
            for (const fn of (listeners[type] ?? []).slice()) fn(event);
            return event;
        },
        teardown() {
            if (done) return;
            done = true;
            if (orig.hasLocation) g.location = orig.location;
            else delete g.location;
            if (orig.hasHistory) g.history = orig.history;
            else delete g.history;
            if (orig.hasAdd) g.addEventListener = orig.addEventListener;
            else delete g.addEventListener;
            if (orig.hasRemove) g.removeEventListener = orig.removeEventListener;
            else delete g.removeEventListener;
            if (orig.hasDocument) g.document = orig.document;
            else delete g.document;
        },
    };
}

/**
 * Minimal DOM element with `dataset` and attribute access for link tests.
 *
 * @param {Record<string, string>} attrs
 */
export function makeElement(attrs) {
    /** @type {Record<string, string>} */
    const store = {};
    for (const key of Object.keys(attrs)) store[key] = String(attrs[key]);
    /** @type {Record<string, string>} */
    const dataset = {};
    for (const key of Object.keys(attrs)) {
        if (key.startsWith('data-')) {
            const camel = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            dataset[camel] = String(attrs[key]);
        }
    }
    /** @type {any} */
    const el = {
        dataset,
        /** @param {string} name */
        getAttribute(name) {
            return name in store ? store[name] : null;
        },
        /**
         * @param {string} name
         * @param {string} value
         */
        setAttribute(name, value) {
            store[name] = String(value);
        },
        /** @param {string} name */
        removeAttribute(name) {
            delete store[name];
        },
        /** @param {string} name */
        hasAttribute(name) {
            return name in store;
        },
        /** @param {string} sel */
        matches(sel) {
            if (sel === '[data-router-link]') return 'data-router-link' in store;
            return false;
        },
        /** @param {string} sel */
        closest(sel) {
            return el.matches(sel) ? el : null;
        },
    };
    return el;
}
