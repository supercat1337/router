# Vue integration

`@supercat1337/router` is framework-agnostic. `router.subscribe` maps directly to Vue's `shallowRef` + lifecycle.

## `useRouterSnapshot`

```js
import { shallowRef, onMounted, onUnmounted } from 'vue';

export function useRouterSnapshot(router) {
    const snapshot = shallowRef(router.getSnapshot());
    let unsub = () => {};

    onMounted(() => {
        unsub = router.subscribe(s => {
            snapshot.value = s;
        });
    });
    onUnmounted(() => unsub());

    return snapshot;
}
```

`shallowRef` is preferred over `ref` — `Snapshot` is deeply frozen, and `ref` would try to make it reactive (a wasted deep walk on every commit).

## `<App>`

```vue
<script setup>
import { isFile } from '@supercat1337/router';
import { useRouterSnapshot } from './use-router-snapshot.js';

const props = defineProps({ router: Object });
const snapshot = useRouterSnapshot(props.router);
</script>

<template>
    <NotFound v-if="snapshot.status === 'notFound'" :result="snapshot.notFoundResult" />
    <ErrorView v-else-if="snapshot.status === 'error'" :error="snapshot.error" />
    <component v-else :is="viewFor(snapshot.leaf)" v-bind="snapshot.params" />
</template>
```

## `<RouterLink>`

Same as React — `attachLinks` intercepts clicks on any `[data-router-link]`. A component is optional:

```vue
<script setup>
const props = defineProps({
    href: { type: String, required: true }, // RRU — use router.url(...)
    replace: { type: Boolean, default: false },
});
</script>

<template>
    <a :href="href" :data-router-link="replace ? 'replace' : ''">
        <slot />
    </a>
</template>
```

Usage:

```vue
<RouterLink :href="router.url('userHome', { id: '5' })">Profile</RouterLink>
```

`router.url` narrows `name` to `RouteNameOf<R>` — typos are compile errors.

## Reactive params / search

```js
export function useParams(router) {
    return computed(() => useRouterSnapshot(router).value.params);
}

export function useSearch(router) {
    return computed(() => useRouterSnapshot(router).value.search);
}
```

`params` / `search` are read-only `Record<string, string>` — one object per snapshot, no per-route schema.

## `<RouterView>` (nested layouts)

```vue
<script setup>
import { computed } from 'vue';
import { isFile } from '@supercat1337/router';

const props = defineProps({ router: Object, snapshot: Object });
const layoutName = computed(() => {
    const leaf = props.snapshot.leaf;
    return isFile(leaf) ? (leaf.layout ?? 'main') : 'main';
});
</script>

<template>
    <component :is="layouts[layoutName]" :snapshot="snapshot" />
</template>
```

`layout` is app-owned metadata on `file({ name, layout: 'dashboard' })`. See [Nested layout](nested-layout.md).

## Devtools

Mount `__SUPERCAT_ROUTER_DEVTOOLS__` **before** `createRouter`:

```js
globalThis.__SUPERCAT_ROUTER_DEVTOOLS__ = {
    register(router) {
        devtoolsPanel.attach(router);
    },
};
```

See [Devtools](devtools.md).

## Don't

- **Don't** use `ref` instead of `shallowRef` for `snapshot` — the snapshot is frozen, deep reactivity is wasted work.
- **Don't** `await` `router.navigate` / `router.replace` — they're synchronous. Use `nav.navigate` / `nav.replace` (async) when guards are involved.
- **Don't** stitch together `afterEnter` / `afterLeave` / `mapChanged` / `navigationError` — use `subscribe`.
- **Don't** use `snapshot.navigationId` as a component `key` — use `url` / `params` / `leaf.name`.

## See also

- [React integration](react.md) — same glue, `useSyncExternalStore`.
- [Data loading](data-loading.md) — `isCurrent` pattern.
