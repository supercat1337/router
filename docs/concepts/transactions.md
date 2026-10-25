# Transactions are synchronous

`navigate`, `replace`, `popstate`, `revalidate`, and `initial` all run the same LOOP:

```
getState → resolveMap → match → notFound → redirects
  → history.write → snapshot.commit → events
```

No `await`, no promises. Every transaction is atomic.

## What this means in practice

- **`navigate()` returns a `Snapshot`** — you have the committed state immediately after the call returns.
- **Events fire after commit** — every listener sees the same, already-frozen snapshot.
- **No interleaving** — a `popstate` triggered during a transaction is suppressed (see `tests/transaction-edge.test.js`).
- **Reentrancy is caught** — calling `navigate()` from inside an event listener is a contract violation. In dev it throws; in prod it returns the current snapshot and emits nothing.

## Contract violations

The core is synchronous, but async can leak in two ways:

| Violation                                  | Diagnosed as       |
| :----------------------------------------- | :----------------- |
| `resolveMap` returns a `Promise`           | `resolver-promise` |
| `resolveMap` returns `null`                | `resolver-null`    |
| `resolveMap` returns something not `isMap` | `resolver-invalid` |
| `resolveMap` throws                        | `resolver-throw`   |
| `notFound` returns a `Promise`             | `notFound-promise` |
| `notFound` throws                          | `notFound-throw`   |

Behavior differs by mode:

- **dev** — the error is **thrown** from `navigate()` / `replace()` / `revalidate()`, and from `createRouter()` for the initial transaction;
- **prod** — an error snapshot is committed with `status: 'error'`, `navigationError` is emitted, `subscribe` fires;
- **initial transaction** — always throws, in both modes. Bootstrap cannot continue with a broken map.

Uncategorized errors (`getState` throws, `adapter.write` throws) propagate; no snapshot, no event, no `navigationId` increment.

## Where async belongs

Two explicit boundaries — nothing else:

- **Data loading** → `afterEnter` (optimistic: commit the URL, render a skeleton, load data, render content). See [data loading](../recipes/data-loading.md).
- **Pre-navigation checks** → guard layer (blocking loaders, permission checks). See [preload before navigate](../recipes/preload-before-navigate.md) and [protected route](../recipes/protected-route.md).

Do **not** add blocking loaders to the core. `popstate` + `await` + rollback is a known source of double-navigation bugs in async routers; keeping the core synchronous is the whole point.

## See also

- [Snapshots, `navigationId`, `navigationType`](snapshots.md) — what comes out of a transaction.
- [`NavigationErrorType` in AGENTS.md](../../AGENTS.md) — the full diagnostic list.
