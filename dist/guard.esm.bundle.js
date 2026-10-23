// src/normalize.js
function normalizeRRU(url) {
  const q = url.indexOf("?");
  const pathname = q >= 0 ? url.slice(0, q) : url;
  const search = q >= 0 ? url.slice(q) : "";
  let stripped = pathname;
  while (stripped.length > 1 && stripped.endsWith("/")) {
    stripped = stripped.slice(0, -1);
  }
  return stripped + search;
}
function isValidRRU(url) {
  if (typeof url !== "string") return false;
  if (url.length === 0) return false;
  if (!url.startsWith("/")) return false;
  if (url.includes("#")) return false;
  return true;
}

// src/guard.js
function createGuardLayer(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("createGuardLayer: options must be an object");
  }
  const guards = options.guards;
  const maxRedirects = options.maxRedirects ?? 10;
  const onError = options.onError;
  const dev = options.dev;
  if (!Array.isArray(guards)) {
    throw new TypeError("createGuardLayer: guards must be an array");
  }
  if (typeof maxRedirects !== "number" || maxRedirects < 0) {
    throw new TypeError("createGuardLayer: maxRedirects must be a non-negative number");
  }
  if (onError !== void 0 && typeof onError !== "function") {
    throw new TypeError("createGuardLayer: onError must be a function");
  }
  const runtimeGlobal = globalThis;
  const isDev = dev !== void 0 ? !!dev : !(runtimeGlobal.process?.env?.NODE_ENV === "production");
  let boundRouter = null;
  let wrappedAdapter = null;
  let currentAbort = null;
  let pendingState = null;
  let syncInGuard = false;
  function makeFacade() {
    const r = (
      /** @type {Router} */
      boundRouter
    );
    return {
      getSnapshot: () => r.getSnapshot(),
      getState: () => r.getState(),
      isCurrent: (id) => r.isCurrent(id),
      url: (name, params) => r.url(name, params)
    };
  }
  function isCancelError(e) {
    if (!(e instanceof Error)) return false;
    return e.name === "CancelError" || e.constructor && e.constructor.name === "CancelError";
  }
  async function runGuards(url, signal, from) {
    const facade = makeFacade();
    for (const guard of guards) {
      if (signal.aborted) return { block: true };
      let decision;
      syncInGuard = true;
      try {
        const promise = guard({ url, from, signal, router: facade });
        syncInGuard = false;
        decision = await promise;
      } catch (e) {
        syncInGuard = false;
        if (isCancelError(e)) return { block: true };
        onError?.({ type: "guard-throw", error: e }, { url, from });
        return { block: true };
      }
      if (signal.aborted) return { block: true };
      if (decision !== "allow") return decision;
    }
    return "allow";
  }
  async function runGuardChain(startUrl) {
    if (currentAbort) currentAbort.abort();
    let controller = new AbortController();
    currentAbort = controller;
    const pendingSince = performance.now();
    pendingState = { url: startUrl, since: pendingSince };
    const redirectPath = [];
    let currentUrl = startUrl;
    let hadRedirect = false;
    try {
      for (; ; ) {
        if (controller.signal.aborted) {
          return { decision: "block", aborted: true };
        }
        const from = (
          /** @type {Router} */
          boundRouter.getSnapshot()
        );
        const decision = await runGuards(currentUrl, controller.signal, from);
        if (controller.signal.aborted) {
          return { decision: "block", aborted: true };
        }
        if (decision === "allow") {
          return {
            decision: "allow",
            url: currentUrl,
            hadRedirect,
            redirectPath,
            aborted: false
          };
        }
        if (typeof decision === "object" && decision !== null && "block" in decision) {
          return { decision: "block", aborted: false };
        }
        if (typeof decision === "object" && decision !== null && "redirect" in decision) {
          const target = decision.redirect;
          if (!isValidRRU(target)) {
            if (isDev) {
              throw new TypeError(
                `guard-layer: invalid redirect target ${JSON.stringify(target)}`
              );
            }
            onError?.({ type: "invalid-rru", target }, { url: currentUrl, from });
            return { decision: "block", aborted: false };
          }
          const normalized = normalizeRRU(target);
          if (redirectPath.length >= maxRedirects || redirectPath.includes(normalized)) {
            if (isDev) {
              throw new TypeError(
                `guard-layer: redirect loop ${redirectPath.join(" \u2192 ")}`
              );
            }
            onError?.(
              {
                type: "guard-redirect-loop",
                path: redirectPath.slice()
              },
              { url: currentUrl, from }
            );
            return { decision: "block", aborted: false };
          }
          redirectPath.push(normalized);
          currentUrl = normalized;
          hadRedirect = true;
          pendingState = { url: normalized, since: pendingSince };
          controller.abort();
          controller = new AbortController();
          currentAbort = controller;
          continue;
        }
        return { decision: "block", aborted: false };
      }
    } finally {
      pendingState = null;
      if (currentAbort === controller) currentAbort = null;
    }
  }
  async function runGuarded(url, mode) {
    if (syncInGuard) {
      if (isDev) {
        throw new TypeError("guard-layer: reentrancy \u2014 nav.* called from within a guard");
      }
      onError?.(
        { type: "reentrancy" },
        {
          url,
          from: (
            /** @type {Router} */
            boundRouter.getSnapshot()
          )
        }
      );
      return { status: "blocked" };
    }
    const result = await runGuardChain(url);
    if (result.aborted) return { status: "blocked" };
    if (result.decision === "block") return { status: "blocked" };
    const finalMode = result.hadRedirect ? "replace" : mode;
    const router = (
      /** @type {Router} */
      boundRouter
    );
    const snapshot = finalMode === "replace" ? router.replace(result.url) : router.navigate(result.url);
    return { status: "committed", snapshot };
  }
  async function handlePopstateAsync(targetUrl, from, e, cb) {
    const result = await runGuardChain(targetUrl);
    if (result.aborted) return;
    const router = (
      /** @type {Router} */
      boundRouter
    );
    const wrapped = (
      /** @type {UrlAdapter} */
      wrappedAdapter
    );
    if (result.decision === "allow") {
      if (!result.hadRedirect) {
        cb(e);
      } else {
        router.replace(result.url);
      }
      return;
    }
    wrapped.write(from.url, "replace");
  }
  function wrapAdapter(adapter) {
    wrappedAdapter = {
      base: adapter.base,
      read: () => adapter.read(),
      write: (url, mode) => adapter.write(url, mode),
      normalize: (href) => adapter.normalize(href),
      listen(cb) {
        return adapter.listen((e) => {
          if (!boundRouter) {
            cb(e);
            return;
          }
          const from = boundRouter.getSnapshot();
          const targetUrl = adapter.read();
          handlePopstateAsync(targetUrl, from, e, cb).catch((err) => {
            onError?.({ type: "guard-throw", error: err }, { url: targetUrl, from });
            adapter.write(from.url, "replace");
          });
        });
      }
    };
    return wrappedAdapter;
  }
  function bind(router) {
    boundRouter = router;
  }
  function navigate() {
    if (!boundRouter) {
      throw new TypeError("guard.navigate(): bind not called");
    }
    return {
      navigate: (url) => runGuarded(url, "navigate"),
      replace: (url) => runGuarded(url, "replace")
    };
  }
  function pending() {
    if (!pendingState) return null;
    return { url: pendingState.url, since: pendingState.since };
  }
  return {
    wrapAdapter,
    bind,
    navigate,
    pending
  };
}
export {
  createGuardLayer
};
