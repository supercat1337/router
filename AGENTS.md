# `AGENTS.md` — function guide for AI assistants

> **What this file is.** A function-by-function reference for AI assistants generating code **that uses** `@supercat1337/router`. Not a tutorial (that's `README.md`), not a guide to editing the source (that's `AGENTS.internal.md` on GitHub).
>
> **Version.** Verified against `@supercat1337/router@0.1.0`. If you're using a newer version, check `dist/types.d.ts`.
>
> **How to use it.** Copy into your project root, or paste the relevant section into the assistant's context.

---

## Before writing any code

Five facts that cover 90% of correctness:

1. **The core is synchronous.** `resolveMap` and `notFound` must not return Promises. A Promise is a contract violation (`resolver-promise` / `notFound-promise`).
2. **Navigation is atomic.** `router.navigate('/x')` returns a `Snapshot` synchronously. Events fire after commit. There is no `await` between the call and the last event.
3. **URLs are Router-relative (RRU).** `Snapshot.url` starts with `/`, has no `#`. Browser URLs live only inside the adapter.
4. **Maps are independent.** No cross-map features, no global route registry. Context switching = `resolveMap` returns a different map.
5. **Public API only.** `getHistory`, `dryMatch`, `getActiveMap`, `resolveMapFor`, `getRedirectPath` are `@internal` — stripped from `dist/types.d.ts`. Do not use them in application code.

---

## API reference

### Constructors

#### `file(meta) → FileNode`

Creates a frozen, branded leaf node. `name` is required and must be unique across the map (enforced by `createMap`). Extra fields pass through unchanged.

```js
const home = file({ name: 'home', title: 'Home', layout: 'main' });
```

- **Do not** construct leaves by hand — `isFile` will fail.
- **Do not** reuse a `name` — throws `MapValidationError` with code `name-duplicate`.

#### `folder(options, children) → FolderNode`

Creates a frozen, branded interior node. `options.notFound` is optional; when omitted, the nearest ancestor with `notFound` handles the miss, up to `map.notFound`.

```js
const admin = folder(
    { notFound: () => ({ view: 'adminNF' }) },
    {
        index: file({ name: 'adminHome' }), // /admin
        users: folder(
            {},
            {
                ':id': file({ name: 'adminUser' }), // /admin/users/:id
            }
        ),
    }
);
```

- **Key rules:** `index` and `*` must be files; only one `:name` per level; children must be non-empty.
- **Do not** call `folder` with an empty `children` object — throws `TypeError`.

#### `redirect(url) → RedirectResult`

Branded redirect result. Return from a `notFound` handler or a guard to signal "don't commit this URL; go here instead".

```js
const map = createMap(routes, {
    notFound: ({ url }) => (url.startsWith('/old') ? redirect('/new') : { view: '404' }),
});
```

- **Do not** return `{ url: '/new' }` from `notFound` — that's a render value, not a redirect. Use `redirect('/new')`.
- `isRedirect(result)` is the only supported way to detect one.

---

### Map

#### `createMap(data, options) → RouterMap`

Validates tree-wide invariants and returns a frozen `RouterMap`. `options.notFound` is **mandatory**.

```js
const map = createMap(
    {
        login: file({ name: 'login' }),
        admin: folder({}, { index: file({ name: 'adminHome' }) }),
    },
    { notFound: () => ({ view: '404' }) }
);
```

Returned `RouterMap`:

| Member               | Signature         | Purpose                                                                                                 |
| :------------------- | :---------------- | :------------------------------------------------------------------------------------------------------ |
| `notFound`           | `NotFoundHandler` | Fallback handler (read-only)                                                                            |
| `url(name, params?)` | `→ string`        | Build canonical RRU for a named route. Throws `TypeError` if the name is unknown or a param is missing. |
| `match(url)`         | `→ MatchResult`   | Match a **normalized** RRU. Returns a discriminated union `matched \| notFound`.                        |

- **Do not** call `map.match(url)` with a Browser URL — pass an RRU (or `normalizeRRU(url)` first).
- **Do not** mutate the returned map — it's frozen.

#### `isMap(x) → boolean`

Brand check. The **only** supported way to detect a `RouterMap`. `instanceof` will not work.

#### `MapValidationError`

Thrown by `createMap` for tree-wide invariant violations. Has `code: MapValidationErrorCode` and `path: string`.

```js
try {
    createMap({ login: 'nope' }, { notFound });
} catch (e) {
    if (e instanceof MapValidationError) console.error(e.code, e.path);
}
```

Codes: `data-not-object`, `data-key-invalid`, `index-at-root`, `notFound-missing`, `notFound-invalid`, `name-duplicate`, `node-not-constructed`.

---

### Router

#### `createRouter(options) → Router`

Creates a router and runs the initial transaction. **Throws** if the initial transaction fails (invalid RRU, async resolver, missing map, redirect loop, etc.).

