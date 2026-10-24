// src/internal/symbols.js
var FILE_BRAND = Symbol("spa-router.file");
var FOLDER_BRAND = Symbol("spa-router.folder");
var MAP_BRAND = Symbol("spa-router.map");
var REDIRECT_BRAND = Symbol("spa-router.redirect");
var ROUTER_BRAND = Symbol("spa-router.router");

// src/data-model.js
function file(meta) {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
    throw new TypeError("file(meta): meta must be a plain object");
  }
  if (typeof meta.name !== "string" || meta.name.length === 0) {
    throw new TypeError("file(meta): meta.name must be a non-empty string");
  }
  if (meta.title !== void 0 && typeof meta.title !== "string") {
    throw new TypeError("file(meta): meta.title must be a string when provided");
  }
  if (meta.layout !== void 0 && typeof meta.layout !== "string") {
    throw new TypeError("file(meta): meta.layout must be a string when provided");
  }
  return (
    /** @type {import('./types.js').FileNode<M>} */
    Object.freeze(
      /** @type {any} */
      { ...meta, [FILE_BRAND]: true }
    )
  );
}
function folder(options, children) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("folder(options, children): options must be a plain object");
  }
  if (options.notFound !== void 0 && typeof options.notFound !== "function") {
    throw new TypeError(
      "folder(options, children): options.notFound must be a function when provided"
    );
  }
  if (options.notFound !== void 0 && isAsyncFunction(options.notFound)) {
    throw new TypeError("folder(options, children): options.notFound must be synchronous");
  }
  if (children === null || typeof children !== "object" || Array.isArray(children)) {
    throw new TypeError("folder(options, children): children must be a plain object");
  }
  const keys = Object.keys(children);
  if (keys.length === 0) {
    throw new TypeError("folder(options, children): children must be non-empty");
  }
  let hasParamKey = false;
  for (const key of keys) {
    const parsed = parseKey(key);
    if (parsed === null) {
      throw new TypeError(`folder(options, children): invalid key ${JSON.stringify(key)}`);
    }
    const child = children[key];
    if (parsed.kind === "wildcard" && !isFile(child)) {
      throw new TypeError(
        `folder(options, children): '*' must be a file, got folder at ${JSON.stringify(key)}`
      );
    }
    if (parsed.kind === "index" && !isFile(child)) {
      throw new TypeError("folder(options, children): 'index' must be a file");
    }
    if (parsed.kind === "param") {
      if (hasParamKey) {
        throw new TypeError(
          `folder(options, children): only one ':name' key per level is allowed, got ${JSON.stringify(key)} as second`
        );
      }
      hasParamKey = true;
    }
  }
  return (
    /** @type {import('./types.js').FolderNode<O, C>} */
    Object.freeze(
      /** @type {any} */
      {
        ...options,
        children: Object.freeze({ ...children }),
        [FOLDER_BRAND]: true
      }
    )
  );
}
function isFile(x) {
  return x !== null && typeof x === "object" && /** @type {any} */
  x[FILE_BRAND] === true;
}
function isFolder(x) {
  return x !== null && typeof x === "object" && /** @type {any} */
  x[FOLDER_BRAND] === true;
}
function parseKey(key) {
  if (typeof key !== "string") return null;
  if (key === "*") return { kind: "wildcard" };
  if (key === "index") return { kind: "index" };
  if (key.startsWith(":")) {
    const name = key.slice(1);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return null;
    return { kind: "param", name };
  }
  if (!/^[A-Za-z0-9._~-]+$/.test(key)) return null;
  if (key === "." || key === "..") return null;
  return { kind: "literal" };
}
function isAsyncFunction(fn) {
  return Object.prototype.toString.call(fn) === "[object AsyncFunction]";
}

