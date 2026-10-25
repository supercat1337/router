# Custom 404 render

`notFoundResult` is whatever your `notFound` handler returned. Render it however you like.

## Per-map `notFound`

```js
const map = createMap(routes, {
    notFound: ({ url, chain }) => ({
        view: '404',
        attemptedUrl: url,
        partialChain: chain,
    }),
});

router.on('afterEnter', ({ snapshot }) => {
    if (snapshot.status === 'notFound') {
        renderView(snapshot.notFoundResult);
    }
});
```

`NotFoundContext` gives you:

```ts
export interface NotFoundContext {
    readonly url: string; // RRU that failed
    readonly chain: readonly Node[]; // partial chain (may be empty)
    readonly search: Readonly<Record<string, string>>; // decoded query
    readonly partialParams: Readonly<Record<string, string>>; // params along chain
}
```

## Per-subtree `notFound`

A folder can override `notFound` for its subtree:

```js
const map = createMap(
    {
        admin: folder(
            { users: folder({ ':id': file({ name: 'u' }) }) },
            { notFound: ({ url }) => ({ view: 'admin404', url }) }
        ),
    },
    { notFound: () => ({ view: '404' }) }
);

map.match('/admin/missing').handler; // → admin's notFound
map.match('/outside').handler; // → map's notFound
```

The nearest folder with `notFound` on the partial chain wins, up to `map.notFound`.

## Redirect instead of render

`notFound` can return `redirect('/x')` — a special branded object the transaction loop recognises:

```js
import { redirect } from '@supercat1337/router';

const map = createMap(routes, {
    notFound: ({ url }) => {
        if (url.startsWith('/old/')) return redirect(url.replace('/old/', '/new/'));
        return { view: '404' };
    },
});
```

- **Cycle detection:** the transaction tracks `redirectPath` and diagnoses a loop as `redirect-loop`.
- **`maxRedirects`** (default 10) limits the chain.
- **Do not** return `{ url: '/new' }` — that's a render value, not a redirect. Use `redirect('/new')`.

## Don't

- **Don't** return a `Promise` from `notFound` — sync core. Diagnosed as `notFound-promise`.
- **Don't** call `router.navigate` / `router.replace` from inside `notFound` — the transaction loop already handles redirects via `redirect()`. Calling navigate is reentrancy.
- **Don't** throw from `notFound` — diagnosed as `notFound-throw` (prod: error snapshot; dev: re-thrown).
- **Don't** return `{ url }` for redirects — use `redirect(url)`.

## See also

- [Routes are data](../concepts/routes-are-data.md) — fallback rules.
- [`redirect` in AGENTS.md](../../AGENTS.md).
- [Transactions are synchronous](../concepts/transactions.md) — the redirect loop.
