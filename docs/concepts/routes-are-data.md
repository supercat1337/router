# Routes are data

`file` and `folder` construct branded, frozen nodes. Keys are URL-segment patterns:

| Key                                 | Meaning                                                 |
| :---------------------------------- | :------------------------------------------------------ |
| `[A-Za-z0-9._~-]+` (not `.` / `..`) | literal segment                                         |
| `:name`                             | parameter (name matches `[a-zA-Z_][a-zA-Z0-9_]*`)       |
| `*`                                 | wildcard — must be a `file`, catches remaining segments |
| `index`                             | the folder's own URL — must be a `file`                 |

Only one `:name` key per level.

## Example

```js
import { createMap, file, folder } from '@supercat1337/router';

const map = createMap(
    {
        login: file({ name: 'login' }),

        // Admin — local 404 for unknown admin URLs.
        admin: folder(
            {
                index: file({ name: 'adminHome' }), // /admin
                users: folder({
                    index: file({ name: 'adminUsers' }), // /admin/users
                    ':id': file({ name: 'adminUser' }), // /admin/users/:id
                }),
                reports: folder({
                    ':year': file({ name: 'adminReport' }), // /admin/reports/:year
                }),
            },
            { notFound: () => ({ view: 'adminNotFound' }) }
        ),

        // Account — no local notFound, inherits map.notFound.
        account: folder({
            profile: file({ name: 'accountProfile' }), // /account/profile
            settings: file({ name: 'accountSettings' }), // /account/settings
        }),
    },
    { notFound: () => ({ view: '404' }) }
);
```

`folder(children, options?)` — content first, matching `createMap(data, options)` and `attachLinks(router, options)`. `options.notFound` is optional; when omitted, the nearest ancestor with a `notFound` handles the miss, up to `map.notFound`.

Three fallback behaviors are visible side by side:

- `/admin/users/xyz` → `adminNotFound` (local override on `admin`; `users` inherits from `admin`);
- `/account/xyz` → `404` (inherited from `map.notFound`; `account` has no local `notFound`);
- `/xyz` → `404` (root).

`users`, `reports`, and `account` pass **no** second argument — `folder({ ... })` is enough. Only `admin` needs a local `notFound`, so only `admin` has options.

## Invariants

`createMap` enforces tree-wide invariants and throws `MapValidationError`:

| Code                   | Meaning                                                  |
| :--------------------- | :------------------------------------------------------- |
| `data-not-object`      | data is not a plain object                               |
| `data-key-invalid`     | top-level key is not a valid segment pattern             |
| `index-at-root`        | `index` key at the top level (only folders have `index`) |
| `notFound-missing`     | `options.notFound` is `undefined`                        |
| `notFound-invalid`     | `options.notFound` is not a function                     |
| `name-duplicate`       | the same `file({ name })` appears twice                  |
| `node-not-constructed` | a value is not a `file` / `folder` brand                 |

`folder` enforces subtree-shape invariants and throws `TypeError`:

- `children` non-empty, plain object;
- keys valid (see table above);
- `*` and `index` children are files;
- at most one `:name` key per level;
- `options.notFound` (if provided) is a synchronous function.

## Fallback rules

When `map.match(url)` finds no leaf, the handler is chosen from the **nearest** folder with a `notFound` on the partial chain, up to `map.notFound`.

```js
const map = createMap(
    {
        admin: folder(
            { users: folder({ ':id': file({ name: 'u' }) }) },
            { notFound: () => 'admin' } // nearest
        ),
    },
    { notFound: () => 'root' } // fallback
);

map.match('/admin/missing'); // → handler = admin.notFound
map.match('/outside'); // → handler = map.notFound
```

## See also

- [Independent maps](independent-maps.md) — how multiple maps coexist.
- [`hasRoute` in AGENTS.md](../../AGENTS.md) — validate route names from data.
- [`MapValidationError` codes in AGENTS.md](../../AGENTS.md).
