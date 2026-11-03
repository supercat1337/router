// src/ssr.js
function validateBase(base) {
  if (typeof base !== "string" || !base.startsWith("/")) {
    throw new TypeError(
      "adapter.base must be a pathname starting with '/', got " + JSON.stringify(base)
    );
  }
  if (base.includes("?") || base.includes("#")) {
    throw new TypeError("adapter.base must not contain '?' or '#'");
  }
  return base.endsWith("/") ? base : base + "/";
}
function createServerAdapter(req, opts = {}) {
  if (!req || typeof req !== "object") {
    throw new TypeError("createServerAdapter: req must be an object");
  }
  const rawUrl = req.originalUrl ?? req.url;
  if (typeof rawUrl !== "string" || !rawUrl.startsWith("/")) {
    throw new TypeError(
      "createServerAdapter: req.url must be a pathname starting with /, got " + JSON.stringify(rawUrl)
    );
  }
  const resolvedBase = validateBase(opts.base ?? "/");
  const parsed = new URL(rawUrl, "http://localhost");
  const pathname = parsed.pathname;
  const search = parsed.search;
  let rru;
  if (!pathname.startsWith(resolvedBase)) {
    rru = "/";
  } else {
    rru = "/" + pathname.slice(resolvedBase.length) + search;
    if (rru.includes("#")) {
      rru = "/";
    }
  }
  return {
    base: resolvedBase,
    read() {
      return rru;
    },
    write(_url, _mode) {
    },
    listen(_cb) {
      return () => {
      };
    },
    normalize(_href) {
      return null;
    },
    href(rru2, _opts) {
      if (typeof rru2 !== "string" || !rru2.startsWith("/")) {
        throw new TypeError(
          "adapter.href: expected RRU starting with '/', got " + JSON.stringify(rru2)
        );
      }
      return resolvedBase + rru2.slice(1);
    },
    historyState() {
      return null;
    },
    replaceState(_state) {
    }
  };
}
function serializeState(state) {
  const json = JSON.stringify(state);
  if (json === void 0) {
    throw new TypeError("serializeState: state is not JSON-serializable");
  }
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function readInitialState() {
  if (typeof window === "undefined") {
    return null;
  }
  const state = (
    /** @type {any} */
    window.__INITIAL_STATE__
  );
  return state === void 0 ? null : state;
}
function assertHydration(serverSnapshot, router, options = {}) {
  const runtimeGlobal = globalThis;
  const isProd = options.dev === false || options.dev === void 0 && runtimeGlobal.process?.env?.NODE_ENV === "production";
  if (isProd) {
    return;
  }
  if (!serverSnapshot || typeof serverSnapshot !== "object") {
    throw new TypeError("assertHydration: serverSnapshot must be an object");
  }
  if (!router || typeof router.getSnapshot !== "function") {
    throw new TypeError("assertHydration: router must be a Router");
  }
  const clientSnapshot = router.getSnapshot();
  const problems = [];
  if (serverSnapshot.url !== clientSnapshot.url) {
    problems.push(
      `url: server ${JSON.stringify(serverSnapshot.url)}, client ${JSON.stringify(
        clientSnapshot.url
      )}`
    );
  }
  if (serverSnapshot.status !== clientSnapshot.status) {
    problems.push(
      `status: server ${JSON.stringify(serverSnapshot.status)}, client ${JSON.stringify(
        clientSnapshot.status
      )}`
    );
  }
  const sParams = JSON.stringify(serverSnapshot.params);
  const cParams = JSON.stringify(clientSnapshot.params);
  if (sParams !== cParams) {
    problems.push(`params: server ${sParams}, client ${cParams}`);
  }
  const sSearch = JSON.stringify(serverSnapshot.search);
  const cSearch = JSON.stringify(clientSnapshot.search);
  if (sSearch !== cSearch) {
    problems.push(`search: server ${sSearch}, client ${cSearch}`);
  }
  if (problems.length === 0) {
    return;
  }
  const message = "SSR hydration mismatch \u2014 the client router produced a different snapshot than the server.\n" + problems.map((p) => "  \u2022 " + p).join("\n") + "\n  Usually caused by `resolveMap` or `getState` returning different data\n  on server and client. See `docs/recipes/ssr-hydration.md`.";
  if (options.throw) {
    throw new Error(message);
  }
  if (typeof console !== "undefined" && console.warn) {
    console.warn(message);
  }
}
export {
  assertHydration,
  createServerAdapter,
  readInitialState,
  serializeState
};
