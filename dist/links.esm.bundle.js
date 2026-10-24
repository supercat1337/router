// src/links.js
var SELECTOR = "[data-router-link]";
function attachLinks(router, options = {}) {
  if (typeof document === "undefined" || !document.addEventListener) {
    return () => {
    };
  }
  function onClick(e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = (
      /** @type {EventTarget | null} */
      e.target
    );
    if (!target || typeof /** @type {any} */
    target.closest !== "function") {
      return;
    }
    const el = (
      /** @type {Element | null} */
      /** @type {any} */
      target.closest(SELECTOR)
    );
    if (!el) return;
    const tgt = el.getAttribute("target");
    if (tgt && tgt !== "_self") return;
    if (el.hasAttribute("download")) return;
    const href = el.getAttribute("href");
    if (!href) return;
    const rru = router.adapter.normalize(href);
    if (rru === null) return;
    e.preventDefault();
    const raw = (
      /** @type {any} */
      el.dataset?.routerLink
    );
    const mode = raw === "replace" ? "replace" : "navigate";
    const fn = options[mode] || router[mode];
    fn(rru);
  }
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
function attachPreload(router, options = {}) {
  if (typeof document === "undefined" || !document.addEventListener) {
    return () => {
    };
  }
  const preload = options.preload ?? defaultPreload;
  const seen = /* @__PURE__ */ new WeakSet();
  async function onIntent(e) {
    const target = (
      /** @type {EventTarget | null} */
      e.target
    );
    if (!target || typeof /** @type {any} */
    target.closest !== "function") {
      return;
    }
    const el = (
      /** @type {Element | null} */
      /** @type {any} */
      target.closest(SELECTOR)
    );
    if (!el) return;
    if (seen.has(el)) return;
    seen.add(el);
    const href = el.getAttribute("href");
    if (!href) return;
    const rru = router.adapter.normalize(href);
    if (rru === null) return;
    const match = router.getSnapshot().map.match(rru);
    if (match.status !== "matched") return;
    const chain = match.chain;
    const leaf = chain.length > 0 ? chain[chain.length - 1] : void 0;
    if (!leaf) return;
    try {
      await preload(leaf);
    } catch {
    }
  }
  document.addEventListener("pointerenter", onIntent, true);
  document.addEventListener("focusin", onIntent);
  return () => {
    document.removeEventListener("pointerenter", onIntent, true);
    document.removeEventListener("focusin", onIntent);
  };
}
function defaultPreload(leaf) {
  const meta = (
    /** @type {any} */
    leaf
  );
  if (typeof meta.preload === "function") return meta.preload();
  if (typeof meta.load === "function") return meta.load();
  return void 0;
}
export {
  attachLinks,
  attachPreload
};
