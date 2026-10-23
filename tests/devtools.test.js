// @ts-check

import test from "ava";
import { file, folder } from "../src/data-model.js";
import { createMap } from "../src/map.js";
import { createRouter } from "../src/router.js";
import { redirect } from "../src/redirect.js";
import { createMemoryAdapter } from "./helpers/memory-adapter.js";

/** @type {import("../src/types.js").NotFoundHandler} */
const nf = () => null;

function simpleMap() {
    return createMap(
        {
            login: file({ name: "login" }),
            users: folder({}, { ":id": file({ name: "user" }) }),
        },
        { notFound: nf },
    );
}

// ---- constructor validations ----

test("createRouter: resolveMap non-function → TypeError", (t) => {
    const adapter = createMemoryAdapter("/login");
    t.throws(
        () =>
            createRouter({
                resolveMap: /** @type {any} */ (null),
                getState: () => ({}),
                adapter,
            }),
        { instanceOf: TypeError },
    );
});

test("createRouter: getState non-function → TypeError", (t) => {
    const adapter = createMemoryAdapter("/login");
    t.throws(
        () =>
            createRouter({
                resolveMap: () => simpleMap(),
                getState: /** @type {any} */ (null),
                adapter,
            }),
        { instanceOf: TypeError },
    );
});

test("createRouter: adapter missing → TypeError", (t) => {
    t.throws(
        () =>
            createRouter({
                resolveMap: () => simpleMap(),
                getState: () => ({}),
                adapter: /** @type {any} */ ({}),
            }),
        { instanceOf: TypeError },
    );
});

test("createRouter: maxRedirects negative → TypeError", (t) => {
    const adapter = createMemoryAdapter("/login");
    t.throws(
        () =>
            createRouter({
                resolveMap: () => simpleMap(),
                getState: () => ({}),
                adapter,
                maxRedirects: -1,
            }),
        { instanceOf: TypeError },
    );
});

// ---- getHistory ----

test("getHistory: returns committed snapshots", (t) => {
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => simpleMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    router.navigate("/users/5");
    const history = router.getHistory();
    t.true(history.length >= 2);
    t.is(history.at(-1)?.url, "/users/5");
});

test("getHistory: bounded at 50", (t) => {
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => simpleMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    for (let i = 0; i < 60; i++) router.revalidate();
    t.is(router.getHistory().length, 50);
});

// ---- dryMatch ----

test("dryMatch: no side effects", (t) => {
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => simpleMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const before = router.getSnapshot();
    const r = router.dryMatch("/users/5");
    t.is(r.status, "matched");
    t.is(router.getSnapshot(), before);
});

test("dryMatch: explicit map skips resolver", (t) => {
    const adapter = createMemoryAdapter("/login");
    let resolverCalls = 0;
    const router = createRouter({
        resolveMap: () => {
            resolverCalls++;
            return simpleMap();
        },
        getState: () => ({}),
        adapter,
        dev: true,
    });
    const alt = createMap({ other: file({ name: "other" }) }, { notFound: nf });
    const baseline = resolverCalls;
    const r = router.dryMatch("/other", { map: alt });
    t.is(r.status, "matched");
    t.is(resolverCalls, baseline);
});

test("dryMatch: explicit state passed to resolver", (t) => {
    const adapter = createMemoryAdapter("/login");
    /** @type {unknown} */
    let lastState = null;
    const router = createRouter({
        resolveMap: ({ state }) => {
            lastState = state;
            return simpleMap();
        },
        getState: () => ({}),
        adapter,
        dev: true,
    });
    router.dryMatch("/login", { state: { flag: true } });
    t.deepEqual(lastState, { flag: true });
});

test("dryMatch: invalid RRU throws", (t) => {
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => simpleMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.throws(() => router.dryMatch("users"), { instanceOf: TypeError });
});

test("dryMatch: resolver-promise / null / invalid throw", (t) => {
    for (const [, fn] of [
        [0, () => Promise.resolve(simpleMap())],
        [1, () => null],
        [2, () => ({ match: () => {}, url: () => "/" })],
    ]) {
        const adapter = createMemoryAdapter("/login");
        let broken = false;
        const router = createRouter({
            resolveMap: () => {
                if (broken) return /** @type {any} */ (fn());
                return simpleMap();
            },
            getState: () => ({}),
            adapter,
            dev: true,
        });
        broken = true;
        t.throws(() => router.dryMatch("/login"), { instanceOf: TypeError });
    }
});

// ---- getActiveMap / resolveMapFor / getRedirectPath ----

test("getActiveMap: returns current map", (t) => {
    const map = simpleMap();
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.is(router.getActiveMap(), map);
});

test("resolveMapFor: valid RRU returns map", (t) => {
    const map = simpleMap();
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.is(router.resolveMapFor("/login"), map);
});

test("resolveMapFor: invalid RRU throws", (t) => {
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => simpleMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.throws(() => router.resolveMapFor("users"), { instanceOf: TypeError });
});

test("resolveMapFor: resolver-promise / null / invalid throw", (t) => {
    for (const fn of [
        () => Promise.resolve(simpleMap()),
        () => null,
        () => ({ match: () => {}, url: () => "/" }),
    ]) {
        const adapter = createMemoryAdapter("/login");
        let broken = false;
        const router = createRouter({
            resolveMap: () => {
                if (broken) return /** @type {any} */ (fn());
                return simpleMap();
            },
            getState: () => ({}),
            adapter,
            dev: true,
        });
        broken = true;
        t.throws(() => router.resolveMapFor("/login"), { instanceOf: TypeError });
    }
});

test("getRedirectPath: undefined without redirect", (t) => {
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => simpleMap(),
        getState: () => ({}),
        adapter,
        dev: true,
    });
    t.is(router.getRedirectPath(), undefined);
});

test("getRedirectPath: populated after redirect", (t) => {
    /** @type {import("../src/types.js").NotFoundHandler} */
    const mapNf = ({ url }) => (url === "/missing" ? redirect("/login") : null);
    const map = createMap({ login: file({ name: "login" }) }, { notFound: mapNf });
    const adapter = createMemoryAdapter("/login");
    const router = createRouter({
        resolveMap: () => map,
        getState: () => ({}),
        adapter,
        dev: true,
    });
    router.navigate("/missing");
    t.deepEqual(router.getRedirectPath(), ["/login"]);
});