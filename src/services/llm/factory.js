/**
 * LLM Provider Factory — Multi-provider failover layer.
 *
 * This is the ONLY module the app should import AI functions from.
 *
 * Design contract:
 *   - Providers THROW on failure (see providers/gemini.js for rationale).
 *   - The factory decides: retry next provider, or return a safe fallback.
 *   - The app NEVER sees a thrown error from an AI call — it always gets a
 *     valid plan-shaped object, so the UI can render unconditionally.
 *   - Every response carries `provider` ("Gemini" | "Groq" | "Fallback") and
 *     `usedFallback` so the UI (and the eval harness) can tell real inference
 *     apart from a degraded response.
 *
 * Failover triggers on: quota / 429 / 5xx / timeout / network / empty
 * response. It does NOT trigger on malformed JSON or a missing API key —
 * those are contract/config bugs, and retrying hides them.
 *
 * @module services/llm/factory
 */

import { geminiProvider, ProviderError } from "./providers/gemini.js";
import { groqProvider } from "./providers/groq.js";

/** Ordered by preference. First configured + working provider wins. */
const PROVIDER_CHAIN = [geminiProvider, groqProvider];

// --- Fallback payloads (shape-identical to real provider output) ---
const FALLBACK_PLAN = {
    confidenceScore: 60,
    riskLevel: "Moderate",
    riskReason: "FlowMind AI is offline right now, so this is a baseline plan.",
    agentMessage: "I've structured a baseline execution plan for you. Start with the urgent items and update me when AI is back.",
    todayPlan: ["Review your most urgent deliverable", "Clear one pending assignment"],
    upcomingTasks: ["Prep for your next milestone"],
    deadlineAnalysis: { mostUrgentTask: "Your most urgent deliverable", daysRemaining: 1 },
    recommendedFocus: "Complete basic deliverables first",
    estimatedHoursNeeded: 3,
    strictlyDoToday: ["Your most urgent deliverable"],
    postponeTomorrow: ["Secondary readings"],
    dropCancel: ["Low-value distractions"]
};

const FALLBACK_SMD = (availableHours) => ({
    strictlyDoToday: [
        { task: "Your most critical task", hours: Math.max(1, availableHours || 1), reason: "Highest impact on your deadline." }
    ],
    postponeTomorrow: [{ task: "Remaining pending items", reason: "Not enough hours left today." }],
    dropCancel: [],
    confidenceMessage: `AI triage is offline. Focus entirely on your single most critical task for the next ${availableHours || 1} hours.`
});

const FALLBACK_ANALYSIS = (currentPlan) => ({
    confidenceScore: currentPlan?.confidenceScore || 50,
    riskLevel: currentPlan?.riskLevel || "Moderate",
    riskReason: "AI analysis is offline. Showing your last known metrics.",
    agentMessage: "Live analysis is unavailable right now, but don't let it stop your progress."
});

// --- Runtime observability (consumed by Plan 2's metrics tracker) ---
const listeners = new Set();

/** Subscribe to per-request provider events. Returns an unsubscribe fn. */
export function onProviderEvent(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

const emit = (event) => {
    listeners.forEach((fn) => {
        try {
            fn(event);
        } catch (err) {
            console.warn("Provider event listener threw:", err);
        }
    });
};

// --- Schema validation: treat LLM output as untrusted ---

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const clampScore = (v, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, Math.round(n)));
};
const toObjectArray = (v) => (Array.isArray(v) ? v.filter((i) => i && isNonEmptyString(i.task)) : []);

/**
 * Validate + normalize a provider's plan payload.
 * Returns `{ ok, value, errors }`. Never throws — repairs what it can, rejects the rest.
 */
