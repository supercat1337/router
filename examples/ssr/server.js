// server.js — plain Node.js HTTP, no Express, no bundler.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouter } from '@supercat1337/router';
import { createServerAdapter, serializeState } from '@supercat1337/router/ssr';
import { resolveMap, getState, loadData, renderView } from './shared.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const DIST = '/dist/'; // browser-facing path prefix

createServer(async (req, res) => {
    const url = req.url ?? '/';

    // Static: repo's own `dist/`...
    if (url.startsWith(DIST)) {
        const rel = url.slice(DIST.length);
        // Only serve `.esm.bundle.js` — self-contained, no external deps
        // to resolve in the browser. The non-bundled `.esm.js` imports
        // `@supercat1337/event-emitter`, which the import map would also
        // have to resolve. Bundle avoids that.
        if (!rel.endsWith('.esm.bundle.js')) {
            res.writeHead(404);
            return res.end('Not found');
        }
        return serveFile(res, join(HERE, '../../dist', rel));
    }

    // Static: example's own modules.
    if (url === '/client.js' || url === '/shared.js') {
        return serveFile(res, join(HERE, url.slice(1)));
    }

    // SSR render.
    try {
        // 1. Router with the server adapter — reads `req.url`, so the
        //    initial snapshot reflects the request, not '/'.
        const router = createRouter({
            resolveMap,
            getState,
            adapter: createServerAdapter(req),
            dev: true,
        });

        // 2. Initial snapshot — synchronous, matches the request URL.
        const snapshot = router.getSnapshot();

        // 3. Load data BEFORE render. `afterEnter` does not fire for the
        //    initial commit (documented in docs/ssr.md) — blocking is the
        //    only correct pattern for SSR. Same loader as the client uses.
        let data = null;
        try {
            data = await loadData(snapshot);
        } catch (e) {
            console.error('loadData failed:', e);
            // Render the page without data — `renderView` handles null.
        }

        // 4. Render + embed state. `serializeState` is XSS-safe.
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderHtml(snapshot, data));
    } catch (e) {
        console.error(e);
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Server error: ' + e.message);
    }
}).listen(PORT, () => {
    console.log(`SSR example → http://localhost:${PORT}/`);
    console.log(`Try: /users/1, /users/2, /about, /missing`);
});

function renderHtml(snapshot, data) {
    const state = getState();
    // The four fields `assertHydration` compares — serialized separately
    // so the client can run the dev check. In prod you can omit it.
    const serverSnapshot = serializeState({
        url: snapshot.url,
        status: snapshot.status,
        params: snapshot.params,
        search: snapshot.search,
    });
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>SSR Example</title>
    <script type="importmap">
    {
        "imports": {
            "@supercat1337/router": "/dist/router.esm.bundle.js",
            "@supercat1337/router/ssr": "/dist/ssr.esm.bundle.js",
            "@supercat1337/router/adapters": "/dist/adapters.esm.bundle.js",
            "@supercat1337/router/links": "/dist/links.esm.bundle.js"
        }
    }
    </script>
</head>
<body>
    <div id="app">${renderView(snapshot, data)}</div>
    <script>window.__INITIAL_STATE__ = ${serializeState(state)};</script>
    <script>window.__SERVER_SNAPSHOT__ = ${serverSnapshot};</script>
    <script type="module" src="/client.js"></script>
</body>
</html>`;
}

async function serveFile(res, filePath) {
    try {
        const content = await readFile(filePath, 'utf8');
        const isJs = /\.(?:js|mjs)$/.test(filePath);
        res.writeHead(200, {
            'content-type': isJs
                ? 'application/javascript; charset=utf-8'
                : 'text/plain; charset=utf-8',
        });
        res.end(content);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
}
