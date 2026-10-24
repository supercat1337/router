// @ts-check

import { createMap, createRouter, file, folder, isFile } from '../src/index.js';
import type { RouterMap, Snapshot, UrlAdapter } from '../src/index.js';

// =============================================================================
// helpers
// =============================================================================

/**
 * Robust structural equality check (works for unions, intersections,
 * narrow literals). Standard pattern; no runtime, only `true`/`false`.
 */
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Fails the build if `T` is not `true`. */
type Expect<T extends true> = T;

declare const nf: (ctx: { url: string; chain: readonly unknown[] }) => unknown;
declare const adapter: UrlAdapter;

// =============================================================================
// RouteNames: flat map — const type parameter preserves literals
// =============================================================================

const flat = createMap(
    {
        login: file({ name: 'login' }),
        profile: file({ name: 'profile' }),
    },
    { notFound: nf }
);

type _FlatName = Expect<Equal<Parameters<typeof flat.url>[0], 'login' | 'profile'>>;

// Positive: known route names complete.
flat.url('login');
flat.url('profile');

// Negative: typo must be a compile error.
// @ts-expect-error — 'typo' is not a route name in this map
flat.url('typo');

// =============================================================================
// RouteNames: nested folders — recursion through FolderNode.children
// =============================================================================

const nested = createMap(
    {
        admin: folder(
            {},
            {
                index: file({ name: 'adminHome' }),
                users: folder({}, { ':id': file({ name: 'adminUser' }) }),
            }
        ),
        login: file({ name: 'login' }),
    },
    { notFound: nf }
);

type _NestedName = Expect<
    Equal<Parameters<typeof nested.url>[0], 'adminHome' | 'adminUser' | 'login'>
>;

nested.url('adminHome');
nested.url('adminUser');

// @ts-expect-error — ':id' is a path pattern, not a route name
nested.url(':id');

// =============================================================================
// createRouter: generic state S and map R
// =============================================================================

interface AppState {
    isAuthed: boolean;
}

const router = createRouter<AppState, typeof flat>({
    resolveMap: ({ state }) => {
        type _StateInResolver = Expect<Equal<typeof state, AppState>>;
        return flat;
    },
    getState: () => ({ isAuthed: false }),
    adapter,
    dev: true,
});

// getState() returns AppState.
type _GetState = Expect<Equal<ReturnType<typeof router.getState>, AppState>>;

// url() narrows to route names from the map.
type _RouterUrlName = Expect<Equal<Parameters<typeof router.url>[0], 'login' | 'profile'>>;

router.url('login');
// @ts-expect-error — typo must not compile through router either
router.url('typo');

// =============================================================================
// subscribe: Snapshot-typed callback
// =============================================================================

const unsub = router.subscribe(snap => {
    type _SnapOk = Expect<Equal<typeof snap, Snapshot>>;
});
type _Unsub = Expect<Equal<typeof unsub, () => void>>;

// =============================================================================
// Fallback: unparameterized RouterMap accepts any string
// =============================================================================

declare const genericMap: RouterMap;
genericMap.url('anything');
genericMap.url('also-anything');
// (no @ts-expect-error — no route-name narrowing without inference)

// =============================================================================
// Snapshot.leaf narrows via isFile
// =============================================================================

declare const snap: Snapshot;
const leaf = snap.leaf;
if (isFile(leaf)) {
    type _LeafIsFile = Expect<Equal<typeof leaf, import('../src/types.js').FileNode>>;
    leaf.name;
}

// =============================================================================
// hasRoute: accepts any string (that's the point — validation helper)
// =============================================================================

import { hasRoute } from '../src/index.js';

const hasResult: boolean = hasRoute(flat, 'login');
type _HasRoute = Expect<Equal<typeof hasResult, boolean>>;

// hasRoute does NOT narrow route names.
hasRoute(flat, 'typo');
hasRoute(flat, 'anything');

// Use with active map from snapshot — primary pattern.
const activeMap = router.getSnapshot().map;
hasRoute(activeMap, 'login');

// =============================================================================
// Prevent "unused module" — keeps TS from treating this as a script
// =============================================================================

export {};