export function validatePlan(raw) {
    if (!raw || typeof raw !== "object") return { ok: false, value: raw, errors: ["payload_not_object"] };

    const errors = [];
    const norm = { ...raw };

    norm.confidenceScore = clampScore(raw.confidenceScore, 60);
    if (!isNonEmptyString(raw.riskLevel)) {
        norm.riskLevel = "Moderate";
        errors.push("riskLevel_defaulted");
    }
    if (!isNonEmptyString(raw.riskReason)) {
        norm.riskReason = "No risk detail provided.";
        errors.push("riskReason_defaulted");
    }
    if (!isNonEmptyString(raw.agentMessage)) {
        norm.agentMessage = "Stay on today's plan and protect your focus.";
        errors.push("agentMessage_defaulted");
    }

    for (const field of ["todayPlan", "upcomingTasks", "strictlyDoToday", "postponeTomorrow", "dropCancel"]) {
        // Repair rather than reject: strip blank/non-string entries, keep the rest.
        if (Array.isArray(raw[field])) {
            const cleaned = raw[field].filter(isNonEmptyString);
            norm[field] = cleaned;
            if (cleaned.length !== raw[field].length) errors.push(`${field}_cleaned`);
        } else {
            norm[field] = [];
            errors.push(`${field}_invalid`);
        }
    }

    // A plan with no actionable tasks is useless downstream.
    if (norm.todayPlan.length === 0) {
        errors.push("todayPlan_empty");
        // Ensure estimatedHoursNeeded is normalized even for empty plan
        const hours = Number(raw.estimatedHoursNeeded);
        norm.estimatedHoursNeeded = Number.isFinite(hours) && hours > 0 ? Math.round(hours) : 0;
        return { ok: false, value: norm, errors };
    }

    if (
        raw.deadlineAnalysis &&
        typeof raw.deadlineAnalysis === "object" &&
        isNonEmptyString(raw.deadlineAnalysis.mostUrgentTask)
    ) {
        const days = Number(raw.deadlineAnalysis.daysRemaining);
        norm.deadlineAnalysis = {
            mostUrgentTask: raw.deadlineAnalysis.mostUrgentTask,
            daysRemaining: Number.isFinite(days) ? Math.max(0, Math.round(days)) : 1
        };
    } else {
        norm.deadlineAnalysis = { mostUrgentTask: norm.todayPlan[0], daysRemaining: 1 };
        errors.push("deadlineAnalysis_defaulted");
    }

    if (!isNonEmptyString(raw.recommendedFocus)) {
        norm.recommendedFocus = norm.todayPlan[0];
        errors.push("recommendedFocus_defaulted");
    }
    const hours = Number(raw.estimatedHoursNeeded);
    norm.estimatedHoursNeeded = Number.isFinite(hours) && hours > 0 ? Math.round(hours) : norm.todayPlan.length * 1;

    return { ok: errors.filter((e) => !e.endsWith("_defaulted")).length === 0, value: norm, errors };
}

export function validateSaveMyDay(raw) {
    if (!raw || typeof raw !== "object") return { ok: false, value: raw, errors: ["payload_not_object"] };
    const errors = [];
    const norm = { ...raw };

    for (const field of ["strictlyDoToday", "postponeTomorrow", "dropCancel"]) {
        const arr = toObjectArray(raw[field]);
        if (!Array.isArray(raw[field])) errors.push(`${field}_invalid`);
        norm[field] = arr;
    }
    norm.strictlyDoToday = norm.strictlyDoToday.map((item) => ({
        ...item,
        hours: Number.isFinite(Number(item.hours)) ? Number(item.hours) : 1
    }));
    if (!isNonEmptyString(raw.confidenceMessage)) {
        norm.confidenceMessage = "Focus on your highest-impact task first.";
        errors.push("confidenceMessage_defaulted");
    }
    if (norm.strictlyDoToday.length === 0) {
        errors.push("strictlyDoToday_empty");
        return { ok: false, value: norm, errors };
    }
    return { ok: errors.length === 0, value: norm, errors };
}

export function validateAnalysis(raw) {
    if (!raw || typeof raw !== "object") return { ok: false, value: raw, errors: ["payload_not_object"] };
    const errors = [];
    const norm = { ...raw };
    norm.confidenceScore = clampScore(raw.confidenceScore, 50);
    if (!isNonEmptyString(raw.riskLevel)) {
        norm.riskLevel = "Moderate";
        errors.push("riskLevel_defaulted");
    }
    if (!isNonEmptyString(raw.riskReason)) {
        norm.riskReason = "Live risk detail unavailable.";
        errors.push("riskReason_defaulted");
    }
    if (!isNonEmptyString(raw.agentMessage)) {
        norm.agentMessage = "Keep executing — momentum matters more than perfect analysis.";
        errors.push("agentMessage_defaulted");
    }
    return { ok: errors.length === 0, value: norm, errors };
}

const VALIDATORS = {
    generatePlan: validatePlan,
    generateSaveMyDay: validateSaveMyDay,
    recalculateAnalysis: validateAnalysis
};

/**
 * Run a method across the provider chain with failover, then validate.
 */
