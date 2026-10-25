// @ts-check

import { createMap, createRouter, file, folder } from '../src/index.js';
import type { RouterMap, UrlAdapter } from '../src/index.js';

type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

declare const nf: (ctx: { url: string; chain: readonly unknown[] }) => unknown;
declare const adapter: UrlAdapter;

const map = createMap(
    {
        login: file({ name: 'login' }),
        users: folder({
            ':id': file({ name: 'user' }),
        }),
    },
    { notFound: nf }
);

// =============================================================================
// map.url: typed params
// =============================================================================

map.url('login'); // OK — no params
map.url('user', { id: '5' }); // OK — required param present

// @ts-expect-error — missing 'id' param
map.url('user');

// @ts-expect-error — missing 'id' param
map.url('user', {});

// @ts-expect-error — unknown param 'idd' (excess property check on literal)
map.url('user', { idd: '5' });

// @ts-expect-error — wrong type for 'id' (must be string)
map.url('user', { id: 42 });

// OK — extra params allowed through a variable (structural assignability).
// `id` is guaranteed, `extra` is allowed; only object literals trigger
// excess property check, so the extra key survives here.
const widened: { id: string; extra: string } = { id: '5', extra: 'x' };
map.url('user', widened);
// @ts-expect-error — Record<string, string> does not guarantee `id`
map.url('user', /** @type {Record<string, string>} */ {});

// NOTE — `Record<string, string>` is *not* assignable to `{ id: string }`:
// it does not guarantee `id` is present. If you have a bare `Record`,
// cast it: `map.url('user', rec as { id: string })`.

// OK — for a no-param route, any Record is accepted (runtime ignores extra).
map.url('login', { anything: 'x' });

// =============================================================================
// map.route: typed handle
// =============================================================================

const userRoute = map.route('user');

type _Name = Expect<Equal<typeof userRoute.name, 'user'>>;
type _Params = Expect<Equal<typeof userRoute.params, readonly 'id'[]>>;

userRoute.url({ id: '5' }); // OK

// @ts-expect-error — missing 'id'
userRoute.url();

// @ts-expect-error — missing 'id'
userRoute.url({});

// @ts-expect-error — unknown param 'idd'
userRoute.url({ idd: '5' });

// @ts-expect-error — wrong type for 'id'
userRoute.url({ id: 42 });

const loginRoute = map.route('login');

type _LoginName = Expect<Equal<typeof loginRoute.name, 'login'>>;
type _LoginParams = Expect<Equal<typeof loginRoute.params, readonly never[]>>;

loginRoute.url(); // OK
loginRoute.url({ anything: 'x' }); // OK — Record is allowed for empty params

// =============================================================================
// router.url: typed params through the active map
// =============================================================================

const router = createRouter<{}, typeof map>({
    resolveMap: () => map,
    getState: () => ({}),
    adapter,
    dev: true,
});

router.url('user', { id: '5' }); // OK

// @ts-expect-error — missing 'id'
router.url('user');

// @ts-expect-error — unknown param 'idd'
router.url('user', { idd: '5' });

// =============================================================================
// router.route: typed handle from the active map
// =============================================================================

const routerUserRoute = router.route('user');
type _RouterRouteName = Expect<Equal<typeof routerUserRoute.name, 'user'>>;
routerUserRoute.url({ id: '5' }); // OK
// @ts-expect-error — unknown param 'idd'
routerUserRoute.url({ idd: '5' });

// =============================================================================
// fallback: unparameterized RouterMap → Record<string, string>
// =============================================================================

declare const genericMap: RouterMap;
genericMap.url('anything'); // OK — no narrowing
genericMap.url('anything', { x: '1' }); // OK
genericMap.route('anything').url({ any: 'thing' }); // OK

// =============================================================================
// negative: route name from another map is rejected
// =============================================================================

const otherMap = createMap({ settings: file({ name: 'settings' }) }, { notFound: nf });

otherMap.url('settings'); // OK
// @ts-expect-error — 'user' is not a route in otherMap
otherMap.url('user');

export {};