// src/normalize.js
function normalizeRRU(url) {
  const q = url.indexOf("?");
  const pathname2 = q >= 0 ? url.slice(0, q) : url;
  const search = q >= 0 ? url.slice(q) : "";
  let stripped = pathname2;
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

// src/matching.js
function match(rootChildren, url, mapNotFound) {
  const normalized = normalizeRRU(url);
  const pathname2 = extractPathname(normalized);
  const search = parseSearch(extractSearch(normalized));
  const segments = splitSegments(pathname2);
  const result = walk(rootChildren, segments, [], {}, mapNotFound);
  return (
    /** @type {MatchResult} */
    { ...result, url: normalized, search }
  );
}
function buildUrl(rootChildren, name, params) {
  const result = buildUrlImpl(rootChildren, name, params, "");
  if (result === null) {
    throw new TypeError(`url(): route ${JSON.stringify(name)} not found in this map`);
  }
  return result;
}
function walk(children, segments, partialChain, params, mapNotFound) {
  if (segments.length === 0) {
    if (Object.prototype.hasOwnProperty.call(children, "index")) {
      const child = children["index"];
      return {
        status: "matched",
        chain: [...partialChain, child],
        params: { ...params }
      };
    }
    return {
      status: "notFound",
      chain: partialChain,
      partialParams: { ...params },
      handler: handlerFor(partialChain, mapNotFound)
    };
  }
  const seg = segments[0];
  const rest = segments.slice(1);
  const decoded = tryDecode(seg);
  if (decoded !== null) {
    for (const key of Object.keys(children)) {
      if (!isLiteralKey(key)) continue;
      if (key !== decoded) continue;
      const child = children[key];
      if (isFolder(child)) {
        return walk(child.children, rest, [...partialChain, child], params, mapNotFound);
      }
      if (rest.length === 0) {
        return {
          status: "matched",
          chain: [...partialChain, child],
          params: { ...params }
        };
      }
      return {
        status: "notFound",
        chain: [...partialChain, child],
        partialParams: { ...params },
        handler: handlerFor([...partialChain, child], mapNotFound)
      };
    }
  }
  if (decoded !== null && decoded !== "") {
    for (const key of Object.keys(children)) {
      if (!key.startsWith(":")) continue;
      const paramName = key.slice(1);
      const child = children[key];
      const newParams = { ...params, [paramName]: decoded };
      if (isFolder(child)) {
        return walk(child.children, rest, [...partialChain, child], newParams, mapNotFound);
      }
      if (rest.length === 0) {
        return {
          status: "matched",
          chain: [...partialChain, child],
          params: newParams
        };
      }
      return {
        status: "notFound",
        chain: [...partialChain, child],
        partialParams: newParams,
        handler: handlerFor([...partialChain, child], mapNotFound)
      };
    }
  }
  if (Object.prototype.hasOwnProperty.call(children, "*")) {
    const child = children["*"];
    return {
      status: "matched",
      chain: [...partialChain, child],
      params: { ...params }
    };
  }
  return {
    status: "notFound",
    chain: partialChain,
    partialParams: { ...params },
    handler: handlerFor(partialChain, mapNotFound)
  };
}
function handlerFor(chain, mapNotFound) {
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i];
    if (isFolder(node) && typeof node.notFound === "function") {
      return node.notFound;
    }
  }
  return mapNotFound;
}
function isLiteralKey(key) {
  return key !== "*" && !key.startsWith(":") && key !== "index";
}
function tryDecode(seg) {
  try {
    return decodeURIComponent(seg);
  } catch {
    return null;
  }
}
function extractSearch(url) {
  const q = url.indexOf("?");
  return q >= 0 ? url.slice(q + 1) : "";
}
function parseSearch(query) {
  const result = {};
  if (!query) return result;
  new URLSearchParams(query).forEach((v, k) => {
    result[k] = v;
  });
  return result;
}
function extractPathname(url) {
  const q = url.indexOf("?");
  return q >= 0 ? url.slice(0, q) : url;
}
function splitSegments(pathname2) {
  if (pathname2 === "/") return [];
  const stripped = pathname2.startsWith("/") ? pathname2.slice(1) : pathname2;
  return stripped.split("/");
}
function buildUrlImpl(children, name, params, pathSoFar) {
  for (const key of Object.keys(children)) {
    if (key === "*") continue;
    let segment = null;
    if (key === "index") {
      segment = null;
    } else if (key.startsWith(":")) {
      const paramName = key.slice(1);
      const val = params && params[paramName];
      if (typeof val !== "string" || val === "" || val === "." || val === "..") {
        continue;
      }
      segment = encodeURIComponent(val);
    } else {
      segment = key;
    }
    const newPath = segment === null ? pathSoFar : pathSoFar + "/" + segment;
    const child = children[key];
    if (isFolder(child)) {
      const result = buildUrlImpl(child.children, name, params, newPath);
      if (result !== null) return result;
    } else if (child.name === name) {
      return newPath;
    }
  }
  return null;
}

// src/map.js
var kKeysMap = Symbol("router.map.keysMap");
var kHasRoute = Symbol("router.map.hasRoute");
var MapValidationError = class extends Error {
  /** @type {MapValidationErrorCode} */
  code;
  /** @type {string} */
  path;
  /**
   * @param {MapValidationErrorCode} code
   * @param {string} path
   * @param {string} [message]
   */
  constructor(code, path, message) {
    super(message ?? defaultMessageFor(code, path));
    this.name = "MapValidationError";
    this.code = code;
    this.path = path;
  }
};
function createMap(data, options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("createMap(data, options): options must be a plain object");
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new MapValidationError("data-not-object", "");
  }
  if (options.notFound === void 0) {
    throw new MapValidationError("notFound-missing", "");
  }
  if (typeof options.notFound !== "function") {
    throw new MapValidationError("notFound-invalid", "");
  }
  for (const key of Object.keys(data)) {
    if (key === "index") {
      throw new MapValidationError("index-at-root", "/index");
    }
    if (parseKey(key) === null) {
      throw new MapValidationError("data-key-invalid", key);
    }
  }
  const seenNames = /* @__PURE__ */ new Set();
  const keyMap = /* @__PURE__ */ new WeakMap();
  collectTree(
    /** @type {Children} */
    data,
    "",
    seenNames,
    keyMap
  );
  const notFound = options.notFound;
  const rootChildren = (
    /** @type {Children} */
    data
  );
  const map = {
    notFound,
    url(name, params) {
      return buildUrl(rootChildren, name, params);
    },
    match(url) {
      return match(rootChildren, url, notFound);
    }
  };
  Object.defineProperty(map, MAP_BRAND, { value: true });
  Object.defineProperty(map, kKeysMap, { value: keyMap });
  Object.defineProperty(map, kHasRoute, {
    value: (n) => hasRouteImpl(rootChildren, n)
  });
  return Object.freeze(map);
}
function isMap(x) {
  return x !== null && typeof x === "object" && /** @type {any} */
  x[MAP_BRAND] === true;
}
function collectTree(children, pathPrefix, seenNames, keyMap) {
  for (const key of Object.keys(children)) {
    const childPath = pathPrefix + "/" + key;
    const child = children[key];
    if (!isFile(child) && !isFolder(child)) {
      throw new MapValidationError("node-not-constructed", childPath);
    }
    keyMap.set(child, key);
    if (isFile(child)) {
      if (seenNames.has(child.name)) {
        throw new MapValidationError("name-duplicate", childPath);
      }
      seenNames.add(child.name);
    }
    if (isFolder(child)) {
      collectTree(child.children, childPath, seenNames, keyMap);
    }
  }
}
function defaultMessageFor(code, path) {
  const where = path ? ` at ${path}` : "";
  return `Invalid map${where}: ${code}`;
}
function hasRoute(map, name) {
  if (!map || typeof map !== "object") return false;
  if (typeof name !== "string" || name.length === 0) return false;
  const fn = (
    /** @type {any} */
    map[kHasRoute]
  );
  return typeof fn === "function" ? fn(name) : false;
}
function hasRouteImpl(children, name) {
  for (const key of Object.keys(children)) {
    if (key === "*") continue;
    const child = children[key];
    if (isFile(child)) {
      if (child.name === name) return true;
    } else if (isFolder(child)) {
      if (hasRouteImpl(child.children, name)) return true;
    }
  }
  return false;
}

