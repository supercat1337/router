import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(repoRoot, 'markdown-link-check.config.json');
const require = createRequire(import.meta.url);

// `--list` — только показать файлы, без запуска проверки.
// Остальные аргументы пробрасываются в markdown-link-check (--quiet, --verbose, …).
const rawArgs = process.argv.slice(2);
const listOnly = rawArgs.includes('--list');
const passThrough = rawArgs.filter(a => a !== '--list');
const sep = '─'.repeat(70);

// ── Header ────────────────────────────────────────────────────────────────
console.log(sep);
console.log('check-links');
console.log(sep);
console.log(`Repo:     ${repoRoot}`);
console.log(`Config:   ${existsSync(configPath) ? configPath : '(not found — using defaults)'}`);
console.log(`Mode:     ${listOnly ? 'list only' : 'check'}`);

// ── Locate markdown-link-check ────────────────────────────────────────────
/**
 * Найти исполняемый JS-файл markdown-link-check. Не используем `.cmd`-шим:
 * Node 18.20.2+ / 20.12.2+ / 21.7.3+ запрещает spawnSync на `.cmd` без shell.
 *
 * Порядок стратегий:
 *   1. package.json → bin field (самый надёжный)
 *   2. require.resolve по прямому пути
 *   3. конвенциональный путь node_modules/...
 */
function resolveMlcScript() {
    try {
        const pkgPath = require.resolve('markdown-link-check/package.json');
        const pkg = require(pkgPath);
        const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['markdown-link-check'];
        if (bin) {
            const candidate = join(dirname(pkgPath), bin);
            if (existsSync(candidate)) return candidate;
        }
    } catch { /* not installed via require.resolve */ }

    try {
        const candidate = require.resolve('markdown-link-check/markdown-link-check');
        if (existsSync(candidate)) return candidate;
    } catch { /* exports field blocked the path, or not installed */ }

    const conventional = join(repoRoot, 'node_modules', 'markdown-link-check', 'markdown-link-check');
    if (existsSync(conventional)) return conventional;

    return null;
}

const mlcScript = resolveMlcScript();

if (!mlcScript) {
    console.error();
    console.error('✗ markdown-link-check not found.');
    console.error('  Install it as a dev dependency:');
    console.error('    npm install -D markdown-link-check');
    console.error();
    console.error('  (Do not rely on `npx` — on Windows, spawnSync cannot invoke');
    console.error('   .cmd shims without `shell: true`, and quoting breaks on paths');
    console.error('   with spaces. Calling the JS script directly via `node` is');
    console.error('   the reliable way. See CVE-2024-27980 for the Node change.)');
    process.exit(1);
}

console.log(`Mlc:      ${mlcScript}`);
if (passThrough.length > 0) {
    console.log(`Extra:    ${passThrough.join(' ')}`);
}

// ── Discover ──────────────────────────────────────────────────────────────
const files = [];
for await (const f of glob('{docs/**/*.md,README.md,AGENTS.md}', { cwd: repoRoot })) {
    files.push(f);
}
files.sort();

if (files.length === 0) {
    console.error('\n✗ No markdown files found. Check the glob pattern.');
    process.exit(1);
}

console.log(`\nFiles (${files.length}):`);
for (const f of files) {
    console.log(`  • ${f}`);
}

if (listOnly) {
    console.log('\n(list only — no checks run)');
    process.exit(0);
}

// ── Run ───────────────────────────────────────────────────────────────────
const args = [mlcScript];
if (existsSync(configPath)) {
    args.push('-c', configPath);
}
args.push(...passThrough, ...files);

console.log();
console.log(sep);
console.log(`Running: ${process.execPath} ${args.join(' ')}`);
console.log(sep);
console.log();

const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: repoRoot });

// ── Summary ───────────────────────────────────────────────────────────────
console.log();
console.log(sep);
if (result.error) {
    console.error(`✗ Failed to launch markdown-link-check: ${result.error.message}`);
    process.exit(1);
}
if (result.status === 0) {
    console.log(`✓ All ${files.length} file(s) passed — no dead links.`);
} else {
    console.error(`✗ Dead links found in one or more files (exit code ${result.status}).`);
    console.error(`  ${files.length} file(s) processed. Review the per-file output above.`);
    console.error('  To silence known false positives, add them to markdown-link-check.config.json.');
}
console.log(sep);

process.exit(result.status ?? 1);