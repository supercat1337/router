// src/active-links.js
var SELECTOR = "[data-router-link]";
function attachActiveLinks(router, options = {}) {
  if (typeof document === "undefined" || !document.querySelectorAll) {
    return () => {
    };
  }
  const ariaCurrent = options.ariaCurrent ?? "page";
  if (ariaCurrent === false) {
    return () => {
    };
  }
  const currentValue = ariaCurrent === true ? "true" : String(ariaCurrent);
  const touched = /* @__PURE__ */ new WeakSet();
  function apply(snapshot) {
    const targetUrl = snapshot.url;
    const els = document.querySelectorAll(SELECTOR);
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const href = el.getAttribute("href");
      const rru = href ? router.adapter.normalize(href) : null;
      const isActive = rru !== null && rru === targetUrl;
      if (isActive) {
        el.setAttribute("aria-current", currentValue);
        touched.add(el);
      } else if (touched.has(el)) {
        el.removeAttribute("aria-current");
        touched.delete(el);
      }
    }
  }
  apply(router.getSnapshot());
  const unsubscribe = router.subscribe(apply);
  return () => {
    unsubscribe();
    const els = document.querySelectorAll(SELECTOR);
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (touched.has(el)) {
        el.removeAttribute("aria-current");
      }
    }
  };
}
export {
  attachActiveLinks
};
