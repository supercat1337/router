---
'@supercat1337/router': minor
---

Allow `index` at the root — it matches `/`.

Before, `createMap({ index: file({ name: 'home' }) }, ...)` threw
`MapValidationError('index-at-root')`. This made it impossible to define
a home page at `/` without a workaround (HTTP redirect, or rendering
home content inside `notFound` — both semantically wrong). After this
change:

```js
const map = createMap(
    { index: file({ name: 'home' }), about: file({ name: 'about' }) },
    { notFound }
);
map.match('/'); // matched, leaf = home
map.url('home'); // '/'
```

**Breaking-ish:** `MapValidationErrorCode` no longer includes
`'index-at-root'`. Code that caught this error (unlikely — it only fired
when passing root `index`, which was forbidden) will fail to compile.
Code that passed `{ index: file(...) }` at root — previously threw, now
succeeds.

**New check:** `index` must be a file. A folder under `index` — at any
level — throws `MapValidationError('index-not-file')`. This mirrors the
existing `folder()` validation, which previously only ran for nested
folders (root data was skipped).

`getChainPrefixes` for a matched root `index` returns `['/']` (was `['']`
before the fix — an internal edge case that had no caller until root
`index` was allowed).