```js
const router = createRouter({
    resolveMap: ({ state }) => (state.isAuthed ? userMap : guestMap),
    getState: () => appState,
    adapter: createPathAdapter({ base: '/app/' }),
});
```

Options:

| Option            | Required | Notes                                     |
| :---------------- | :------: | :---------------------------------------- |
| `resolveMap`      |    ✅    | `(ctx) => RouterMap`. **Synchronous.**    |
| `getState`        |    ✅    | `() => any`. Called once per transaction. |
| `adapter`         |    ✅    | `UrlAdapter`. See adapters below.         |
| `maxRedirects`    |    —     | Default 10                                |
| `onListenerError` |    —     | `(err, { event, snapshot }) => void`      |
| `dev`             |    —     | Default: `NODE_ENV !== 'production'`      |

Returned `Router`:

| Method                 | Signature      | Purpose                                                  |
| :--------------------- | :------------- | :------------------------------------------------------- |
| `navigate(url)`        | `→ Snapshot`   | New transaction, history push                            |
| `replace(url)`         | `→ Snapshot`   | New transaction, history replace                         |
| `revalidate()`         | `→ Snapshot`   | Recompute current RRU (always increments `navigationId`) |
| `back()` / `forward()` | `→ void`       | Delegate to `history.back()` / `forward()`               |
| `url(name, params?)`   | `→ string`     | Delegates to the active map's `url`                      |
| `getSnapshot()`        | `→ Snapshot`   | Last committed snapshot                                  |
| `getState()`           | `→ any`        | The `getState` passed to `createRouter`                  |
| `isCurrent(id)`        | `→ boolean`    | `getSnapshot().navigationId === id`                      |
| `on(event, fn)`        | `→ () => void` | Subscribe. Returns an idempotent unsubscribe.            |
| `off(event, fn)`       | `→ void`       | Remove listener                                          |
| `once(event, fn)`      | `→ () => void` | Single-fire subscription                                 |

- **Do not** `await` `navigate` / `replace` / `revalidate` — they are synchronous.
- **Do not** pass Browser URLs to `navigate` / `replace` — pass RRUs (`/x`, not `https://host/x`).
- **Do not** use `navigationId` as a component key — compare `url` / `params` instead.
- **Do not** call `navigate` / `replace` / `revalidate` from inside a listener or a guard's synchronous frame — that's `reentrancy`, diagnosed (throw in dev, current snapshot in prod).

---

### Type guards

| Function        | Signature   | Purpose                          |
| :-------------- | :---------- | :------------------------------- |
| `isFile(x)`     | `→ boolean` | Brand check for `FileNode`       |
| `isFolder(x)`   | `→ boolean` | Brand check for `FolderNode`     |
| `isRedirect(x)` | `→ boolean` | Brand check for `RedirectResult` |

**Do not** replace these with structural checks (`'name' in x`) or `instanceof` — brands are identity checks against a private `Symbol`, and structural lookalikes will pass falsely.

---

### Normalization

#### `normalizeRRU(url) → string`

The single normalization used everywhere. Idempotent. Strips **all** trailing slashes except for root `/`. Does not percent-decode, does not normalize case.

```js
normalizeRRU('/users/5//'); // → '/users/5'
normalizeRRU('/'); // → '/'
```

- **Do not** use `new URL(...)` for this — it returns a Browser URL, not an RRU.
- **Do not** apply to Browser URLs — the adapter already does BU→RRU conversion.

---

### Adapters

#### `createPathAdapter({ base }) → UrlAdapter`

History API mode. `base` is the app's mount pathname prefix (must end with `/`).

```js
const adapter = createPathAdapter({ base: '/app/' });
```

- **`base` is required** unless a `<base href>` with a trailing slash is in the document. Auto-deriving from `location.pathname` is refused (`TypeError`) — it gives the wrong base on deep links.
- **SSR:** `read()` returns `'/'`; `write` / `listen` are no-ops. Still needs explicit `base`.

#### `createHashAdapter({ base? }) → UrlAdapter`

Hash mode (`#/users/5`). Default `base = location.pathname`.

- **SSR:** explicit `base` is required (`TypeError` otherwise).
- **In-page anchors** (`#section`) in hash mode are not supported via `href` — use `scrollIntoView` after `afterEnter`.

---

### Links

#### `attachLinks(router, options?) → () => void`

Single delegated click listener on `document` for `[data-router-link]` elements. Opt-in; no-op outside the browser.

```html
<a href="/profile" data-router-link>Profile</a>
<a href="/profile" data-router-link="replace">Profile</a>
```

