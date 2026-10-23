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
export {
  attachLinks
};