async function runWithFailover(methodName, context, ...args) {
    const startedAt = performance.now();
    const attempts = [];

    for (const provider of PROVIDER_CHAIN) {
        const method = provider[methodName];
        if (typeof method !== "function") continue;

        // Skip a provider that has no credentials
        if (typeof provider.isConfigured === "function" && !provider.isConfigured()) {
            attempts.push({ provider: provider.name, outcome: "skipped_not_configured" });
            emit({ type: "provider_skipped", provider: provider.name, method: methodName });
            continue;
        }

        const attemptStart = performance.now();
        try {
            const raw = await method.apply(provider, args);
            const latencyMs = Math.round(performance.now() - attemptStart);

            const { ok, value, errors } = VALIDATORS[methodName](raw);
            if (!ok) {
                attempts.push({ provider: provider.name, outcome: "schema_invalid", latencyMs, errors });
                emit({ type: "provider_invalid", provider: provider.name, method: methodName, errors, latencyMs });
                break;
            }

            attempts.push({ provider: provider.name, outcome: "success", latencyMs });
            emit({
                type: "request_complete",
                method: methodName,
                provider: provider.name,
                latencyMs: Math.round(performance.now() - startedAt),
                attemptLatencyMs: latencyMs,
                attempts,
                usedFallback: false
            });
            return { ...value, provider: provider.name, usedFallback: false, attempts };
        } catch (error) {
            const latencyMs = Math.round(performance.now() - attemptStart);
            const retryable = error instanceof ProviderError ? error.retryable : true;

            attempts.push({
                provider: provider.name,
                outcome: "error",
                latencyMs,
                status: error?.status ?? null,
                retryable,
                message: error?.message || String(error)
            });
            emit({
                type: "provider_error",
                provider: provider.name,
                method: methodName,
                status: error?.status ?? null,
                retryable,
                latencyMs,
                message: error?.message || String(error)
            });

            if (!retryable) break;
        }
    }

    const fallback = context.buildFallback();
    emit({
        type: "request_complete",
        method: methodName,
        provider: "Fallback",
        latencyMs: Math.round(performance.now() - startedAt),
        attempts,
        usedFallback: true
    });
    return { ...fallback, provider: "Fallback", usedFallback: true, attempts };
}

// --- Public API (same signatures the UI already uses) ---

export function generatePlan(promptUserContext) {
    return runWithFailover("generatePlan", { buildFallback: () => FALLBACK_PLAN }, promptUserContext);
}

export function generateSaveMyDay(availableHours, currentPlan) {
    return runWithFailover(
        "generateSaveMyDay",
        { buildFallback: () => FALLBACK_SMD(availableHours) },
        availableHours,
        currentPlan
    );
}

export function recalculateAnalysis(completedTasks, remainingTasks, currentPlan) {
    return runWithFailover(
        "recalculateAnalysis",
        { buildFallback: () => FALLBACK_ANALYSIS(currentPlan) },
        completedTasks,
        remainingTasks,
        currentPlan
    );
}

/** Which providers have credentials — used by the Settings page. */
export function getProviderStatus() {
    return PROVIDER_CHAIN.map((p) => ({
        name: p.name,
        model: p.model,
        configured: typeof p.isConfigured === "function" ? p.isConfigured() : true
    }));
}

export { geminiProvider, groqProvider };

// --- Test helpers (stripped in prod builds via tree-shaking) ---

const _originalChain = [...PROVIDER_CHAIN];

/** Replace the provider chain (for testing only). */
export function setProviderChain(newChain) {
    PROVIDER_CHAIN.length = 0;
    PROVIDER_CHAIN.push(...newChain);
}

/** Restore the real providers (for testing only). */
export function restoreProviderChain() {
    PROVIDER_CHAIN.length = 0;
    PROVIDER_CHAIN.push(..._originalChain);
}

export { runWithFailover };

// --- Auto-record metrics (browser only, safe no-op in Node) ---
try {
    if (typeof localStorage !== "undefined" && typeof window !== "undefined") {
        const { recordRequest } = await import("./metricsTracker.js");
        onProviderEvent((event) => {
            if (event.type === "request_complete") {
                recordRequest({
                    method: event.method,
                    provider: event.provider,
                    latencyMs: event.latencyMs,
                    usedFallback: event.usedFallback,
                    outcome: event.usedFallback ? "fallback" : "success"
                });
            }
        });
    }
} catch { /* metrics tracker not available, fine */ }