// src/redirect.js
function redirect(url) {
  return (
    /** @type {RedirectResult} */
    /** @type {unknown} */
    Object.freeze({
      [REDIRECT_BRAND]: true,
      url: String(url)
    })
  );
}
function isRedirect(x) {
  return x !== null && typeof x === "object" && /** @type {any} */
  x[REDIRECT_BRAND] === true;
}

// node_modules/@supercat1337/event-emitter/src/event-emitter-lite.js
var ORIGINAL = Symbol("original");
var EventEmitterLite = class {
  /**
   * @type {Object.<Events extends string | symbol ? Events : keyof Events, Function[]>}
   */
  events = /* @__PURE__ */ Object.create(null);
  /**
   * @type {Function[]}
   * List of listeners that will be invoked for every emitted event.
   * Each listener receives (eventName, ...args).
   */
  anyListeners = [];
  /**
   * logErrors indicates whether errors thrown by listeners should be logged to the console.
   * @type {boolean}
   */
  logErrors = true;
  /**
   * on is used to add a callback function that's going to be executed when the event is triggered
   * @template {Events extends string | symbol ? Events : keyof Events} K
   * @param {K} event
   * @param {Function} listener
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {() => void}
   */
  on(event, listener, options = {}) {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }
    const { signal } = options;
    if (signal?.aborted) {
      return () => {
      };
    }
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    const cleanup = () => {
      this.removeListener(event, listener);
      signal?.removeEventListener("abort", cleanup);
    };
    if (signal) {
      signal.addEventListener("abort", cleanup, { once: true });
    }
    return cleanup;
  }
  /**
   * Add a one-time listener
   * @template {Events extends string | symbol ? Events : keyof Events} K
   * @param {K} event
   * @param {Function} listener
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {()=>void}
   */
  once(event, listener, options = {}) {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }
    const { signal } = options;
    if (signal?.aborted) {
      return () => {
      };
    }
    let cleanup;
    const wrapper = (...args) => {
      if (cleanup) {
        cleanup();
      }
      listener.apply(this, args);
    };
    wrapper[ORIGINAL] = listener;
    cleanup = this.on(event, wrapper, options);
    return cleanup;
  }
  /**
   * off is an alias for removeListener
   * @template {Events extends string | symbol ? Events : keyof Events} K
   * @param {K} event
   * @param {Function} listener
   */
  off(event, listener) {
    return this.removeListener(event, listener);
  }
  /**
   * Remove an event listener from an event
   * @template {Events extends string | symbol ? Events : keyof Events} K
   * @param {K} event
   * @param {Function} listener
   */
  removeListener(event, listener) {
    if (typeof listener !== "function") return;
    const listeners = this.events[event];
    if (!listeners) return;
    const idx = listeners.findIndex((l) => l === listener || l[ORIGINAL] === listener);
    if (idx > -1) {
      listeners.splice(idx, 1);
      if (listeners.length === 0) delete this.events[event];
    }
  }
  /**
   * Adds a listener that will be invoked for every emitted event.
   * @param {Function} listener - The callback (eventName, ...args) => void.
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {() => void}
   */
  onAny(listener, options = {}) {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }
    const { signal } = options;
    if (signal?.aborted) {
      return () => {
      };
    }
    this.anyListeners.push(listener);
    const cleanup = () => {
      this.offAny(listener);
      signal?.removeEventListener("abort", cleanup);
    };
    if (signal) {
      signal.addEventListener("abort", cleanup, { once: true });
    }
    return cleanup;
  }
  /**
   * Removes a listener added via onAny.
   * @param {Function} listener - The listener function to remove.
   */
  offAny(listener) {
    const idx = this.anyListeners.indexOf(listener);
    if (idx > -1) {
      this.anyListeners.splice(idx, 1);
    }
  }
  /**
   * emit is used to trigger an event
   * @template {Events extends string | symbol ? Events : keyof Events} K
   * @param {K} event
   * @param {...any} args
   */
  emit(event, ...args) {
    const listeners = this.events[event];
    if (listeners) {
      const queue = listeners.slice();
      const length = queue.length;
      for (let i = 0; i < length; i++) {
        try {
          queue[i].apply(this, args);
        } catch (e) {
          if (this.logErrors) {
            console.error(`Error in listener for event "${String(event)}":`, e);
          }
        }
      }
    }
    this._emitAny(event, args);
  }
  /**
   * Protected method to invoke any-listeners.
   * @param {string | symbol} event
   * @param {any[]} args
   * @protected
   */
  _emitAny(event, args) {
    const anyListeners = this.anyListeners;
    if (anyListeners.length > 0) {
      const anyQueue = anyListeners.slice();
      const eventName = String(event);
      for (let i = 0; i < anyQueue.length; i++) {
        try {
          anyQueue[i].apply(this, [eventName, ...args]);
        } catch (e) {
          if (this.logErrors) {
            console.error(`Error in any-listener for event "${eventName}":`, e);
          }
        }
      }
    }
  }
  /**
   * Checks if an event has any listeners.
   * @param {Events extends string | symbol ? Events : keyof Events} event
   * @returns {boolean}
   */
  hasListeners(event) {
    const listeners = this.events[event];
    return !!(listeners && listeners.length > 0);
  }
  /**
   * Returns the number of listeners for a specific event.
   * @param {Events extends string | symbol ? Events : keyof Events} event
   * @returns {number}
   */
  listenerCount(event) {
    const listeners = this.events[event];
    return listeners ? listeners.length : 0;
  }
  /**
   * Returns an array of event names that have at least one listener (including Symbols).
   * @returns {(Events extends string | symbol ? Events : keyof Events)[]}
   */
  eventNames() {
    return Reflect.ownKeys(this.events);
  }
  /**
   * Returns a copy of the listeners array for the specified event.
   * @param {Events extends string | symbol ? Events : keyof Events} event
   * @returns {Function[]}
   */
  getListeners(event) {
    const listeners = this.events[event];
    return listeners ? listeners.slice() : [];
  }
  /**
   * Removes all listeners from all events.
   * @returns {void}
   */
  removeAllListeners() {
    this.events = /* @__PURE__ */ Object.create(null);
  }
  /**
   * Alias for removeAllListeners().
   * @deprecated Use removeAllListeners() instead.
   * @returns {void}
   */
  clear() {
    return this.removeAllListeners();
  }
  /**
   * Removes all listeners for a specific event.
   * Does not affect any-listeners.
   * @param {Events extends string | symbol ? Events : keyof Events} event
   * @returns {void}
   */
  removeAllListenersOf(event) {
    if (this.events[event]) {
      delete this.events[event];
    }
  }
};

