/**
 * Evaluation Metrics Tracker
 *
 * Stores per-request and aggregated metrics in localStorage.
 * Consumed by the evaluator and exposed via onProviderEvent().
 *
 * @module services/llm/metricsTracker
 */

const STORAGE_KEY = "flowmind_eval_metrics";
const MAX_ENTRIES = 500;

/**
 * Load all stored metrics from localStorage.
 */
export function loadMetrics() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : { entries: [], aggregated: null };
    } catch {
        return { entries: [], aggregated: null };
    }
}

/**
 * Save a single request metric entry.
 */
export function recordRequest(entry) {
    const metrics = loadMetrics();
    metrics.entries.push({
        ...entry,
        timestamp: new Date().toISOString()
    });
    // Trim oldest if over limit
    if (metrics.entries.length > MAX_ENTRIES) {
        metrics.entries = metrics.entries.slice(-MAX_ENTRIES);
    }
    metrics.aggregated = computeAggregated(metrics.entries);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
    } catch (e) {
        console.warn("Failed to persist eval metrics:", e);
    }
    return metrics.aggregated;
}

/**
 * Compute aggregated stats from raw entries.
 */
export function computeAggregated(entries) {
    if (!entries || entries.length === 0) {
        return {
            totalRequests: 0,
            successRate: 0,
            fallbackRate: 0,
            avgLatencyMs: 0,
            p50LatencyMs: 0,
            p95LatencyMs: 0,
            schemaValidityRate: 0,
            providerBreakdown: {},
            lastUpdated: null
        };
    }

    const total = entries.length;
    const successes = entries.filter((e) => e.outcome === "success").length;
    const fallbacks = entries.filter((e) => e.usedFallback === true).length;
    const schemaValid = entries.filter((e) => e.schemaValid !== false).length;

    const latencies = entries
        .map((e) => e.latencyMs)
        .filter((l) => typeof l === "number" && l > 0)
        .sort((a, b) => a - b);

    const avgLatency = latencies.length > 0
        ? Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length)
        : 0;

    const p50 = latencies.length > 0
        ? latencies[Math.floor(latencies.length * 0.5)]
        : 0;

    const p95 = latencies.length > 0
        ? latencies[Math.floor(latencies.length * 0.95)]
        : 0;

    // Provider breakdown
    const breakdown = {};
    entries.forEach((e) => {
        const p = e.provider || "Unknown";
        if (!breakdown[p]) breakdown[p] = { count: 0, successes: 0, failures: 0, avgLatencyMs: 0, latencies: [] };
        breakdown[p].count++;
        if (e.outcome === "success") breakdown[p].successes++;
        if (e.outcome === "error") breakdown[p].failures++;
        if (e.latencyMs > 0) breakdown[p].latencies.push(e.latencyMs);
    });
    // Compute avg per provider
    Object.values(breakdown).forEach((b) => {
        b.avgLatencyMs = b.latencies.length > 0
            ? Math.round(b.latencies.reduce((s, l) => s + l, 0) / b.latencies.length)
            : 0;
        delete b.latencies; // Don't store raw arrays in aggregation
    });

    return {
        totalRequests: total,
        successRate: Math.round((successes / total) * 100),
        fallbackRate: Math.round((fallbacks / total) * 100),
        avgLatencyMs: avgLatency,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        schemaValidityRate: Math.round((schemaValid / total) * 100),
        providerBreakdown: breakdown,
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Clear all stored metrics.
 */
export function clearMetrics() {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export metrics as downloadable JSON.
 */
export function exportMetrics() {
    const metrics = loadMetrics();
    const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowmind-metrics-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}