/**
 * API client — thin wrapper around the FastAPI backend.
 * All calls gracefully degrade: if the backend is down, the app still works.
 */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5001";

/**
 * Call the backend health endpoint.
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: "GET" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Send a metric event to the backend (best-effort, no error throw).
 * Reconnected from: src/services/llm/metricsTracker.js events.
 */
export async function sendMetric(event) {
  try {
    await fetch(`${API_BASE}/api/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // Backend down — fine, metrics are already in localStorage
  }
}

/**
 * Fetch aggregated summary from the backend (if available).
 */
export async function fetchMetricsSummary() {
  try {
    const res = await fetch(`${API_BASE}/api/metrics/summary`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
