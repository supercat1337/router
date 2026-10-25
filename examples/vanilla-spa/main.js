// @ts-check

// Production-identical imports: bare specifiers. In a bundler project these
// resolve via package.json "exports"; in the browser they resolve via the
// import map in index.html. Same file, different resolution mechanism.
import { createMap, file, folder, createRouter, isFile } from '@supercat1337/router';
import { createPathAdapter } from '@supercat1337/router/adapters';
import { attachLinks } from '@supercat1337/router/links';

const BASE = '/examples/vanilla-spa/';
const notFound = () => null;

// Two independent maps. `/about` exists in both — same URL, different context.
// `/profile` exists only in `userMap` — a guest navigating there sees 404.
const guestMap = createMap(
    {
        login: file({ name: 'login', title: 'Login' }),
        register: file({ name: 'register', title: 'Register' }),
        about: file({ name: 'about', title: 'About' }),
    },
    { notFound }
);

const userMap = createMap(
    {
        login: file({ name: 'login', title: 'Login' }),
        about: file({ name: 'about', title: 'About' }),
        profile: folder(
            {
                index: file({ name: 'profile', title: 'Your profile' }),
                edit: file({ name: 'profileEdit', title: 'Edit profile' }),
            }
        ),
    },
    { notFound }
);

// State — plain data. `resolveMap` is a pure function of (state, url).
const appState = { authed: false };

const router = createRouter({
    resolveMap: ({ state }) => (state.authed ? userMap : guestMap),
    getState: () => appState,
    adapter: createPathAdapter({ base: BASE }),
});
attachLinks(router);

// Root elements must exist; if they don't, the app is broken — fail loud.
const viewEl = /** @type {HTMLElement} */ (document.getElementById('view'));
const authEl = /** @type {HTMLElement} */ (document.getElementById('auth'));
if (!viewEl || !authEl) throw new Error('missing #view or #auth in index.html');

/** @param {import('@supercat1337/router').Snapshot} snapshot */
function render(snapshot) {
    // Auth indicator — re-created each render; the listener is always fresh.
    authEl.innerHTML = appState.authed
        ? '<span class="badge">user</span><button id="logout">Logout</button>'
        : '<span class="badge">guest</span>';
    document.getElementById('logout')?.addEventListener('click', () => {
        appState.authed = false;
        // Recompute which map applies to the CURRENT URL, without navigating.
        // If we're on /profile, it becomes notFound — same URL, different meaning.
        router.revalidate();
    });

    if (snapshot.status === 'matched') {
        const leaf = snapshot.leaf;
        // `Node = FileNode | FolderNode`; only FileNode has `.name`. `isFile`
        // is a branded type guard (structural lookalikes don't pass).
        if (isFile(leaf) && leaf.name === 'login') {
            viewEl.innerHTML = `
        <h1>Login</h1>
        <p>You are browsing as a <strong>guest</strong>.</p>
        <p><code>/about</code> exists in both maps. <code>/profile</code> exists only in the user map.</p>
        <button id="do-login">Log in as demo user</button>`;
            document.getElementById('do-login')?.addEventListener('click', () => {
                appState.authed = true;
                router.navigate('/profile');
            });
            return;
        }
        // `MatchResult.search` — decoded query params. Available on both branches.
        // (`Snapshot` itself does not carry `search`; call `map.match` for it.)
        const match = snapshot.map.match(snapshot.url);
        const title = isFile(leaf) ? (leaf.title ?? leaf.name) : snapshot.url;
        viewEl.innerHTML = `
      <h1>${title}</h1>
      <pre>${JSON.stringify(
          {
              url: snapshot.url,
              name: isFile(leaf) ? leaf.name : undefined,
              params: snapshot.params,
              search: match.search,
          },
          null,
          2
      )}</pre>`;
        return;
    }

    if (snapshot.status === 'notFound') {
        if (snapshot.url === '/') {
            viewEl.innerHTML = `
        <h1>@supercat1337/router — vanilla SPA</h1>
        <p>Two maps, one URL namespace. <code>/about</code> exists in both; <code>/profile</code> only in the user map.</p>
        <p>Try the nav above, or <a href="${BASE}login" data-router-link>log in</a>.</p>`;
            return;
        }
        viewEl.innerHTML = `
      <h1>404</h1>
      <p>No match for <code>${snapshot.url}</code> in the <strong>${appState.authed ? 'user' : 'guest'}</strong> map.</p>`;
        return;
    }

    viewEl.innerHTML = `<h1>Error</h1><pre>${JSON.stringify(snapshot.error, null, 2)}</pre>`;
}

// `subscribe` does NOT fire for the initial commit (it happens inside
// `createRouter`, before this line runs). Render it explicitly first.
render(router.getSnapshot());

// Every subsequent commit: navigate, replace, revalidate, prod error snapshots.
router.subscribe(render);
