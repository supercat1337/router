# Nested layout

`layout` is app-owned metadata on `file()`. Pass it through, render it yourself by walking `snapshot.chain`:

```js
const map = createMap(
    {
        dashboard: folder({
            index: file({ name: 'dashboardHome', layout: 'dashboard' }),
            settings: file({ name: 'dashboardSettings', layout: 'dashboard' }),
        }),
        login: file({ name: 'login' }), // no layout → default
    },
    { notFound: () => ({ view: '404' }) }
);

const layouts = {
    main: renderMainLayout,
    dashboard: renderDashboardLayout,
};

function render(snapshot) {
    if (snapshot.status === 'notFound') {
        return render404(snapshot.notFoundResult);
    }
    const layoutName = snapshot.leaf?.layout ?? 'main';
    const layout = layouts[layoutName] ?? layouts.main;
    return layout(snapshot);
}
```

`snapshot.leaf` is the current route's file node. It can be `undefined` for `notFound` / `error` with an empty chain — `?? 'main'` gives you the default.

## Multi-level layouts

If layouts nest (`app > dashboard > settings`), walk `snapshot.chain` and compose:

```js
function render(snapshot) {
    // chain = [dashboardFolder, settingsFile]
    const layoutNames = snapshot.chain
        .map(node => (isFile(node) ? node.layout : node.layout))
        .filter(Boolean);

    let content = renderLeaf(snapshot.leaf, snapshot.params);
    for (const name of layoutNames.reverse()) {
        content = layouts[name](content);
    }
    return content;
}
```

Both folders and files can carry `layout` metadata — the choice is yours.

## Layout from parent folder

If the layout is determined by the **parent folder** (e.g. all `/admin/*` share a layout), read the folder's `layout`:

```js
const map = createMap(
    {
        admin: folder(
            { index: file({ name: 'adminHome' }), users: file({ name: 'adminUsers' }) },
            { layout: 'admin' }
        ),
    },
    { notFound }
);

// In render:
const adminFolder = snapshot.chain.find(n => isFolder(n) && n.layout === 'admin');
```

`folder` accepts arbitrary options (they pass through unchanged), so `layout` works there too.

## Don't

- **Don't** use `snapshot.leaf.layout` if `leaf` can be `undefined` — guard with `?.` or `isFile`.
- **Don't** infer layout from URL prefix — `snapshot.chain` is authoritative.
- **Don't** rely on layout for route params — `params` are already flattened.

## See also

- [Routes are data](../concepts/routes-are-data.md) — folders and files.
- [React integration](react.md) / [Vue integration](vue.md) — `<Outlet>` equivalents.