// node_modules/@supercat1337/event-emitter/src/event-emitter.js
var HAS_LISTENERS = Symbol("has-listeners");
var NO_LISTENERS = Symbol("no-listeners");
var LISTENER_ERROR = Symbol("listener-error");
var EventEmitter = class extends EventEmitterLite {
  /**
   * @type {EventEmitterLite<typeof HAS_LISTENERS | typeof NO_LISTENERS | typeof LISTENER_ERROR>}
   */
  #internalEvents = new EventEmitterLite();
  /**
   * @type {Map<string|symbol, Array<{ internalEvent: typeof HAS_LISTENERS | typeof NO_LISTENERS | typeof LISTENER_ERROR, handler: Function }>>}
   */
  #internalListenersMap = /* @__PURE__ */ new Map();
  #isDestroyed = false;
  #isReportingError = false;
  constructor() {
    super();
    this.#internalEvents.logErrors = false;
  }
  /**
   * @type {boolean}
   */
  get isDestroyed() {
    return this.#isDestroyed;
  }
  /**
   * @template {Events extends string | symbol ? Events : keyof Events} K
   * @param {K} event
   * @param {Function} listener
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {() => void}
   */
  on(event, listener, options = {}) {
    if (this.#isDestroyed) throw new Error("EventEmitter is destroyed");
    const hadListeners = this.hasListeners(event);
    const unsubscriber = super.on(event, listener, options);
    if (!hadListeners && this.hasListeners(event)) {
      this.#emitInternal(HAS_LISTENERS, event);
    }
    return unsubscriber;
  }
  /**
   * @template {Events extends string | symbol ? Events : keyof Events} K
   * @param {K} event
   * @param {Function} listener
   */
  removeListener(event, listener) {
    if (typeof listener !== "function") return;
    if (this.#isDestroyed || !this.events[event]) return;
    super.removeListener(event, listener);
    if (!this.events[event]) {
      this.#emitInternal(NO_LISTENERS, event);
    }
  }
  /**
   * @param {typeof HAS_LISTENERS | typeof NO_LISTENERS | typeof LISTENER_ERROR} internalEvent
   * @param {Function} listener
   * @param {string|symbol} [externalEvent]
   * @returns {()=>void}
   */
  #onInternalEvent(internalEvent, listener, externalEvent) {
    const unsub = this.#internalEvents.on(internalEvent, listener);
    if (externalEvent !== void 0) {
      if (!this.#internalListenersMap.has(externalEvent)) {
        this.#internalListenersMap.set(externalEvent, []);
      }
      const entries = this.#internalListenersMap.get(externalEvent);
      if (entries) {
        entries.push({ internalEvent, handler: listener });
      }
    }
    return () => {
      unsub();
      if (externalEvent !== void 0) {
        const entries = this.#internalListenersMap.get(externalEvent);
        if (entries) {
          const idx = entries.findIndex(
            (entry) => entry.handler === listener && entry.internalEvent === internalEvent
          );
          if (idx > -1) {
            entries.splice(idx, 1);
            if (entries.length === 0) {
              this.#internalListenersMap.delete(externalEvent);
            }
          }
        }
      }
    };
  }
  /**
   * @template {Events extends string | symbol ? Events : keyof Events} K
   * @param {K} event
   * @param {...any} args
   */
  emit(event, ...args) {
    if (this.#isDestroyed) return;
    const listeners = this.events[event];
    if (listeners) {
      const queue = listeners.slice();
      for (let i = 0; i < queue.length; i++) {
        try {
          queue[i].apply(this, args);
        } catch (e) {
          this.#emitInternal(LISTENER_ERROR, e, event, ...args);
          if (this.logErrors) {
            console.error(`Error in listener for event "${String(event)}":`, e);
          }
        }
      }
    }
    this._emitAny(event, args);
  }
  /**
   * Override to catch errors in any-listeners and emit LISTENER_ERROR.
   * @param {string | symbol} event
   * @param {any[]} args
   * @protected
   */
  _emitAny(event, args) {
    const anyListeners = this.anyListeners;
    if (anyListeners.length === 0) return;
    const anyQueue = anyListeners.slice();
    const eventName = String(event);
    for (let i = 0; i < anyQueue.length; i++) {
      try {
        anyQueue[i].apply(this, [eventName, ...args]);
      } catch (e) {
        this.#emitInternal(LISTENER_ERROR, e, event, ...args);
        if (this.logErrors) {
          console.error(`Error in any-listener for event "${eventName}":`, e);
        }
      }
    }
  }
  /**
   * @param {typeof HAS_LISTENERS | typeof NO_LISTENERS | typeof LISTENER_ERROR} event
   * @param {...any} args
   */
  #emitInternal(event, ...args) {
    const listeners = this.#internalEvents.events[event];
    if (!listeners || listeners.length === 0) return;
    const queue = listeners.slice();
    for (const fn of queue) {
      try {
        fn.apply(this, args);
      } catch (e) {
        if (event === LISTENER_ERROR || this.#isReportingError) {
          if (this.logErrors) {
            console.error("Critical error in internal listener:", e);
          }
          continue;
        }
        this.#isReportingError = true;
        try {
          this.#emitInternal(LISTENER_ERROR, e, event, ...args);
        } finally {
          this.#isReportingError = false;
        }
      }
    }
  }
  /**
   * @template {Events extends string | symbol? Events : keyof Events} K
   * @param {K} event
   * @param {number} [max_wait_ms=0]
   * @returns {Promise<boolean>}
   */
  waitForEvent(event, max_wait_ms = 0) {
    return this.waitForAnyEvent([event], max_wait_ms);
  }
  /**
   * @template {Events extends string | symbol? Events : keyof Events} K
   * @param {K[]} events
   * @param {number} [max_wait_ms=0]
   * @returns {Promise<boolean>}
   */
  waitForAnyEvent(events, max_wait_ms = 0) {
    if (this.#isDestroyed) throw new Error("EventEmitter is destroyed");
    if (!Array.isArray(events) || events.length === 0) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      let timeout;
      const unsubscribers = [];
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        unsubscribers.forEach((u) => u());
      };
      const onEvent = () => {
        cleanup();
        resolve(true);
      };
      const uniqueEvents = [...new Set(events)];
      uniqueEvents.forEach((event) => {
        unsubscribers.push(this.on(event, onEvent));
      });
      if (max_wait_ms > 0) {
        timeout = setTimeout(() => {
          cleanup();
          resolve(false);
        }, max_wait_ms);
      }
    });
  }
  /**
   * @param {{ removeInternalListeners?: boolean }} [options]
   * @returns {void}
   */
  removeAllListeners(options = {}) {
    if (this.#isDestroyed) return;
    const { removeInternalListeners = false } = options;
    const eventNames = this.eventNames();
    super.removeAllListeners();
    for (const event of eventNames) {
      this.#emitInternal(NO_LISTENERS, event);
    }
    if (removeInternalListeners) {
      this.#clearAllInternalListeners();
    }
  }
  /**
   * @deprecated Use removeAllListeners() instead.
   * @returns {void}
   */
  clear() {
    return this.removeAllListeners();
  }
  /**
   * Destroys the event emitter.
   */
  destroy() {
    if (this.#isDestroyed) return;
    this.removeAllListeners({ removeInternalListeners: true });
    this.anyListeners = [];
    this.#internalEvents = new EventEmitterLite();
    this.#internalEvents.logErrors = false;
    this.#isDestroyed = true;
  }
  /**
   * @param {Events extends string | symbol ? Events : keyof Events} event
   * @returns {void}
   */
  removeAllListenersOf(event) {
    if (this.#isDestroyed) return;
    const hadListeners = this.hasListeners(event);
    super.removeAllListenersOf(event);
    if (hadListeners) {
      this.#emitInternal(NO_LISTENERS, event);
    }
  }
  /**
   * @deprecated Use removeAllListenersOf() instead.
   * @param {Events extends string | symbol ? Events : keyof Events} event
   * @returns {void}
   */
  clearEventListeners(event) {
    return this.removeAllListenersOf(event);
  }
  /**
   * @param {Events extends string | symbol ? Events : keyof Events} event
   * @returns {void}
   */
  removeAllInternalListenersOf(event) {
    if (this.#isDestroyed) return;
    const entries = this.#internalListenersMap.get(event);
    if (entries) {
      for (const { internalEvent, handler } of entries) {
        this.#internalEvents.removeListener(internalEvent, handler);
      }
      this.#internalListenersMap.delete(event);
    }
  }
  /**
   * @param {string|symbol} event
   * @param {Function} callback
   * @returns {()=>void}
   */
  onHasEventListeners(event, callback) {
    if (this.#isDestroyed) throw new Error("EventEmitter is destroyed");
    const handler = (emittedEvent, ...args) => {
      if (emittedEvent === event) {
        callback(emittedEvent, ...args);
      }
    };
    return this.#onInternalEvent(HAS_LISTENERS, handler, event);
  }
  /**
   * @param {string|symbol} event
   * @param {Function} callback
   * @returns {()=>void}
   */
  onNoEventListeners(event, callback) {
    if (this.#isDestroyed) throw new Error("EventEmitter is destroyed");
    const handler = (emittedEvent, ...args) => {
      if (emittedEvent === event) {
        callback(emittedEvent, ...args);
      }
    };
    return this.#onInternalEvent(NO_LISTENERS, handler, event);
  }
  /**
   * @param {Function} callback
   * @returns {()=>void}
   */
  onListenerError(callback) {
    if (this.#isDestroyed) throw new Error("EventEmitter is destroyed");
    return this.#onInternalEvent(LISTENER_ERROR, callback);
  }
  #clearAllInternalListeners() {
    for (const [key, entries] of this.#internalListenersMap) {
      for (const { internalEvent, handler } of entries) {
        this.#internalEvents.removeListener(internalEvent, handler);
      }
    }
    this.#internalListenersMap.clear();
  }
};

// src/events.js
function createEventBus(onListenerError) {
  const emitter = new EventEmitter();
  emitter.onListenerError(
    /**
     * @param {unknown} err
     * @param {string} event
     * @param {any} payload
     */
    (err, event, payload) => {
      if (onListenerError) {
        onListenerError(err, {
          event: (
            /** @type {keyof EventPayloads} */
            event
          ),
          snapshot: (
            /** @type {Snapshot} */
            /** @type {any} */
            payload?.snapshot
          )
        });
      } else if (typeof console !== "undefined" && console.error) {
        console.error(err);
      }
    }
  );
  return (
    /** @type {EventBus} */
    {
      on: (event, listener) => emitter.on(event, listener),
      off: (event, listener) => emitter.off(event, listener),
      once: (event, listener) => emitter.once(event, listener),
      emit: (event, payload) => emitter.emit(event, payload)
    }
  );
}

// src/snapshot.js
function chainParams(snapshot) {
  return snapshot.status === "matched" ? snapshot.params : snapshot.partialParams;
}
function pathname(url) {
  const q = url.indexOf("?");
  return q >= 0 ? url.slice(0, q) : url;
}
function urlPrefixes(chain, snapshot, keysMap) {
  const prefixes = [];
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const key = keysMap.get(node);
    const parentPrefix = i === 0 ? "" : prefixes[i - 1];
    let prefix;
    if (key === void 0) {
      prefix = parentPrefix;
    } else if (key === "index") {
      prefix = parentPrefix;
    } else if (key === "*") {
      prefix = pathname(snapshot.url);
    } else if (key.startsWith(":")) {
      const name = key.slice(1);
      const params = chainParams(snapshot);
      prefix = parentPrefix + "/" + (params[name] ?? "");
    } else {
      prefix = parentPrefix + "/" + key;
    }
    prefixes.push(prefix);
  }
  return prefixes;
}
function commonChainPrefix(prev, next, getKeysMap2) {
  const prevPrefixes = urlPrefixes(prev.chain, prev, getKeysMap2(prev.map));
  const nextPrefixes = urlPrefixes(next.chain, next, getKeysMap2(next.map));
  const n = Math.min(prevPrefixes.length, nextPrefixes.length);
  for (let i = 0; i < n; i++) {
    if (prevPrefixes[i] !== nextPrefixes[i]) return i;
  }
  return n;
}
function buildSnapshot(navigationId, map, status, chain, params, partialParams, url, notFoundResult) {
  const frozenChain = Object.freeze([...chain]);
  const frozenParams = Object.freeze({ ...params });
  const frozenPartialParams = Object.freeze({ ...partialParams });
  const snap = {
    navigationId,
    map,
    status,
    chain: frozenChain,
    params: frozenParams,
    partialParams: frozenPartialParams,
    url,
    leaf: frozenChain.length > 0 ? frozenChain[frozenChain.length - 1] : void 0
  };
  if (status === "notFound") snap.notFoundResult = notFoundResult;
  return (
    /** @type {Snapshot} */
    Object.freeze(snap)
  );
}
function buildErrorSnapshot(navigationId, prev, type, extra, url) {
  const frozenPartialChain = Object.freeze([...extra.partialChain]);
  const frozenPartialParams = Object.freeze({ ...extra.partialParams });
  const frozenPath = extra.path ? Object.freeze([...extra.path]) : void 0;
  const error = Object.freeze({
    type,
    error: extra.error,
    attemptedUrl: extra.attemptedUrl,
    path: frozenPath,
    partialChain: frozenPartialChain,
    partialParams: frozenPartialParams
  });
  return (
    /** @type {Snapshot} */
    Object.freeze({
      navigationId,
      map: prev.map,
      status: "error",
      chain: prev.chain,
      // already frozen
      params: Object.freeze({}),
      partialParams: chainParams(prev),
      // already frozen (prev.params / prev.partialParams)
      url,
      leaf: prev.leaf,
      error
    })
  );
}

// src/transaction.js
function runTransaction(source, inputUrl, env) {
  const isInitial = source === "initial";
  const isNoopEligible = source === "navigate" || source === "replace";
  const prevSnapshot = env.getSnapshot();
  if (source !== "popstate" && !isValidRRU(inputUrl)) {
    return handleError(
      "invalid-rru",
      { attemptedUrl: inputUrl, partialChain: [], partialParams: {} },
      prevSnapshot,
      isInitial,
      env
    );
  }
  let url = normalizeRRU(inputUrl);
  if (isNoopEligible && prevSnapshot && prevSnapshot.status !== "error") {
    const current = normalizeRRU(env.adapter.read());
    if (url === current) return prevSnapshot;
  }
  const redirectPath = [];
  let depth = 0;
  let map = null;
  let chain = [];
  let params = {};
  let partialParams = {};
  let status = "matched";
  let notFoundResult;
  for (; ; ) {
    let state;
    try {
      state = env.getState();
    } catch (e) {
      throw e;
    }
    let resolved;
    try {
      resolved = env.resolveMap({ state, url });
    } catch (e) {
      return handleError(
        "resolver-throw",
        { error: e, attemptedUrl: url, partialChain: [], partialParams: {} },
        prevSnapshot,
        isInitial,
        env
      );
    }
    if (resolved instanceof Promise) {
      return handleError(
        "resolver-promise",
        { attemptedUrl: url, partialChain: [], partialParams: {} },
        prevSnapshot,
        isInitial,
        env
      );
    }
    if (resolved == null) {
      return handleError(
        "resolver-null",
        { attemptedUrl: url, partialChain: [], partialParams: {} },
        prevSnapshot,
        isInitial,
        env
      );
    }
    if (!isMap(resolved)) {
      return handleError(
        "resolver-invalid",
        { attemptedUrl: url, partialChain: [], partialParams: {} },
        prevSnapshot,
        isInitial,
        env
      );
    }
    map = resolved;
    const matchResult = map.match(url);
    if (matchResult.status === "notFound") {
      let result;
      try {
        result = matchResult.handler({
          url: matchResult.url,
          chain: matchResult.chain
        });
      } catch (e) {
        return handleError(
          "notFound-throw",
          {
            error: e,
            attemptedUrl: url,
            partialChain: matchResult.chain,
            partialParams: matchResult.partialParams
          },
          prevSnapshot,
          isInitial,
          env
        );
      }
      if (result instanceof Promise) {
        return handleError(
          "notFound-promise",
          {
            attemptedUrl: url,
            partialChain: matchResult.chain,
            partialParams: matchResult.partialParams
          },
          prevSnapshot,
          isInitial,
          env
        );
      }
      if (isRedirect(result)) {
        const target = result.url;
        if (!isValidRRU(target)) {
          return handleError(
            "invalid-rru",
            {
              attemptedUrl: target,
              partialChain: matchResult.chain,
              partialParams: matchResult.partialParams
            },
            prevSnapshot,
            isInitial,
            env
          );
        }
        const normalized = normalizeRRU(target);
        if (depth >= env.maxRedirects || redirectPath.includes(normalized)) {
          return handleError(
            "redirect-loop",
            {
              attemptedUrl: url,
              path: redirectPath,
              partialChain: matchResult.chain,
              partialParams: matchResult.partialParams
            },
            prevSnapshot,
            isInitial,
            env
          );
        }
        url = normalized;
        redirectPath.push(normalized);
        depth++;
        continue;
      }
      status = "notFound";
      chain = matchResult.chain;
      params = {};
      partialParams = matchResult.partialParams;
      notFoundResult = result;
      break;
    }
    status = "matched";
    chain = matchResult.chain;
    params = matchResult.params;
    partialParams = {};
    break;
  }
  let committedUrl;
  if (source === "navigate") {
    env.adapter.write(url, "push");
    committedUrl = normalizeRRU(env.adapter.read());
  } else {
    const current = normalizeRRU(env.adapter.read());
    if (url !== current) {
      env.adapter.write(url, "replace");
      committedUrl = normalizeRRU(env.adapter.read());
    } else {
      committedUrl = current;
    }
  }
  const navigationId = env.nextNavigationId();
  const snapshot = buildSnapshot(
    navigationId,
    /** @type {RouterMap} */
    map,
    status,
    chain,
    params,
    partialParams,
    committedUrl,
    notFoundResult
  );
  env.commitSnapshot(snapshot);
  env.setLastRedirectPath(redirectPath);
  let leaveSuffix = [];
  let enterSuffix = chain;
  let oldMap = null;
  if (prevSnapshot) {
    oldMap = prevSnapshot.map;
    const P = commonChainPrefix(prevSnapshot, snapshot, getKeysMap);
    leaveSuffix = prevSnapshot.chain.slice(P);
    enterSuffix = chain.slice(P);
  }
  const mapChanged = oldMap !== null && oldMap !== snapshot.map;
  if (mapChanged) {
    env.emit("mapWillChange", {
      oldMap: (
        /** @type {RouterMap} */
        oldMap
      ),
      newMap: snapshot.map,
      snapshot
    });
  }
  if (leaveSuffix.length > 0) {
    env.emit("beforeLeave", { suffix: leaveSuffix, snapshot });
    env.emit("afterLeave", { suffix: leaveSuffix, snapshot });
  }
  if (mapChanged) {
    env.emit("mapChanged", {
      oldMap: (
        /** @type {RouterMap} */
        oldMap
      ),
      newMap: snapshot.map,
      snapshot
    });
  }
  if (enterSuffix.length > 0) {
    env.emit("beforeEnter", { suffix: enterSuffix, snapshot });
    env.emit("afterEnter", { suffix: enterSuffix, snapshot });
  }
  env.emit("commit", { snapshot });
  return snapshot;
}
function getKeysMap(map) {
  const km = (
    /** @type {any} */
    map[kKeysMap]
  );
  return km instanceof WeakMap ? km : /* @__PURE__ */ new WeakMap();
}
function handleError(type, extra, prevSnapshot, isInitial, env) {
  if (isInitial) {
    if (extra.error !== void 0) throw extra.error;
    throw new TypeError(`initial transaction failed: ${type}`);
  }
  if (env.dev) {
    if (extra.error !== void 0) throw extra.error;
    throw new TypeError(type);
  }
  if (!prevSnapshot) {
    throw new TypeError(`error before first commit: ${type}`);
  }
  const navigationId = env.nextNavigationId();
  const url = normalizeRRU(env.adapter.read());
  const snapshot = buildErrorSnapshot(navigationId, prevSnapshot, type, extra, url);
  env.commitSnapshot(snapshot);
  env.setLastRedirectPath(extra.path ?? []);
  env.emit("navigationError", {
    type,
    error: extra.error,
    attemptedUrl: extra.attemptedUrl,
    path: extra.path,
    snapshot
  });
  env.emit("commit", { snapshot });
  return snapshot;
}

// src/router.js
function createRouter(options) {
  const HISTORY_LIMIT = 50;
  const resolveMap = options.resolveMap;
  const getState = options.getState;
  const adapter = options.adapter;
  const maxRedirects = options.maxRedirects ?? 10;
  const onListenerError = options.onListenerError;
  const dev = options.dev;
  if (typeof resolveMap !== "function") {
    throw new TypeError("createRouter: resolveMap must be a function");
  }
  if (typeof getState !== "function") {
    throw new TypeError("createRouter: getState must be a function");
  }
  if (!adapter || typeof adapter.read !== "function") {
    throw new TypeError("createRouter: adapter is required");
  }
  if (typeof maxRedirects !== "number" || maxRedirects < 0) {
    throw new TypeError("createRouter: maxRedirects must be a non-negative number");
  }
  const runtimeGlobal = globalThis;
  const isDev = dev !== void 0 ? !!dev : !(runtimeGlobal.process?.env?.NODE_ENV === "production");
  const eventBus = createEventBus(onListenerError);
  let counter = 0;
  let currentSnapshot = null;
  let lastRedirectPath;
  const historySnapshots = [];
  let inTransaction = false;
  const env = {
    getState,
    resolveMap,
    getSnapshot: () => currentSnapshot,
    commitSnapshot: (snap) => {
      currentSnapshot = snap;
      historySnapshots.push(snap);
      if (historySnapshots.length > HISTORY_LIMIT) {
        historySnapshots.shift();
      }
    },
    adapter,
    maxRedirects,
    dev: isDev,
    nextNavigationId: () => ++counter,
    emit: (event, payload) => eventBus.emit(event, payload),
    setLastRedirectPath: (path) => {
      lastRedirectPath = path.length > 0 ? path : void 0;
    }
  };
  function wrap(fn) {
    if (inTransaction) {
      if (isDev) {
        throw new TypeError("reentrancy: navigate/replace/revalidate inside transaction");
      }
      return (
        /** @type {any} */
        currentSnapshot
      );
    }
    inTransaction = true;
    try {
      return fn();
    } finally {
      inTransaction = false;
    }
  }
  function navigate(url2) {
    return wrap(() => runTransaction("navigate", url2, env));
  }
  function replace(url2) {
    return wrap(() => runTransaction("replace", url2, env));
  }
  function revalidate() {
    return wrap(() => runTransaction("revalidate", adapter.read(), env));
  }
  inTransaction = true;
  try {
    currentSnapshot = runTransaction("initial", adapter.read(), env);
  } finally {
    inTransaction = false;
  }
  adapter.listen(() => {
    if (inTransaction) return;
    inTransaction = true;
    try {
      currentSnapshot = runTransaction("popstate", adapter.read(), env);
    } finally {
      inTransaction = false;
    }
  });
  function url(name, params) {
    if (!currentSnapshot) {
      throw new TypeError("url(): no committed snapshot");
    }
    return currentSnapshot.map.url(name, params);
  }
  function isCurrent(id) {
    return currentSnapshot !== null && currentSnapshot.navigationId === id;
  }
  function getHistory() {
    return historySnapshots.slice();
  }
  function dryMatch(urlStr, opts = {}) {
    if (!isValidRRU(urlStr)) {
      throw new TypeError(`invalid-rru: ${String(urlStr)}`);
    }
    const normalized = normalizeRRU(urlStr);
    let map;
    if (opts.map) {
      map = opts.map;
    } else {
      const state = opts.state !== void 0 ? opts.state : getState();
      const resolved = resolveMap({ state, url: normalized });
      if (resolved instanceof Promise) {
        throw new TypeError("resolver-promise");
      }
      if (resolved == null) {
        throw new TypeError("resolver-null");
      }
      if (!isMap(resolved)) {
        throw new TypeError("resolver-invalid");
      }
      map = resolved;
    }
    return map.match(normalized);
  }
  function getActiveMap() {
    if (!currentSnapshot) {
      throw new TypeError("getActiveMap(): no committed snapshot");
    }
    return currentSnapshot.map;
  }
  function resolveMapFor(urlStr) {
    if (!isValidRRU(urlStr)) {
      throw new TypeError(`invalid-rru: ${String(urlStr)}`);
    }
    const normalized = normalizeRRU(urlStr);
    const resolved = resolveMap({ state: getState(), url: normalized });
    if (resolved instanceof Promise) throw new TypeError("resolver-promise");
    if (resolved == null) throw new TypeError("resolver-null");
    if (!isMap(resolved)) throw new TypeError("resolver-invalid");
    return resolved;
  }
  function getRedirectPath() {
    return lastRedirectPath;
  }
  function subscribe(listener) {
    return eventBus.on("commit", ({ snapshot }) => listener(snapshot));
  }
  const router = {
    adapter,
    navigate,
    replace,
    revalidate,
    back() {
      if (typeof history !== "undefined") history.back();
    },
    forward() {
      if (typeof history !== "undefined") history.forward();
    },
    url,
    getSnapshot() {
      return (
        /** @type {Snapshot} */
        currentSnapshot
      );
    },
    getState,
    isCurrent,
    subscribe,
    on: eventBus.on,
    off: eventBus.off,
    once: eventBus.once,
    getHistory,
    dryMatch,
    getActiveMap,
    resolveMapFor,
    getRedirectPath
  };
  Object.defineProperty(router, ROUTER_BRAND, { value: true });
  Object.defineProperty(router, Symbol.toStringTag, { value: "Router" });
  Object.freeze(router);
  if (isDev) {
    const hook = (
      /** @type {any} */
      globalThis.__SUPERCAT_ROUTER_DEVTOOLS__
    );
    if (hook && typeof hook.register === "function") {
      try {
        hook.register(router);
      } catch {
      }
    }
  }
  return router;
}
function isRouter(x) {
  return x !== null && typeof x === "object" && /** @type {any} */
  x[ROUTER_BRAND] === true;
}
export {
  MapValidationError,
  createMap,
  createRouter,
  file,
  folder,
  hasRoute,
  isFile,
  isFolder,
  isMap,
  isRedirect,
  isRouter,
  normalizeRRU,
  redirect
};
