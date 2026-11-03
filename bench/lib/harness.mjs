// bench/lib/harness.mjs
//
// Minimal benchmark harness: warmup -> N runs -> median.
// `fn` must return a number — the accumulator prevents V8 DCE
// (dead code elimination) from removing the loop body.

/**
 * @param {string} label
 * @param {(i: number) => number} fn
 * @param {{ iterations?: number, warmup?: number, runs?: number }} [opts]
 */
export function bench(label, fn, opts = {}) {
    const iterations = opts.iterations ?? 100_000;
    const warmup = opts.warmup ?? Math.min(10_000, iterations);
    const runs = opts.runs ?? 5;

    // Sink: accumulator that prevents DCE. Kept live via a final check.
    let sink = 0;

    for (let i = 0; i < warmup; i++) sink += fn(i);

    /** @type {number[]} */
    const times = [];
    for (let r = 0; r < runs; r++) {
        const start = performance.now();
        for (let i = 0; i < iterations; i++) sink += fn(i);
        times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];

    // Prevent DCE of the whole measurement loop.
    if (sink === Number.MIN_SAFE_INTEGER) {
        console.error('unreachable');
    }

    return {
        label,
        iterations,
        runs,
        medianMs: median,
        minMs: times[0],
        nsPerOp: (median * 1e6) / iterations,
        opsPerSec: (iterations * 1000) / median,
    };
}

/** @param {number} ns */
export function fmtNs(ns) {
    if (ns < 1_000) return `${ns.toFixed(0)} ns`;
    if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`;
    return `${(ns / 1_000_000).toFixed(2)} ms`;
}

/** @param {number} n */
export function fmtOps(n) {
    if (n < 1_000) return `${n.toFixed(0)}`;
    if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
    return `${(n / 1_000_000).toFixed(2)}M`;
}
