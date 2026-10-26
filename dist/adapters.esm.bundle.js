// src/path-adapter.js
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
function resolveBase(explicitBase) {
  if (explicitBase !== void 0) return validateBase(explicitBase);
  if (typeof document !== "undefined") {
    const baseEl = (
      /** @type {HTMLBaseElement | null} */
      document.querySelector("base[href]")
    );
    const href = baseEl ? baseEl.href : void 0;
    if (href) {
      const path = new URL(href).pathname;
      if (path.endsWith("/")) return validateBase(path);
      throw new TypeError(
        "createPathAdapter: <base href> must end with '/' (base = " + JSON.stringify(path) + ")"
      );
    }
  }
  throw new TypeError(
    "createPathAdapter: explicit `base` or `<base href>` is required. Auto-computing base from location.pathname is not supported \u2014 it gives wrong results on deep links."
  );
}
function createPathAdapter({ base } = {}) {
  const resolvedBase = resolveBase(base);
  return {
    base: resolvedBase,
    read() {
      if (typeof location === "undefined") return "/";
      const path = location.pathname;
      if (!path.startsWith(resolvedBase)) return "/";
      const rru = "/" + path.slice(resolvedBase.length) + location.search;
      return rru.includes("#") ? "/" : rru;
    },
    write(url, mode) {
      if (typeof history === "undefined") return;
      const full = resolvedBase + url.slice(1);
      if (mode === "push") history.pushState(null, "", full);
      else history.replaceState(null, "", full);
    },
    listen(cb) {
      if (typeof addEventListener === "undefined") return () => {
      };
      addEventListener("popstate", cb);
      return () => removeEventListener("popstate", cb);
    },
    normalize(href) {
      const abs = new URL(href, location.href);
      if (abs.origin !== location.origin) return null;
      if (abs.protocol !== "http:" && abs.protocol !== "https:") {
        return null;
      }
      if (!abs.pathname.startsWith(resolvedBase)) return null;
      const sameDoc = abs.pathname === location.pathname && abs.search === location.search;
      if (sameDoc && abs.hash !== "") return null;
      const rest = abs.pathname.slice(resolvedBase.length);
      return "/" + rest + abs.search;
    },
    href(rru) {
      if (typeof rru !== "string" || !rru.startsWith("/")) {
        throw new TypeError(
          "adapter.href: expected RRU starting with '/', got " + JSON.stringify(rru)
        );
      }
      return resolvedBase + rru.slice(1);
    },
    historyState() {
      if (typeof history === "undefined") return null;
      return history.state;
    },
    replaceState(state) {
      if (typeof history === "undefined" || typeof location === "undefined") return;
      history.replaceState(state, "", location.href);
    }
  };
}

// src/hash-adapter.js
function validateBase2(base) {
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
function createHashAdapter({ base } = {}) {
  const resolvedBase = base !== void 0 ? validateBase2(base) : typeof location !== "undefined" ? location.pathname : null;
  if (resolvedBase === null) {
    throw new TypeError("createHashAdapter: explicit `base` is required in SSR");
  }
  return {
    base: resolvedBase,
    read() {
      if (typeof location === "undefined") {
        throw new TypeError(
          "createHashAdapter.read(): no `location` (SSR). Pass an explicit adapter or use memory mode."
        );
      }
      const hash = location.hash.slice(1);
      if (!hash.startsWith("/") || hash.includes("#")) return "/";
      return hash;
    },
    write(url, mode) {
      if (typeof history === "undefined") return;
      const full = resolvedBase + location.search + "#" + url;
      if (mode === "push") history.pushState(null, "", full);
      else history.replaceState(null, "", full);
    },
    listen(cb) {
      if (typeof addEventListener === "undefined") return () => {
      };
      addEventListener("hashchange", cb);
      return () => removeEventListener("hashchange", cb);
    },
    normalize(href) {
      const abs = new URL(href, location.href);
      if (abs.origin !== location.origin) return null;
      if (abs.pathname !== location.pathname) return null;
      if (abs.search !== location.search) return null;
      const rru = abs.hash.slice(1);
      if (!rru.startsWith("/")) return null;
      if (rru.includes("#")) return null;
      return rru;
    },
    href(rru, opts = {}) {
      if (typeof rru !== "string" || !rru.startsWith("/")) {
        throw new TypeError(
          "adapter.href: expected RRU starting with '/', got " + JSON.stringify(rru)
        );
      }
      let search;
      if (opts.search !== void 0) {
        if (opts.search !== "" && !opts.search.startsWith("?")) {
          throw new TypeError("adapter.href: opts.search must be '' or start with '?'");
        }
        search = opts.search;
      } else if (typeof location !== "undefined") {
        search = location.search;
      } else {
        search = "";
      }
      return resolvedBase + search + "#" + rru;
    },
    historyState() {
      if (typeof history === "undefined") return null;
      return history.state;
    },
    replaceState(state) {
      if (typeof history === "undefined" || typeof location === "undefined") return;
      history.replaceState(state, "", location.href);
    }
  };
}
export {
  createHashAdapter,
  createPathAdapter
};
