# Recipes

Task-oriented. Skip around.

## Navigation patterns

- [Protected route](protected-route.md) — guard layer + `createGuardedRouter`
- [Preload before navigate](preload-before-navigate.md) — blocking loader in guards
- [Nested layout](nested-layout.md) — walk `snapshot.chain`, render layout by `leaf.layout`

## Data & code loading

- [Data loading with loading / error UI](data-loading.md) — `afterEnter` + `isCurrent`
- [Code splitting](code-splitting.md) — `file({ load })` + `afterEnter`
- [Validating route names from data](validating-route-names.md) — `hasRoute` at load time

## Rendering

- [Custom 404 render](custom-404.md)
- [React integration](react.md)
- [Vue integration](vue.md)

## Tooling

- [Devtools](devtools.md) — `__SUPERCAT_ROUTER_DEVTOOLS__` hook

## See also

- [Concepts](../concepts/README.md) — the mental model.
- [API reference](../api/README.md) — module reference.
- [AGENTS.md](../../AGENTS.md) — Do / Don't for AI assistants.