```js
const detach = attachLinks(router);
// or, when using a guard layer:
attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

- **Selector is fixed** (`[data-router-link]`). Do not invent a custom attribute.
- `navigate` / `replace` overrides receive an **RRU**, not the raw `href` — `attachLinks` normalizes before calling them.

---

### Guard layer

#### `createGuardLayer(options) → GuardLayer`

Optional async pre-navigation checks. Runs _outside_ the transaction, over a proposal. The core stays synchronous.

```js
const guard = createGuardLayer({
    guards: [
        async ({ url, from, signal }) => {
            if (!url.startsWith('/admin')) return 'allow';
            // ... use signal for cancellation
            return 'allow';
        },
    ],
});
```

Options: `guards` (required, array), `maxRedirects` (default 10), `onError` (`GuardErrorType` hook), `dev`.

Returned `GuardLayer`:

| Method                 | Signature                  | Purpose                                                    |
| :--------------------- | :------------------------- | :--------------------------------------------------------- |
| `wrapAdapter(adapter)` | `→ UrlAdapter`             | Wrap a base adapter. **Only** integration into the core.   |
| `bind(router)`         | `→ void`                   | Bind to a router. Must be called before `navigate()`.      |
| `navigate()`           | `→ { navigate, replace }`  | Build the guarded pair. Each returns `Promise<NavResult>`. |
| `pending()`            | `→ { url, since } \| null` | Current in-flight guard state.                             |

**Wiring order is mandatory** — do not reorder:

```js
const guard = createGuardLayer({ guards });
const adapter = guard.wrapAdapter(createPathAdapter({ base: '/app/' }));
const router = createRouter({ resolveMap, getState, adapter });
guard.bind(router); // 1
const nav = guard.navigate(); // 2
attachLinks(router, { navigate: nav.navigate, replace: nav.replace }); // 3
```

`NavResult` is `{ status: 'committed'; snapshot: Snapshot } | { status: 'blocked' }`.

- **Do not** connect the guard layer on the server (SSR). Access control is on the server; guards are a client-side UX filter.
- **Do not** call `nav.navigate` / `nav.replace` from inside a guard's synchronous frame — that's `reentrancy`.

---

## Common mistakes — Do / Don't

```js
// ✅ Sync resolver, multiple maps
const resolveMap = ({ state }) => state.isAuthed ? userMap : guestMap;

// ❌ Async resolver — diagnosed as resolver-promise
const resolveMap = async ({ state }) => userMap;

// ✅ Async data loading in afterEnter, with isCurrent
router.on('afterEnter', async ({ snapshot }) => {
    const id = snapshot.navigationId;
    const data = await loadData(snapshot);
    if (!router.isCurrent(id)) return;
    render(snapshot, data);
});

// ❌ Hooks from framework routers — do not exist
const { id } = useParams();

// ❌ Awaiting navigate — navigate is sync
const snap = await router.navigate('/x');

// ❌ Cross-map features — do not exist by design
router.crossMapRedirect('/admin', '/login');

// ❌ Browser URL to navigate — must be RRU
router.navigate('https://example.com/x');
router.navigate('/x'); // ✓

// ❌ navigationId as component key — use url/params instead
key={snapshot.navigationId}

// ❌ Dev-only methods in application code
router.getHistory();
```

---

## When the user asks for something the library doesn't support

State the non-goal and propose the intended workaround. **Do not invent an API.**

| User asks for                    | Doesn't have          | Correct answer                                                     |
| :------------------------------- | :-------------------- | :----------------------------------------------------------------- |
| `useParams()` hook               | No hooks              | `snapshot.params` + framework glue (`README.md#react-integration`) |
| `<Link to="/x">` component       | No components         | `attachLinks(router)` + `<a data-router-link>`                     |
| Blocking loaders                 | Sync core, no `await` | `afterEnter` + optimistic UI                                       |
| Built-in code splitting          | Not in core           | User-side `import()` in `afterEnter`, or TanStack Router           |
| Built-in cache with invalidation | Not in core           | `@supercat1337/persist-core` + user-side loader                    |
| Scroll restoration               | Not in core           | `afterEnter` + `window.scrollTo`                                   |
| Cross-map redirect               | Not by design         | Different map via `resolveMap`, or guard layer                     |
| Global route registry            | Not by design         | Multiple maps + `resolveMap`                                       |

For the top half of this table, the honest recommendation is often: **"if you need this in the core, use TanStack Router (React) or Vue Router (Vue) instead."** Suggesting a different router is the correct answer, not a failure.

---

## Checklist before returning generated code

- [ ] No `async` / `await` inside `resolveMap` or `notFound`.
- [ ] `navigate` / `replace` arguments are RRUs (`/x`, no `#`), not Browser URLs.
- [ ] Data loading is in `afterEnter` with `router.isCurrent(id)` check.
- [ ] No `getHistory` / `dryMatch` / `getActiveMap` / `resolveMapFor` / `getRedirectPath`.
- [ ] Guard wiring order is `wrapAdapter` → `createRouter` → `bind` → `navigate()` → `attachLinks`.

---

## See also

- `README.md` — tutorial, core concepts, recipes, comparison with other routers.
- `dist/types.d.ts` — the authoritative public API surface.
